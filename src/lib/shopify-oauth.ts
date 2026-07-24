import crypto from "crypto";

// Scopes de solo lectura. OJO: `read_orders` limita las órdenes a los
// últimos 60 días. Para el histórico completo hay que agregar
// `read_all_orders`, pero ese scope PRIMERO tiene que ser aprobado por
// Shopify (Partner Dashboard > la app > API access > Read all orders >
// Request access). Si se agrega acá antes de la aprobación, el authorize
// falla con scope inválido — por eso queda comentado hasta entonces.
// Tras la aprobación: agregar ",read_all_orders" y reconectar la tienda.
const SCOPES = "read_products,read_inventory,read_orders";

export function normalizeShopDomain(input: string): string {
  const trimmed = input.trim().toLowerCase();
  return trimmed.includes(".myshopify.com") ? trimmed : `${trimmed}.myshopify.com`;
}

/** Valida que el shop domain tenga la forma esperada (defensa básica antes
 * de usarlo para construir URLs — Shopify también lo valida en su punta). */
export function isValidShopDomain(domain: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain);
}

export function buildAuthorizeUrl(shopDomain: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY!,
    scope: SCOPES,
    redirect_uri: process.env.SHOPIFY_REDIRECT_URI!,
    state,
    // Sin grant_options[]=per-user => token offline (no expira). Es lo que
    // queremos para un sync diario sin usuario logueado.
  });
  return `https://${shopDomain}/admin/oauth/authorize?${params.toString()}`;
}

/**
 * Verifica que el callback venga realmente de Shopify: recalcula el HMAC
 * sobre los query params (excluyendo hmac y signature) con el API secret y
 * lo compara en tiempo constante. Ver:
 * https://shopify.dev/docs/apps/build/authentication-authorization/oauth/get-access-tokens/authorization-code-grant
 */
export function verifyShopifyHmac(searchParams: URLSearchParams): boolean {
  const providedHmac = searchParams.get("hmac");
  if (!providedHmac) return false;

  const pairs: string[] = [];
  for (const [key, value] of searchParams.entries()) {
    if (key === "hmac" || key === "signature") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const message = pairs.join("&");

  const computedHmac = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET!)
    .update(message)
    .digest("hex");

  const a = Buffer.from(computedHmac);
  const b = Buffer.from(providedHmac);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

interface AccessTokenResponse {
  access_token: string;
  scope: string;
}

/** Cambia el authorization code (válido ~60 segundos, un solo uso) por un
 * access token offline permanente. */
export async function exchangeCodeForToken(shopDomain: string, code: string): Promise<string> {
  const res = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`No se pudo intercambiar el code por un access token (status ${res.status}): ${body}`);
  }

  const data = (await res.json()) as AccessTokenResponse;
  return data.access_token;
}

import type { SupabaseClient } from "@supabase/supabase-js";

// Envío de eventos a la Meta Conversions API (server-side) desde /q/[slug]
// -- para campañas de Meta Ads donde el link corto va directo al destino
// (ej. Spotify), sin página intermedia donde el Pixel de navegador pudiera
// dispararse. Todo esto corre dentro de un after() del redirect: si Meta
// no responde o rechaza el evento, NUNCA debe afectar al usuario real que
// solo quiere llegar a su destino -- por eso cada función atrapa sus
// propios errores y devuelve un resultado, nunca lanza.

const GRAPH_API_VERSION = "v21.0";

export interface MetaCapiConfig {
  pixelId: string;
  accessToken: string;
}

// El pixel/token es por proyecto (cada artista puede tener su propia
// cuenta publicitaria/Business Manager) -- se guarda en artist_integrations
// con platform='meta_capi', mismo patrón que platform='instagram' para el
// OAuth de Meta. Sin fila para el proyecto (o incompleta), cae a las env
// vars globales META_PIXEL_ID/META_CAPI_TOKEN -- así un proyecto nuevo
// funciona de inmediato con un pixel compartido, y se le puede dar uno
// propio después sin tocar código.
export async function resolveMetaCapiConfig(
  supabase: SupabaseClient,
  organizationId: string,
  projectId: string
): Promise<MetaCapiConfig | null> {
  const { data } = await supabase
    .from("artist_integrations")
    .select("account_id, access_token")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .eq("platform", "meta_capi")
    .maybeSingle();

  const pixelId = data?.account_id || process.env.META_PIXEL_ID || "";
  const accessToken = data?.access_token || process.env.META_CAPI_TOKEN || "";

  if (!pixelId || !accessToken) return null;
  return { pixelId, accessToken };
}

// Formato exacto que espera Meta para el parámetro fbc quando se deriva de
// un fbclid recién visto (no de la cookie _fbc, que ya viene en este
// formato si el Pixel del navegador alcanzó a correr antes). Ver:
// https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc
export function buildFbc(fbclid: string | null, existingFbcCookie: string | null): string | null {
  if (existingFbcCookie) return existingFbcCookie;
  if (!fbclid) return null;
  return `fb.1.${Date.now()}.${fbclid}`;
}

// Mismo criterio que fetchWithTimeout en meta-sync.ts (fetch nativo no
// tiene timeout por defecto) -- copiado acá en vez de importado porque esa
// función es privada del módulo de sync y este caso es fire-and-forget
// desde un contexto totalmente distinto (redirect público, no un cron).
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface SendCapiEventParams {
  config: MetaCapiConfig;
  eventName: string;
  eventId: string;
  eventSourceUrl: string;
  clientIpAddress: string | null;
  clientUserAgent: string | null;
  fbc: string | null;
  fbp: string | null;
  testEventCode?: string;
}

// Manda UN evento a la Conversions API. IP y user-agent van en claro (no
// hasheados) -- así lo espera Meta para client_ip_address/client_user_agent,
// a diferencia de email/teléfono que sí requieren hash. Devuelve siempre un
// resultado (nunca lanza) para que el caller pueda guardarlo en
// qr_scans.meta_capi_response sin un try/catch propio.
export async function sendMetaCapiEvent(
  params: SendCapiEventParams
): Promise<{ ok: boolean; status?: number; body?: unknown; error?: string }> {
  const { config, eventName, eventId, eventSourceUrl, clientIpAddress, clientUserAgent, fbc, fbp, testEventCode } = params;

  const userData: Record<string, string> = {};
  if (clientIpAddress) userData.client_ip_address = clientIpAddress;
  if (clientUserAgent) userData.client_user_agent = clientUserAgent;
  if (fbc) userData.fbc = fbc;
  if (fbp) userData.fbp = fbp;

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "website",
        event_source_url: eventSourceUrl,
        user_data: userData,
      },
    ],
  };
  if (testEventCode) payload.test_event_code = testEventCode;

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${config.pixelId}/events?access_token=${encodeURIComponent(config.accessToken)}`;

  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

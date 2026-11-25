import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { resolveAuthContext } from "@/lib/supabase-server";

// Autenticacion del servidor MCP (/api/mcp). A diferencia de la web (cookies),
// aca la identidad llega como token Bearer emitido por el servidor OAuth 2.1
// de Supabase Auth: cada persona conecta Claude con SU cuenta de Artist Pro y
// el token la representa a ella. Las consultas se hacen con ese mismo token,
// asi que RLS aplica igual que en la web.

export interface McpContext {
  supabase: SupabaseClient;
  user: User;
  orgId: string;
  allowedProjectIds: string[];
  /** Origen publico de la app, para armar links a las tareas. */
  origin: string;
}

export type McpAuthResult =
  | { ok: true; context: McpContext }
  | { ok: false; status: 401 | 403; reason: "missing_token" | "invalid_token" | "forbidden"; message: string };

/**
 * Origen publico con el que el cliente llego a la app. Detras del proxy de
 * Railway `request.url` trae el host interno, por eso se priorizan los
 * encabezados `x-forwarded-*`.
 */
export function getPublicOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const proto = forwardedProto ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}

/** Emisor de los tokens: el servidor de autorizacion es Supabase Auth. */
export function getAuthorizationServerIssuer(): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/+$/, "")}/auth/v1`;
}

export function getResourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource/api/mcp`;
}

export async function authenticateMcpRequest(request: Request): Promise<McpAuthResult> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    return { ok: false, status: 401, reason: "missing_token", message: "Falta el token de acceso" };
  }
  const token = match[1].trim();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    }
  );

  // getUser(token) valida el token contra Supabase Auth (firma, vencimiento
  // y que la sesion siga viva), no solo lo decodifica.
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, status: 401, reason: "invalid_token", message: "Token invalido o vencido" };
  }

  const ctx = await resolveAuthContext(supabase, data.user);
  if (ctx.error || !ctx.user || !ctx.orgId) {
    return {
      ok: false,
      status: 403,
      reason: "forbidden",
      message: "Tu cuenta no tiene acceso activo a Artist Pro",
    };
  }

  return {
    ok: true,
    context: {
      supabase,
      user: ctx.user,
      orgId: ctx.orgId,
      allowedProjectIds: ctx.allowedProjectIds ?? [],
      origin: getPublicOrigin(request),
    },
  };
}

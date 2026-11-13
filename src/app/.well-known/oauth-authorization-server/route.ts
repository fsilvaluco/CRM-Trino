import { NextResponse } from "next/server";
import { getAuthorizationServerIssuer } from "@/lib/mcp/auth";

// Compatibilidad con clientes MCP antiguos, que buscan los metadatos del
// servidor de autorizacion en el mismo dominio del servidor MCP en vez de
// leer primero /.well-known/oauth-protected-resource. Se reenvian tal cual
// los de Supabase Auth, que es el servidor de autorizacion real.

export const dynamic = "force-dynamic";

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };

export async function GET() {
  const issuer = new URL(getAuthorizationServerIssuer());
  const metadataUrl = `${issuer.origin}/.well-known/oauth-authorization-server${issuer.pathname}`;
  try {
    const upstream = await fetch(metadataUrl, { cache: "no-store" });
    const body = await upstream.json();
    return NextResponse.json(body, { status: upstream.status, headers: CORS_HEADERS });
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer la configuracion del servidor de autorizacion" },
      { status: 502, headers: CORS_HEADERS }
    );
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

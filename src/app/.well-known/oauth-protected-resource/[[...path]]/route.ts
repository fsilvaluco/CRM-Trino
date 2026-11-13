import { NextResponse } from "next/server";
import { getAuthorizationServerIssuer, getPublicOrigin } from "@/lib/mcp/auth";

// Metadatos del recurso protegido (RFC 9728). Le dicen al cliente MCP (Claude)
// que el servidor de /api/mcp se autentica contra Supabase Auth. Responde
// tanto en la raiz como con el sufijo /api/mcp, que es donde lo busca el
// cliente segun la especificacion.

export const dynamic = "force-dynamic";

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };

export function GET(request: Request) {
  const origin = getPublicOrigin(request);
  return NextResponse.json(
    {
      resource: `${origin}/api/mcp`,
      resource_name: "Artist Pro",
      authorization_servers: [getAuthorizationServerIssuer()],
      bearer_methods_supported: ["header"],
      scopes_supported: ["email", "profile"],
    },
    { headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=300" } }
  );
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

import { NextResponse } from "next/server";
import { authenticateMcpRequest, getPublicOrigin, getResourceMetadataUrl } from "@/lib/mcp/auth";
import { handleMcpMessage, type JsonRpcResponse } from "@/lib/mcp/server";

// Servidor MCP remoto de Artist Pro (transporte Streamable HTTP, sin estado).
// Cada persona del equipo lo agrega en Claude como conector personalizado y
// entra con su propia cuenta via OAuth (servidor OAuth 2.1 de Supabase Auth).
// Ver src/lib/mcp/ para la autenticacion y las herramientas.

export const dynamic = "force-dynamic";

// La autenticacion va por encabezado Authorization (nunca por cookies), asi
// que permitir cualquier origen no expone la sesion web de nadie.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate",
};

function methodNotAllowed() {
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Metodo no permitido" } },
    { status: 405, headers: { ...CORS_HEADERS, Allow: "POST, OPTIONS" } }
  );
}

export async function POST(request: Request) {
  const auth = await authenticateMcpRequest(request);
  if (!auth.ok) {
    const headers: Record<string, string> = { ...CORS_HEADERS };
    if (auth.status === 401) {
      // Con este encabezado el cliente descubre donde autenticarse (RFC 9728).
      const metadataUrl = getResourceMetadataUrl(getPublicOrigin(request));
      headers["WWW-Authenticate"] =
        auth.reason === "invalid_token"
          ? `Bearer error="invalid_token", error_description="${auth.message}", resource_metadata="${metadataUrl}"`
          : `Bearer resource_metadata="${metadataUrl}"`;
    }
    return NextResponse.json({ error: auth.reason, error_description: auth.message }, { status: auth.status, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON invalido" } },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (Array.isArray(body)) {
    const responses: JsonRpcResponse[] = [];
    for (const message of body.slice(0, 20)) {
      const response = await handleMcpMessage(message, auth.context);
      if (response) responses.push(response);
    }
    if (responses.length === 0) return new NextResponse(null, { status: 202, headers: CORS_HEADERS });
    return NextResponse.json(responses, { headers: CORS_HEADERS });
  }

  const response = await handleMcpMessage(body, auth.context);
  if (!response) return new NextResponse(null, { status: 202, headers: CORS_HEADERS });
  return NextResponse.json(response, { headers: CORS_HEADERS });
}

// Sin sesiones ni stream del servidor: GET (SSE) y DELETE no aplican.
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

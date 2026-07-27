import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// GET /api/integrations/gmail/connect?projectId=X
// Redirige a Google OAuth. Cada usuario conecta SU PROPIA cuenta de Gmail
// a un proyecto especifico (Francisco -> francisco@somostrino.cl en Trino,
// Joaquin -> joaquin@somostrino.cl en Trino, etc). No hay limite de
// cuentas por proyecto.
export async function GET(request: NextRequest) {
  const { orgId, user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.redirect(
      new URL("/settings/integrations?error=gmail_no_project", process.env.NEXT_PUBLIC_SITE_URL)
    );
  }

  const state = Buffer.from(
    JSON.stringify({ orgId, projectId, userId: user!.id })
  ).toString("base64");

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    // gmail.readonly: leer correos para detectar leads.
    // userinfo.email: saber que cuenta se conecto (para mostrarla en la UI
    // y distinguir francisco@somostrino.cl de francisco@agenciakatarsis.cl).
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
      "openid",
    ].join(" "),
    access_type: "offline", // necesario para obtener refresh_token
    prompt: "consent select_account", // fuerza el selector de cuenta -- clave
    // para que alguien con varias cuentas de Google (ej. Francisco con
    // somostrino.cl y agenciakatarsis.cl) elija la correcta cada vez.
    include_granted_scopes: "true",
    state,
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const { orgId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.redirect(
      new URL("/analytics?error=meta_no_project", process.env.NEXT_PUBLIC_SITE_URL)
    );
  }

  const state = Buffer.from(JSON.stringify({ orgId, projectId })).toString("base64");

  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: process.env.META_REDIRECT_URI!,
    // business_management: necesario para acceder a páginas que viven dentro
    // de portafolios comerciales (Business Portfolios) y no directamente en
    // la cuenta personal del usuario. Sin esto, /me/accounts solo devuelve
    // acceso completo a páginas con rol personal directo.
    scope: "instagram_basic,instagram_manage_insights,pages_read_engagement,business_management",
    response_type: "code",
    // rerequest: fuerza a Facebook a mostrar de nuevo el selector de páginas
    // y cuentas, en vez de la pantalla de "Reconectar" con la configuración
    // anterior congelada.
    auth_type: "rerequest",
    state,
  });

  const url = `https://www.facebook.com/dialog/oauth?${params.toString()}`;

  return NextResponse.redirect(url);
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// GET /q/[slug] -- endpoint PUBLICO (sin login, es lo que escanea el
// telefono de cualquiera). Registra el escaneo y redirige al destino real.
// Usa el service role porque quien escanea no tiene sesion -- no hay
// cliente autenticado con el que insertar respetando RLS.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: qr } = await supabase
    .from("qr_codes")
    .select("id, destination_url")
    .eq("slug", slug)
    .maybeSingle();

  if (!qr) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Fire-and-forget: no vale la pena demorar el redirect (la experiencia de
  // quien escaneo) esperando a que el log termine de escribirse.
  void supabase.from("qr_scans").insert({
    qr_id: qr.id,
    user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  });

  return NextResponse.redirect(qr.destination_url);
}

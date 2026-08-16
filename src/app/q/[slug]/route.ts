import { NextRequest, NextResponse, after } from "next/server";
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

  // No se espera (no vale la pena demorar el redirect por esto), pero
  // TAMPOCO se deja como una promesa suelta sin dueño -- `void promise` sin
  // más resultó no terminar de escribirse nunca en producción (el proceso
  // seguía a la siguiente request antes de que el insert terminara).
  // after() es la forma correcta en Next.js de encolar trabajo que debe
  // completarse SI O SI después de mandar la respuesta.
  after(async () => {
    const { error } = await supabase.from("qr_scans").insert({
      qr_id: qr.id,
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
    });
    if (error) {
      console.error("[qr] no se pudo registrar el escaneo:", error.message);
    }
  });

  return NextResponse.redirect(qr.destination_url);
}

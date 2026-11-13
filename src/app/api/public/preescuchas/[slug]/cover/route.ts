import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { PREESCUCHAS_BUCKET, getActivePreescuchaBySlug } from "@/lib/preescuchas";

export const dynamic = "force-dynamic";

// GET /api/public/preescuchas/[slug]/cover -- caratula de la preescucha.
// El bucket es privado, asi que se redirige a una URL firmada. La usan la
// pagina publica, el listado de la app y la tarjeta de vista previa
// (og:image) cuando se pega el link en WhatsApp o un correo.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = createAdminClient();
  const preescucha = await getActivePreescuchaBySlug(admin, slug);
  if (!preescucha?.cover_path) return NextResponse.json({ error: "No disponible" }, { status: 404 });

  const { data: signed, error } = await admin.storage.from(PREESCUCHAS_BUCKET).createSignedUrl(preescucha.cover_path, 60 * 60);
  if (error || !signed?.signedUrl) return NextResponse.json({ error: "No disponible" }, { status: 500 });

  const response = NextResponse.redirect(signed.signedUrl, 302);
  // Menos que la vida de la URL firmada, para que el navegador no reuse un
  // redirect que ya apunta a una URL vencida.
  response.headers.set("Cache-Control", "private, max-age=1800");
  return response;
}

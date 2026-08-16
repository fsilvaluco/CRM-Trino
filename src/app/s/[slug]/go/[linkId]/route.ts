import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// GET /s/[slug]/go/[linkId] -- a esto apuntan los botones de plataforma de
// la pagina publica del smartlink. Registra el click (con que plataforma)
// y redirige al link real. El linkId se valida contra el slug para que no
// se pueda usar un link de OTRO smartlink pisando la URL a mano.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; linkId: string }> }
) {
  const { slug, linkId } = await params;
  const supabase = createAdminClient();

  const { data: smartlink } = await supabase.from("smartlinks").select("id").eq("slug", slug).maybeSingle();
  if (!smartlink) return NextResponse.redirect(new URL("/", _request.url));

  const { data: link } = await supabase
    .from("smartlink_links")
    .select("url, platform")
    .eq("id", linkId)
    .eq("smartlink_id", smartlink.id)
    .maybeSingle();

  if (!link) return NextResponse.redirect(new URL(`/s/${slug}`, _request.url));

  after(async () => {
    const { error } = await supabase.from("smartlink_events").insert({
      smartlink_id: smartlink.id,
      event_type: "click",
      platform: link.platform,
    });
    if (error) console.error("[smartlink] no se pudo registrar el click:", error.message);
  });

  return NextResponse.redirect(link.url);
}

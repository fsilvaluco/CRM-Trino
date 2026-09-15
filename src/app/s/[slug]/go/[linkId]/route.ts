import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { isInAppBrowser, isIOSUserAgent, detectDeepLinkTarget, renderAppOpenHtml } from "@/lib/link-redirect";

export const dynamic = "force-dynamic";

// GET /s/[slug]/go/[linkId] -- a esto apuntan los botones de plataforma de
// la pagina publica del smartlink. Registra el click (con que plataforma)
// y redirige al link real. El linkId se valida contra el slug para que no
// se pueda usar un link de OTRO smartlink pisando la URL a mano.
//
// La pagina publica del smartlink se abre tipicamente desde la bio de
// Instagram/TikTok -- si el boton que tocaron es de Spotify o YouTube, se
// fuerza la apertura de la app nativa cuando quien visita sigue dentro del
// navegador embebido de esas apps (mismo problema y misma solucion que en
// /q/[slug]).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; linkId: string }> }
) {
  const { slug, linkId } = await params;
  const supabase = createAdminClient();

  // request.url es el host interno del contenedor (localhost:8080 detras
  // del proxy de Railway) -- los redirects de "no existe" se arman con el
  // dominio publico, igual que en /q/[slug].
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const { data: smartlink } = await supabase.from("smartlinks").select("id").eq("slug", slug).maybeSingle();
  if (!smartlink) return NextResponse.redirect(new URL("/", base));

  const { data: link } = await supabase
    .from("smartlink_links")
    .select("url, platform")
    .eq("id", linkId)
    .eq("smartlink_id", smartlink.id)
    .maybeSingle();

  if (!link) return NextResponse.redirect(new URL(`/s/${slug}`, base));

  after(async () => {
    const { error } = await supabase.from("smartlink_events").insert({
      smartlink_id: smartlink.id,
      event_type: "click",
      platform: link.platform,
    });
    if (error) console.error("[smartlink] no se pudo registrar el click:", error.message);
  });

  const userAgent = request.headers.get("user-agent");
  const deepLinkTarget = detectDeepLinkTarget(link.url);
  if (deepLinkTarget && isInAppBrowser(userAgent)) {
    return new NextResponse(renderAppOpenHtml(link.url, deepLinkTarget, isIOSUserAgent(userAgent)), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return NextResponse.redirect(link.url);
}

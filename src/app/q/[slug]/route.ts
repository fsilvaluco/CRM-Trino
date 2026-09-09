import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { isLinkPreviewBot, scrapeOgTags, type ScrapedOg } from "@/lib/link-preview-bots";
import {
  escapeHtml,
  isInAppBrowser,
  isIOSUserAgent,
  detectDeepLinkTarget,
  renderAppOpenHtml,
} from "@/lib/link-redirect";

export const dynamic = "force-dynamic";

// Cuando el scrapeo del destino falla (timeout, el sitio bloquea el fetch
// del servidor, no tiene og:image, etc.) esto es lo que se usa en su lugar
// -- asi el bot de WhatsApp/etc SIEMPRE recibe una tarjeta con imagen y
// titulo, nunca la version pelada (solo el dominio, sin foto) que se ve
// cuando no hay ningun meta tag que mostrar.
const FALLBACK_IMAGE_PATH = "/logo-full.png";

// Pagina minima con los meta tags del DESTINO, para el bot de
// WhatsApp/Meta/etc (no sigue el redirect para leer el body de la pagina
// final -- necesita ver los og:* tags en la primera respuesta). Un humano
// nunca deberia ver esto -- si alguien de verdad abre el link con un
// navegador real, cae en alguna de las otras dos ramas (interstitial o
// redirect directo).
function renderPreviewHtml(shortUrl: string, og: { title: string; description: string | null; image: string; siteName: string }): string {
  const title = escapeHtml(og.title);
  const description = og.description ? escapeHtml(og.description) : "";
  const image = escapeHtml(og.image);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta property="og:title" content="${title}">
${description ? `<meta property="og:description" content="${description}">` : ""}
<meta property="og:image" content="${image}">
<meta property="og:url" content="${escapeHtml(shortUrl)}">
${description ? `<meta name="description" content="${description}">` : ""}
</head>
<body></body>
</html>`;
}

// GET /q/[slug] -- endpoint PUBLICO (sin login).
// - Un bot de preview (WhatsApp, Facebook, Slack, etc.) recibe HTML con los
//   meta tags copiados del sitio de destino -- eso es lo que arma la
//   tarjeta que se ve al pegar/compartir el link. No cuenta como escaneo
//   (es un fetch de la propia app, no una persona). Si el scrapeo falla por
//   lo que sea, se usa como respaldo el nombre que la persona le puso al
//   link + el logo de Artist Pro -- nunca se deja al bot sin nada.
// - Si la persona real esta dentro del navegador embebido de Instagram o
//   TikTok (el link estaba en una bio) y el destino es un video de YouTube
//   o un link de Spotify, se sirve una pagina intermedia que fuerza la
//   apertura de la app nativa -- si no, la app-en-app suele bloquear o
//   degradar el contenido.
// - Cualquier otro visitante (una persona de verdad, incluyendo cuando
//   tocan la tarjeta ya generada) recibe el redirect normal y SI queda
//   registrado en qr_scans.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: qr } = await supabase
    .from("qr_codes")
    .select("id, label, destination_url")
    .eq("slug", slug)
    .maybeSingle();

  if (!qr) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const userAgent = request.headers.get("user-agent");

  // request.url refleja el host interno del contenedor (localhost:8080
  // detras del proxy de Railway), no el dominio publico -- se arma a mano
  // con NEXT_PUBLIC_SITE_URL, mismo patron que el resto de la app.
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  if (isLinkPreviewBot(userAgent)) {
    let scraped: ScrapedOg = { title: null, description: null, image: null, siteName: null };
    try {
      scraped = await scrapeOgTags(qr.destination_url);
    } catch (err) {
      console.error("[qr] no se pudo scrapear el destino para el preview:", err);
    }

    const og = {
      title: scraped.title || qr.label,
      description: scraped.description,
      image: scraped.image || `${base}${FALLBACK_IMAGE_PATH}`,
      siteName: scraped.siteName || "Artist Pro",
    };
    const shortUrl = `${base}/q/${slug}`;
    return new NextResponse(renderPreviewHtml(shortUrl, og), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // No se espera (no vale la pena demorar el redirect por esto), pero
  // TAMPOCO se deja como una promesa suelta sin dueño -- `void promise` sin
  // más no garantiza terminar antes de que el proceso pase a la siguiente
  // request. after() es la forma correcta en Next.js de encolar trabajo
  // que debe completarse SI O SI después de mandar la respuesta.
  after(async () => {
    const { error } = await supabase.from("qr_scans").insert({
      qr_id: qr.id,
      user_agent: userAgent?.slice(0, 300) ?? null,
    });
    if (error) {
      console.error("[qr] no se pudo registrar el escaneo:", error.message);
    }
  });

  const deepLinkTarget = detectDeepLinkTarget(qr.destination_url);
  if (deepLinkTarget && isInAppBrowser(userAgent)) {
    return new NextResponse(renderAppOpenHtml(qr.destination_url, deepLinkTarget, isIOSUserAgent(userAgent)), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return NextResponse.redirect(qr.destination_url);
}

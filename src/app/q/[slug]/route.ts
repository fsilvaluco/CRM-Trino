import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { isLinkPreviewBot, scrapeOgTags } from "@/lib/link-preview-bots";

export const dynamic = "force-dynamic";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Pagina minima con los meta tags del DESTINO, para el bot de
// WhatsApp/Meta/etc (no sigue el redirect para leer el body de la pagina
// final -- necesita ver los og:* tags en la primera respuesta). Un humano
// nunca deberia ver esto -- si alguien de verdad abre el link con un
// navegador real, cae en la rama normal (redirect directo).
function renderPreviewHtml(shortUrl: string, og: { title: string | null; description: string | null; image: string | null; siteName: string | null }): string {
  const title = escapeHtml(og.title || og.siteName || "Artist Pro");
  const description = og.description ? escapeHtml(og.description) : "";
  const image = og.image ? escapeHtml(og.image) : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta property="og:title" content="${title}">
${description ? `<meta property="og:description" content="${description}">` : ""}
${image ? `<meta property="og:image" content="${image}">` : ""}
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
//   (es un fetch de la propia app, no una persona).
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
    .select("id, destination_url")
    .eq("slug", slug)
    .maybeSingle();

  if (!qr) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const userAgent = request.headers.get("user-agent");

  if (isLinkPreviewBot(userAgent)) {
    try {
      const og = await scrapeOgTags(qr.destination_url);
      return new NextResponse(renderPreviewHtml(request.url, og), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (err) {
      // Si el destino no responde a tiempo o algo falla leyendo sus meta
      // tags, mejor no dejar al bot sin nada -- se sigue al redirect
      // normal (WhatsApp probablemente no muestre preview, pero el link
      // sigue funcionando para quien lo toque).
      console.error("[qr] no se pudo generar el preview:", err);
    }
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

  return NextResponse.redirect(qr.destination_url);
}

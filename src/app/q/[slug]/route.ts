import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { isLinkPreviewBot, scrapeOgTags, type ScrapedOg } from "@/lib/link-preview-bots";
import {
  escapeHtml,
  isInAppBrowser,
  isIOSUserAgent,
  detectDeepLinkTarget,
  renderAppOpenHtml,
  detectDeviceType,
} from "@/lib/link-redirect";
import { resolveMetaCapiConfig, buildFbc, sendMetaCapiEvent } from "@/lib/meta-capi";

// Nombre del evento que se reporta a Meta CAPI por cada click real de
// /q/[slug]. Fijo por ahora (un solo caso de uso: campañas que llevan a
// Spotify) -- si más adelante se necesita variar por campaña/QR, se agrega
// como columna en qr_codes en vez de hardcodearlo acá.
const META_CAPI_EVENT_NAME = "SpotifyClick";

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
  // Marca de llegada del request, para medir la latencia del servidor hasta
  // emitir el redirect (columna qr_scans.redirect_ms). Se llena justo antes de
  // cada return que redirige a una persona (interstitial o 302).
  const startedAt = Date.now();
  let redirectMs: number | null = null;

  const { slug } = await params;
  const supabase = createAdminClient();

  // request.url refleja el host interno del contenedor (localhost:8080
  // detras del proxy de Railway), no el dominio publico -- se arma a mano
  // con NEXT_PUBLIC_SITE_URL, mismo patron que el resto de la app. Esto
  // aplica TAMBIEN al redirect de "slug no existe": armarlo con
  // request.url mandaba a la persona a localhost:8080 (visto en un
  // celular real probando un link borrado).
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const { data: qr } = await supabase
    .from("qr_codes")
    .select("id, label, destination_url, project_id, organization_id")
    .eq("slug", slug)
    .maybeSingle();

  if (!qr) {
    return NextResponse.redirect(new URL("/", base));
  }

  const userAgent = request.headers.get("user-agent");

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

  // UTMs/fbclid/placement -- vienen tal cual los rellena Meta en el anuncio
  // ({{campaign.name}}, etc.), directo del query string del link corto.
  const sp = request.nextUrl.searchParams;
  const utmSource = sp.get("utm_source");
  const utmMedium = sp.get("utm_medium");
  const utmCampaign = sp.get("utm_campaign");
  const utmContent = sp.get("utm_content");
  const utmTerm = sp.get("utm_term");
  const placement = sp.get("placement");
  const fbclid = sp.get("fbclid");

  // IP real del visitante. Detrás de Cloudflare, x-forwarded-for[0] puede ser
  // la IP del edge de CF (se veía así en qr_scans: rangos 172.64/104.x). El
  // header cf-connecting-ip trae la IP real del cliente -- se prefiere ese, y
  // se cae a x-forwarded-for[0] solo si no está (entornos sin Cloudflare).
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress =
    request.headers.get("cf-connecting-ip") ||
    (forwardedFor ? forwardedFor.split(",")[0].trim() : null);
  const country = request.headers.get("cf-ipcountry");

  // _fbp: cookie de primera parte que normalmente pone el Pixel de Meta. Como
  // la interstitial vive en artistpro.app (sin Pixel), la cookie no existía
  // (0% en el diagnóstico). Se genera una en el formato de Meta
  // (fb.1.<ts>.<rand>) y se setea en la respuesta, para que persista entre
  // visitas y mejore el match de la CAPI (y sirva a futuro en la landing).
  let fbpCookie = request.cookies.get("_fbp")?.value ?? null;
  const generatedFbp = !fbpCookie;
  if (!fbpCookie) {
    fbpCookie = `fb.1.${Date.now()}.${Math.floor(Math.random() * 1e10)}`;
  }
  const fbcCookie = request.cookies.get("_fbc")?.value ?? null;
  const fbc = buildFbc(fbclid, fbcCookie);
  const deviceType = detectDeviceType(userAgent);

  const metaCapiEventId = crypto.randomUUID();
  // El id del escaneo se genera ACÁ (no lo deja generar la base) porque la
  // página intermedia lo necesita para reportar de vuelta si logró abrir la
  // app (POST /api/q/beacon -> qr_scans.app_open_result) -- y la respuesta
  // sale antes de que el insert del after() termine.
  const scanId = crypto.randomUUID();
  // event_source_url tal cual llegó (con todos los params) -- request.url
  // apunta al host interno del contenedor, así que se arma a mano igual
  // que `base` de arriba.
  const eventSourceUrl = `${base}/q/${slug}${request.nextUrl.search}`;

  // No se espera (no vale la pena demorar el redirect por esto), pero
  // TAMPOCO se deja como una promesa suelta sin dueño -- `void promise` sin
  // más no garantiza terminar antes de que el proceso pase a la siguiente
  // request. after() es la forma correcta en Next.js de encolar trabajo
  // que debe completarse SI O SI después de mandar la respuesta.
  after(async () => {
    const { data: inserted, error } = await supabase
      .from("qr_scans")
      .insert({
        id: scanId,
        qr_id: qr.id,
        user_agent: userAgent?.slice(0, 300) ?? null,
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        utm_content: utmContent,
        utm_term: utmTerm,
        placement,
        fbclid,
        fbc,
        fbp: fbpCookie,
        ip_address: ipAddress,
        country,
        device_type: deviceType,
        meta_capi_event_id: metaCapiEventId,
        redirect_ms: redirectMs,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[qr] no se pudo registrar el escaneo:", error.message);
      return;
    }

    // Sin pixel/token (ni del proyecto ni de las env vars globales) no
    // tiene sentido llamar a Meta -- el escaneo ya quedó guardado igual.
    const capiConfig = await resolveMetaCapiConfig(supabase, qr.organization_id, qr.project_id);
    if (!capiConfig) return;

    const result = await sendMetaCapiEvent({
      config: capiConfig,
      eventName: META_CAPI_EVENT_NAME,
      eventId: metaCapiEventId,
      eventSourceUrl,
      clientIpAddress: ipAddress,
      clientUserAgent: userAgent,
      fbc,
      fbp: fbpCookie,
      testEventCode: process.env.META_TEST_EVENT_CODE || undefined,
    });

    // Un error de Meta (token vencido, pixel mal, rate limit, etc.) queda
    // registrado para poder revisarlo -- nunca reintenta ni afecta al
    // visitante, que ya recibió su redirect hace rato.
    const { error: updateError } = await supabase
      .from("qr_scans")
      .update({
        meta_capi_sent: result.ok,
        meta_capi_response: result.ok ? result.body : { status: result.status, body: result.body, error: result.error },
      })
      .eq("id", inserted.id);
    if (updateError) {
      console.error("[qr] no se pudo guardar la respuesta de Meta CAPI:", updateError.message);
    }
  });

  const deepLinkTarget = detectDeepLinkTarget(qr.destination_url);
  // El criterio original era "¿reconozco el navegador embebido?"
  // (isInAppBrowser), pero WhatsApp no se puede reconocer así -- su
  // WebView en Android no lleva ningún identificador propio, confirmado
  // con un dispositivo real (UA idéntico a Chrome). Se cambió a "¿es un
  // celular?": en un navegador real (Chrome/Safari normal) este paso es
  // inofensivo -- si el sistema ya iba a abrir la app solo, este intento
  // extra ni se nota; si no, ahora sí queda forzado.
  if (deepLinkTarget && (isInAppBrowser(userAgent) || deviceType === "mobile")) {
    // no-store: el navegador embebido de Instagram/TikTok/WhatsApp
    // reutiliza la misma vista para cada visita a la bio/chat -- sin
    // esto, una visita repetida puede servirse desde caché y nunca pasar
    // por acá, perdiendo el registro del escaneo (y el evento a Meta) en
    // visitas siguientes.
    const html = renderAppOpenHtml(qr.destination_url, deepLinkTarget, isIOSUserAgent(userAgent), {
      scanId,
      beaconUrl: `${base}/api/q/beacon`,
    });
    redirectMs = Date.now() - startedAt;
    const res = new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
    setFbpCookie(res, fbpCookie, generatedFbp);
    return res;
  }

  redirectMs = Date.now() - startedAt;
  const res = NextResponse.redirect(qr.destination_url, { headers: { "Cache-Control": "no-store" } });
  setFbpCookie(res, fbpCookie, generatedFbp);
  return res;
}

// Persiste el _fbp generado (formato Meta) como cookie de primera parte, 90
// días, para que las visitas siguientes lo reusen y la CAPI tenga un fbp
// estable. Solo se setea si lo generamos nosotros (si ya venía, no se toca).
function setFbpCookie(res: NextResponse, fbp: string, generated: boolean) {
  if (!generated) return;
  res.cookies.set("_fbp", fbp, {
    maxAge: 60 * 60 * 24 * 90,
    path: "/",
    sameSite: "lax",
  });
}

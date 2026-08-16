// User-agents de los "crawlers de preview" que las apps de mensajeria/redes
// usan para generar la tarjeta (imagen/titulo/descripcion) cuando alguien
// pega un link -- NO son personas navegando, son un fetch server-to-server
// que hace la propia app (WhatsApp, Meta, etc.) apenas se pega/comparte el
// link. Por eso a estos SI hay que mostrarles HTML con meta tags (no
// siguen redirects para leer el body de la pagina final, y ademas no
// cuentan como un escaneo real).
const BOT_UA_PATTERNS = [
  /whatsapp/i,
  /facebookexternalhit/i,
  /facebot/i,
  /twitterbot/i,
  /slackbot/i,
  /telegrambot/i,
  /discordbot/i,
  /linkedinbot/i,
  /pinterest/i,
  /skypeuripreview/i,
  /embedly/i,
  /quora link preview/i,
  /vkshare/i,
  /w3c_validator/i,
];

export function isLinkPreviewBot(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return BOT_UA_PATTERNS.some((re) => re.test(userAgent));
}

export interface ScrapedOg {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

// El valor de un atributo HTML (ej. content="Gamuza &amp; Maceradoz") viene
// con entidades codificadas -- si no se decodifican aca y despues se
// vuelven a escapar al armar nuestro propio HTML, queda "&amp;amp;"
// (doble-escapado). Cubre las entidades que realmente aparecen en texto
// libre (nombres, titulos): & < > " ' y las numericas.
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function extractMeta(html: string, attr: "property" | "name", key: string): string | null {
  // El orden de los atributos en <meta> varia entre sitios (content antes o
  // despues de property/name) -- se prueban ambos ordenes.
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${key}["']`, "i"),
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match) return decodeHtmlEntities(match[1]);
  }
  return null;
}

// Trae el <head> del destino y le saca los Open Graph tags para copiarlos
// en nuestra propia respuesta -- asi el preview que arma WhatsApp/etc.
// muestra el sitio real de destino, sin depender de que el bot siga
// redirects.
export async function scrapeOgTags(url: string): Promise<ScrapedOg> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ArtistProLinkPreview/1.0)" },
  });
  const html = await res.text();

  let image = extractMeta(html, "property", "og:image");
  if (image && !image.startsWith("http")) {
    // Resolver rutas relativas contra el origen del destino.
    image = new URL(image, url).toString();
  }

  const titleTag = html.match(/<title>([^<]*)<\/title>/i)?.[1];

  return {
    title: extractMeta(html, "property", "og:title") ?? (titleTag ? decodeHtmlEntities(titleTag) : null),
    description: extractMeta(html, "property", "og:description") ?? extractMeta(html, "name", "description"),
    image,
    siteName: extractMeta(html, "property", "og:site_name"),
  };
}

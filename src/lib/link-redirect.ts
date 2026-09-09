// Utilidades para el problema clasico de "link en la bio de Instagram/TikTok":
// cuando alguien toca un link de YouTube o Spotify desde ahi, no se abre en
// Safari/Chrome sino dentro del navegador embebido (webview) de la propia
// app -- que muchas veces bloquea o degrada el contenido (ej. YouTube pide
// iniciar sesion de nuevo, Spotify no deja reproducir). La solucion es
// servir una pagina intermedia que intenta forzar la apertura de la app
// nativa via su esquema de URL, con fallback al sitio normal si no resulta.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const IN_APP_BROWSER_PATTERNS = [
  /instagram/i,
  /fban|fbav|fb_iab/i, // el mismo problema existe dentro de Facebook
  /tiktok|bytedancewebview|musical_ly/i,
];

export function isInAppBrowser(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return IN_APP_BROWSER_PATTERNS.some((re) => re.test(userAgent));
}

export function isIOSUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return /iphone|ipad|ipod/i.test(userAgent);
}

function extractYoutubeId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, "");
  if (host === "youtu.be") {
    return u.pathname.slice(1).split("/")[0] || null;
  }
  if (host === "youtube.com") {
    if (u.pathname === "/watch") return u.searchParams.get("v");
    const shorts = u.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{6,})/);
    if (shorts) return shorts[1];
  }
  return null;
}

const SPOTIFY_TYPES = ["track", "album", "playlist", "artist", "episode", "show"];

function extractSpotify(url: string): { type: string; id: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.hostname.replace(/^open\./, "") !== "spotify.com") return null;
  // El path a veces trae un prefijo de idioma (open.spotify.com/intl-es/track/ID),
  // asi que se busca el segmento de tipo en vez de asumir una posicion fija.
  const parts = u.pathname.split("/").filter(Boolean);
  const idx = parts.findIndex((p) => SPOTIFY_TYPES.includes(p));
  if (idx === -1 || !parts[idx + 1]) return null;
  return { type: parts[idx], id: parts[idx + 1] };
}

export interface DeepLinkTarget {
  platform: "youtube" | "spotify";
  label: string;
  iosScheme: string;
  androidIntent: string;
}

// Reconoce si el destino es un video de YouTube o un link de Spotify y arma
// los esquemas de apertura para cada plataforma:
// - iOS: esquema custom de la app (vnd.youtube:// / spotify:), funciona con
//   solo asignarlo a location.href si la app esta instalada.
// - Android: URL "intent://" que apunta al paquete exacto de la app, con
//   browser_fallback_url por si no esta instalada (Chrome/webviews Android
//   la resuelven de forma nativa).
export function detectDeepLinkTarget(destinationUrl: string): DeepLinkTarget | null {
  const ytId = extractYoutubeId(destinationUrl);
  if (ytId) {
    return {
      platform: "youtube",
      label: "YouTube",
      iosScheme: `vnd.youtube://${ytId}`,
      androidIntent: `intent://www.youtube.com/watch?v=${ytId}#Intent;package=com.google.android.youtube;scheme=https;S.browser_fallback_url=${encodeURIComponent(destinationUrl)};end`,
    };
  }

  const sp = extractSpotify(destinationUrl);
  if (sp) {
    return {
      platform: "spotify",
      label: "Spotify",
      iosScheme: `spotify:${sp.type}:${sp.id}`,
      androidIntent: `intent://open.spotify.com/${sp.type}/${sp.id}#Intent;package=com.spotify.music;scheme=https;S.browser_fallback_url=${encodeURIComponent(destinationUrl)};end`,
    };
  }

  return null;
}

// Pagina intermedia: intenta el esquema nativo apenas carga, con un boton
// visible por si el intento automatico no dispara (algunos webviews
// bloquean la navegacion automatica a un esquema custom, pero SI dejan
// pasar la del propio toque de la persona), y un fallback a los ~1.6s al
// sitio normal para no dejar a nadie colgado si no tiene la app instalada.
export function renderAppOpenHtml(destinationUrl: string, target: DeepLinkTarget, isIOS: boolean): string {
  const scheme = isIOS ? target.iosScheme : target.androidIntent;
  const safeDest = escapeHtml(destinationUrl);
  const safeScheme = escapeHtml(scheme);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Abriendo ${target.label}...</title>
<style>
  body { margin:0; min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; padding:32px 24px; background:#0b0b12; color:#fff; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; text-align:center; }
  p { margin:0; opacity:.7; font-size:14px; }
  a.btn { display:inline-block; padding:14px 28px; background:#fff; color:#0b0b12; border-radius:999px; text-decoration:none; font-weight:600; font-size:15px; }
  a.hint { color:#9aa0ff; font-size:13px; text-decoration:underline; margin-top:4px; }
</style>
</head>
<body>
  <p>Abriendo en ${target.label}...</p>
  <a class="btn" href="${safeScheme}">Abrir en ${target.label}</a>
  <a class="hint" href="${safeDest}">Seguir en el navegador</a>
  <script>
    (function () {
      window.location.href = ${JSON.stringify(scheme).replace(/</g, "\\u003c")};
      setTimeout(function () {
        window.location.href = ${JSON.stringify(destinationUrl).replace(/</g, "\\u003c")};
      }, 1600);
    })();
  </script>
</body>
</html>`;
}

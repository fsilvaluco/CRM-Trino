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
  // WhatsApp NO entra acá -- su navegador in-app en Android usa el WebView
  // de Chrome sin ningún identificador propio en el user-agent (probado
  // con un dispositivo real: UA idéntico a un Chrome cualquiera). Por eso
  // el criterio para forzar la apertura de la app no puede depender de
  // reconocer el navegador -- en la ruta se usa detectDeviceType() ===
  // "mobile" en su lugar (ver comentario en /q/[slug]).
];

export function isInAppBrowser(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return IN_APP_BROWSER_PATTERNS.some((re) => re.test(userAgent));
}

export function isIOSUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return /iphone|ipad|ipod/i.test(userAgent);
}

// Clasificación simple para reportes (no afecta ninguna decisión de la
// ruta, solo se guarda en qr_scans.device_type) -- el orden importa: los
// iPad en iOS 13+ mandan un user-agent de escritorio salvo que digan
// "iPad" explícito, y "Android" sin "Mobile" es tablet, no celular.
export function detectDeviceType(userAgent: string | null): "mobile" | "tablet" | "desktop" | null {
  if (!userAgent) return null;
  if (/ipad/i.test(userAgent)) return "tablet";
  if (/android/i.test(userAgent)) return /mobile/i.test(userAgent) ? "mobile" : "tablet";
  if (/iphone|ipod/i.test(userAgent)) return "mobile";
  if (/mobile/i.test(userAgent)) return "mobile";
  return "desktop";
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
  /** Esquema propio de la app, el mismo que la propia plataforma publica en
   * sus meta tags al:android:url / al:ios:url (ej. spotify://track/ID). Es
   * lo que usa el botón "Abrir aplicación" del sitio de Spotify, y lo que
   * se comprobó que SÍ abre la app desde el navegador in-app de WhatsApp
   * al tocarlo. Sirve tanto en iOS como en Android. */
  scheme: string;
  /** URL intent:// para Chrome Android (resuelve el paquete exacto y trae
   * browser_fallback_url si la app no está instalada). Los WebViews
   * embebidos NO la procesan por sí solos -- depende de la app anfitriona,
   * y WhatsApp la ignora en silencio (visto en dispositivo real). */
  androidIntent: string;
}

// Reconoce si el destino es un video de YouTube o un link de Spotify y arma
// las dos formas de abrir la app nativa (ver DeepLinkTarget).
export function detectDeepLinkTarget(destinationUrl: string): DeepLinkTarget | null {
  const ytId = extractYoutubeId(destinationUrl);
  if (ytId) {
    return {
      platform: "youtube",
      label: "YouTube",
      scheme: `vnd.youtube://${ytId}`,
      androidIntent: `intent://www.youtube.com/watch?v=${ytId}#Intent;package=com.google.android.youtube;scheme=https;S.browser_fallback_url=${encodeURIComponent(destinationUrl)};end`,
    };
  }

  const sp = extractSpotify(destinationUrl);
  if (sp) {
    return {
      platform: "spotify",
      label: "Spotify",
      scheme: `spotify://${sp.type}/${sp.id}`,
      androidIntent: `intent://open.spotify.com/${sp.type}/${sp.id}#Intent;package=com.spotify.music;scheme=https;S.browser_fallback_url=${encodeURIComponent(destinationUrl)};end`,
    };
  }

  return null;
}

export interface AppOpenOptions {
  /** id de la fila de qr_scans de esta visita (se genera antes de insertar,
   * ver /q/[slug]) -- con esto la página reporta qué intento abrió la app.
   * Sin scanId no se reporta nada (ej. Smartlink, que no lo pasa todavía). */
  scanId?: string;
  /** URL ABSOLUTA del endpoint que recibe el reporte (POST /api/q/beacon).
   * Absoluta porque en el dominio corto (artspr.cl) el middleware reescribe
   * cualquier path como si fuera un slug -- una URL relativa nunca llegaría. */
  beaconUrl?: string;
}

// Serializa para meterlo dentro de un <script>: el "</" es lo único que
// puede cortar el bloque antes de tiempo.
function js(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

// Página intermedia que fuerza la apertura de la app nativa. Diseñada a
// partir de lo que se vio en un WhatsApp Android real (ver BITACORA, 15 sep
// 2026):
//
// 1. Intentos AUTOMÁTICOS, en orden de más a menos probable: primero el
//    esquema propio (spotify://) en un iframe oculto -- si el WebView lo
//    entrega a la app, se abre; si no lo entiende, el error queda en el
//    iframe y NO reemplaza esta página (un location.href a un esquema
//    desconocido puede dejar al visitante en una pantalla de error del
//    WebView). Después, intent:// en el top-level, que Chrome sí procesa y
//    WhatsApp ignora en silencio.
// 2. Un BOTÓN grande con href al esquema propio: la navegación con gesto
//    del usuario es la que más WebViews permiten, y es exactamente lo que
//    hace el botón "Abrir aplicación" del propio sitio de Spotify (que sí
//    funcionó desde WhatsApp). Si tras tocarlo la página sigue visible, se
//    intenta intent:// también.
// 3. El fallback a la web recién a los 4s, y SOLO si la página sigue
//    visible y el reloj no se "saltó": cuando la app se abre, el WebView
//    pausa los timers, y el elapsed real al volver es mucho mayor -- en ese
//    caso no hay que arrancarle la página a alguien que acaba de volver.
//    Antes el fallback era a los 1.6s incondicional, y le quitaba la página
//    (y el botón) al visitante antes de que pudiera tocarlo.
// 4. Cada intento, el ocultamiento de la página (= la app se abrió) y el
//    fallback se reportan con sendBeacon a /api/q/beacon -> qr_scans.
//    app_open_result. Es el diagnóstico Y la métrica real de la campaña.
export function renderAppOpenHtml(
  destinationUrl: string,
  target: DeepLinkTarget,
  isIOS: boolean,
  opts: AppOpenOptions = {}
): string {
  const safeDest = escapeHtml(destinationUrl);
  const safeScheme = escapeHtml(target.scheme);
  const config = {
    scheme: target.scheme,
    intent: target.androidIntent,
    dest: destinationUrl,
    isIOS,
    scanId: opts.scanId ?? null,
    beaconUrl: opts.beaconUrl ?? null,
  };

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Abriendo ${target.label}...</title>
<style>
  body { margin:0; min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; padding:32px 24px; background:#0b0b12; color:#fff; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; text-align:center; }
  p { margin:0; opacity:.7; font-size:14px; }
  a.btn { display:inline-block; padding:16px 32px; background:#fff; color:#0b0b12; border-radius:999px; text-decoration:none; font-weight:700; font-size:17px; }
  a.hint { color:#9aa0ff; font-size:13px; text-decoration:underline; margin-top:4px; }
</style>
</head>
<body>
  <p id="status">Abriendo en ${target.label}...</p>
  <a class="btn" id="btn" href="${safeScheme}">Abrir en ${target.label}</a>
  <p>Si no se abre solo, toca el botón.</p>
  <a class="hint" id="web" href="${safeDest}">Seguir en el navegador</a>
  <script>
  (function () {
    var C = ${js(config)};
    var start = Date.now(), ev = [], hidden = false, outcome = null, fellBack = false;
    function now() { return Date.now() - start; }
    function send() {
      if (!C.scanId || !C.beaconUrl) return;
      try {
        var body = JSON.stringify({ scanId: C.scanId, result: {
          events: ev, hidden: hidden, outcome: outcome, elapsed: now(),
          ua: String(navigator.userAgent || "").slice(0, 200),
          ref: String(document.referrer || "").slice(0, 200)
        } });
        // text/plain: tipo "simple" para CORS, sin preflight -- el beacon
        // puede salir desde el dominio corto hacia el dominio principal.
        if (navigator.sendBeacon) {
          navigator.sendBeacon(C.beaconUrl, new Blob([body], { type: "text/plain" }));
        } else {
          fetch(C.beaconUrl, { method: "POST", body: body, keepalive: true }).catch(function () {});
        }
      } catch (e) {}
    }
    function log(m) { ev.push({ m: m, t: now() }); send(); }
    function markHidden(src) {
      if (hidden) return;
      hidden = true;
      if (!outcome) outcome = "app_opened";
      log("hidden:" + src);
    }
    document.addEventListener("visibilitychange", function () { if (document.hidden) markHidden("vis"); });
    window.addEventListener("pagehide", function () { markHidden("pagehide"); });
    window.addEventListener("blur", function () { markHidden("blur"); });

    function goTop(url, m) { log(m); try { window.location.href = url; } catch (e) { log(m + ":err"); } }
    function goFrame(url, m) {
      log(m);
      try {
        var f = document.createElement("iframe");
        f.style.display = "none";
        f.src = url;
        document.body.appendChild(f);
      } catch (e) { log(m + ":err"); }
    }

    // Intentos automáticos (ver comentario del render en el servidor).
    var auto = C.isIOS
      ? [function () { goTop(C.scheme, "auto:scheme"); }]
      : [function () { goFrame(C.scheme, "auto:scheme-iframe"); }, function () { goTop(C.intent, "auto:intent"); }];
    var i = 0;
    function next() {
      if (hidden || fellBack || i >= auto.length) return;
      auto[i++]();
      setTimeout(next, 1000);
    }
    next();

    // Botón: se deja que el <a href="spotify://..."> navegue solo (gesto
    // real del usuario). Si un momento después la página sigue visible, se
    // prueba intent:// también.
    document.getElementById("btn").addEventListener("click", function () {
      log("tap:scheme");
      if (!C.isIOS) {
        setTimeout(function () { if (!hidden) goTop(C.intent, "tap:intent"); }, 700);
      }
    });
    document.getElementById("web").addEventListener("click", function () { outcome = "user_web"; log("tap:web"); });

    var FALLBACK_MS = 4000;
    setTimeout(function () {
      if (hidden) return;
      if (now() > FALLBACK_MS + 1500) { log("fallback:skipped-throttled"); return; }
      outcome = "fallback_web";
      fellBack = true;
      log("fallback");
      window.location.replace(C.dest);
    }, FALLBACK_MS);
  })();
  </script>
</body>
</html>`;
}

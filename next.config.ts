import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3: binario nativo, no se puede empaquetar.
  // pdf-parse/pdfjs-dist: cargan archivos auxiliares (workers, fuentes) en
  // tiempo de ejecución -- si Next los empaqueta con webpack en vez de
  // dejarlos como dependencia externa de node_modules, esos archivos no
  // se resuelven bien y pdf-parse falla en producción aunque funcione
  // perfecto corriendo el mismo código directo con Node.
  // sharp: igual motivo que better-sqlite3 -- binario nativo (usado para
  // re-codificar WebP a PNG al combinar comprobantes en un PDF).
  serverExternalPackages: ["better-sqlite3", "pdf-parse", "pdfjs-dist", "sharp"],
  // "Shows en vivo" y "Métricas > Shows" se renombraron a "Eventos" -- estos
  // redirects son solo para que un link o marcador viejo a /shows no quede
  // en un 404.
  async redirects() {
    return [
      { source: "/shows", destination: "/eventos", permanent: true },
      { source: "/analytics/shows", destination: "/analytics/eventos", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        // Cabeceras de seguridad globales (CN-006, auditoría /cyber-neo
        // 23 ago 2026) -- antes solo estaban puestas para /embed. El orden
        // importa: Next.js aplica "el último bloque gana" cuando dos
        // bloques matchean la misma ruta y la misma clave de header -- este
        // bloque va PRIMERO para que el de /embed (más abajo) pueda pisar
        // el Content-Security-Policy con su propio frame-ancestors más
        // permisivo, sin tener que repetir el resto de las cabeceras acá.
        source: "/:path*",
        headers: [
          // Evita que el navegador "adivine" el tipo de un archivo servido
          // (ej. tratar un .txt subido como HTML/JS ejecutable) -- mitiga
          // ataques de MIME-sniffing.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Bloquea que cualquier sitio externo embeba la app en un iframe
          // (clickjacking). Los navegadores modernos priorizan el
          // Content-Security-Policy con frame-ancestors del bloque de
          // /embed más abajo por sobre esta cabecera cuando ambas están
          // presentes -- por eso /embed sigue funcionando igual para
          // Gamuza aunque acá diga SAMEORIGIN.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // No manda la URL completa (con querystrings que podrían tener
          // tokens/IDs) como Referer a un sitio de otro origen -- solo el
          // origen, y nada al bajar de HTTPS a HTTP.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Fuerza HTTPS en el navegador por 2 años, incluyendo subdominios
          // -- una vez que el navegador la ve, no vuelve a intentar HTTP
          // plano con este dominio aunque el usuario escriba la URL sin
          // "https://". Sin "preload": eso requiere enviar el dominio a la
          // lista de precarga de Chrome/Firefox a mano en hstspreload.org,
          // no se activa solo por mandar la cabecera.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
      {
        // Solo esta ruta se puede embeber en un iframe externo -- el resto
        // de la app no declara frame-ancestors (default: sin restricción
        // explícita, pero tampoco pensada para iframe). Ajustar esta lista
        // si Gamuza usa un subdominio distinto o agrega un staging.
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://gamuza.cl https://www.gamuza.cl",
          },
        ],
      },
      {
        // El navegador respeta el Cache-Control del propio sw.js al
        // chequear si hay una versión nueva -- sin esto puede quedar
        // sirviendo una copia vieja del Service Worker por horas después
        // de un deploy (justo lo que pasó con el fix del "Failed to
        // fetch": el fix ya estaba en producción pero algunos navegadores
        // seguían corriendo el Service Worker viejo). "No cache" fuerza a
        // que siempre chequee la versión más reciente en cada carga.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;

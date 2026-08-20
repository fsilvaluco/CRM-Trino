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
    ];
  },
};

export default nextConfig;

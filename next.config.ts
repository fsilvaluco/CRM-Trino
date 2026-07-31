import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
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

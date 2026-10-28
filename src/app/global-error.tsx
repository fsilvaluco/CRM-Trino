"use client";

import { useEffect } from "react";

// Reemplaza al layout raiz cuando el error ocurre en el propio layout, por
// eso trae su propio <html>/<body> y estilos inline (no hay Tailwind aca).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, background: "#fff", color: "#111" }}>
        <div style={{ maxWidth: 560, margin: "10vh auto" }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#b91c1c" }}>Algo falló al cargar la aplicación</h2>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#f4f4f5", padding: 12, borderRadius: 6, fontSize: 12 }}>
            {error.message || "Error desconocido"}
            {error.digest ? `\n\nDigest: ${error.digest}` : ""}
          </pre>
          <button
            onClick={() => reset()}
            style={{ marginTop: 12, padding: "8px 14px", borderRadius: 6, border: "1px solid #d4d4d8", cursor: "pointer", background: "#fff" }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}

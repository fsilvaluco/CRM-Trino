"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Error boundary de la app: muestra el mensaje real en vez de la pantalla
// generica de Next, para poder diagnosticar desde el navegador del usuario.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[AppError]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-4 rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <h2 className="font-semibold">Algo falló al cargar esta página</h2>
        </div>
        <pre className="whitespace-pre-wrap break-words rounded bg-muted p-3 text-xs">
          {error.message || "Error desconocido"}
          {error.digest ? `\n\nDigest: ${error.digest}` : ""}
        </pre>
        <div className="flex gap-2">
          <Button className="cursor-pointer" onClick={() => reset()}>
            Reintentar
          </Button>
          <Button variant="outline" className="cursor-pointer" onClick={() => window.location.reload()}>
            Recargar
          </Button>
        </div>
      </div>
    </div>
  );
}

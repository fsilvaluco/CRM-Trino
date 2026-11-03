"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LoadErrorStateProps {
  title?: string;
  message: string;
  onRetry: () => void;
  /** Accion secundaria opcional (p. ej. cerrar un panel). */
  secondaryLabel?: string;
  onSecondary?: () => void;
}

/**
 * Estado de error para cargas fallidas. Se usa en lugar del estado vacio
 * para que un fallo de red/API no se confunda con "no hay datos".
 */
export function LoadErrorState({
  title = "No pudimos cargar la información",
  message,
  onRetry,
  secondaryLabel,
  onSecondary,
}: LoadErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center py-12 px-4 text-center"
    >
      <div className="rounded-full bg-destructive/10 p-4 mb-4">
        <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-4">{message}</p>
      <div className="flex gap-2">
        <Button onClick={onRetry} className="cursor-pointer">
          Reintentar
        </Button>
        {secondaryLabel && onSecondary && (
          <Button variant="outline" onClick={onSecondary} className="cursor-pointer">
            {secondaryLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Lee un mensaje de error apto para mostrar al usuario desde una respuesta
 * fallida. Los 4xx de esta API traen mensajes pensados para el usuario
 * ("Sin acceso a este proyecto"); los 5xx suelen traer mensajes internos
 * de la base de datos, asi que para esos se usa el texto generico.
 */
export async function readLoadError(res: Response, fallback: string): Promise<string> {
  if (res.status >= 500) return fallback;
  try {
    const data = await res.json();
    if (data && typeof data.error === "string" && data.error.trim()) return data.error;
  } catch {
    // cuerpo no-JSON: usar el texto generico
  }
  return fallback;
}

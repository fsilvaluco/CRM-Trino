"use client";

import { useState } from "react";
import { Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";

/**
 * Ícono para abrir la boleta/factura de un costo desde una pantalla de
 * firma. No resuelve la URL al renderizar (una planilla con 15 costos
 * dispararía 15 llamadas al storage por gusto): la firma al hacer click y
 * recién ahí abre la pestaña.
 *
 * `resolve` es lo único que cambia entre las dos pantallas de firma: por
 * dentro se usa la sesión (getFinanceSignedUrl); por fuera, el endpoint
 * público que valida el token del link y que el archivo sea de ESE cierre.
 */
export function ComprobanteCostoButton({
  path,
  resolve,
}: {
  path: string;
  resolve: (path: string) => Promise<string | null>;
}) {
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    try {
      const url = await resolve(path);
      if (!url) {
        toast.error("No se pudo abrir el comprobante");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("No se pudo abrir el comprobante");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={loading}
      title="Ver comprobante"
      aria-label="Ver comprobante"
      className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50 cursor-pointer"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
    </button>
  );
}

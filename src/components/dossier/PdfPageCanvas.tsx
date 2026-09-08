"use client";

import { useEffect, useRef, useState } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PDFDocumentProxy = any;

interface PdfPageCanvasProps {
  pdf: PDFDocumentProxy;
  pageNumber: number; // 1-indexed
  /** Ancho objetivo en px -- la página se escala para calzar con esto. */
  targetWidth: number;
  onRendered?: (size: { width: number; height: number }) => void;
  className?: string;
}

/** Renderiza UNA página de un PDF ya cargado (ver usePdfDocument) a un
 * <canvas>, escalada a `targetWidth`. Reporta el tamaño renderizado real
 * (en px) para que el que lo usa pueda dibujar overlays alineados encima. */
export function PdfPageCanvas({ pdf, pageNumber, targetWidth, onRendered, className }: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendering, setRendering] = useState(true);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRendering(true);

    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const baseViewport = page.getViewport({ scale: 1 });
      // Renderiza a mayor resolución que el ancho mostrado (devicePixelRatio,
      // tope en 2x) para que se vea nítido en pantallas retina -- el CSS
      // width/height del canvas se deja en el tamaño "objetivo" y el
      // canvas interno queda más grande.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const scale = (targetWidth / baseViewport.width) * dpr;
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${targetWidth}px`;
      canvas.style.height = `${targetWidth * (baseViewport.height / baseViewport.width)}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      renderTaskRef.current?.cancel();
      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch {
        // Cancelado por un re-render (cambio de página/ancho) -- esperado,
        // no es un error real.
        return;
      }
      if (!cancelled) {
        setRendering(false);
        onRendered?.({
          width: targetWidth,
          height: targetWidth * (baseViewport.height / baseViewport.width),
        });
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageNumber, targetWidth]);

  return (
    <div className={className} style={{ position: "relative" }}>
      <canvas ref={canvasRef} className="block rounded-md shadow-sm border bg-white" />
      {rendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/40 rounded-md">
          <span className="text-xs text-muted-foreground">Cargando página...</span>
        </div>
      )}
    </div>
  );
}

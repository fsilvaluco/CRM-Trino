"use client";

import { useEffect, useRef, useState } from "react";
// pdfjs-dist se importa dinámico (no en el top-level) porque su build para
// navegador usa APIs de DOM/Worker que no existen en el render de servidor
// de Next -- importarlo estático rompería el build SSR de las páginas que
// usan este hook.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PDFDocumentProxy = any;

let workerConfigured = false;

async function loadPdfjs() {
  const pdfjsLib = await import("pdfjs-dist");
  if (!workerConfigured) {
    // Worker servido como archivo estático en /public (copiado de
    // node_modules/pdfjs-dist/build/pdf.worker.min.mjs, mismo major/minor
    // que la versión fijada en package.json) en vez de resolverlo con
    // `new URL(..., import.meta.url)` -- ese patrón choca con
    // `serverExternalPackages: ["pdfjs-dist"]` en next.config.ts (necesario
    // para el uso de pdfjs-dist del lado servidor, vía pdf-parse) y
    // Turbopack tira un warning de build ("Package pdfjs-dist can't be
    // external") para esta referencia desde un componente cliente. Servirlo
    // como estático evita el problema de raíz. Si se actualiza la versión
    // de pdfjs-dist, hay que volver a copiar este archivo.
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    workerConfigured = true;
  }
  return pdfjsLib;
}

interface UsePdfDocumentResult {
  pdf: PDFDocumentProxy | null;
  numPages: number;
  loading: boolean;
  error: string | null;
}

/** Carga un PDF (por URL) con pdf.js, para renderizarlo página por página
 * en un <canvas> -- usado tanto por el editor de Dossier como por la
 * página pública. */
export function usePdfDocument(url: string | null): UsePdfDocumentResult {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const destroyedRef = useRef(false);

  useEffect(() => {
    destroyedRef.current = false;
    if (!url) {
      setPdf(null);
      setNumPages(0);
      return;
    }
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const pdfjsLib = await loadPdfjs();
        const doc = await pdfjsLib.getDocument(url).promise;
        if (destroyedRef.current) {
          doc.destroy();
          return;
        }
        setPdf(doc);
        setNumPages(doc.numPages);
      } catch {
        if (!destroyedRef.current) setError("No se pudo leer el PDF");
      } finally {
        if (!destroyedRef.current) setLoading(false);
      }
    })();

    return () => {
      destroyedRef.current = true;
    };
  }, [url]);

  return { pdf, numPages, loading, error };
}

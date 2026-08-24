"use client";

// Link a un comprobante guardado en el bucket privado "finances". Genera la
// URL firmada al vuelo (nunca usa una URL pública permanente) -- muestra un
// spinner mientras carga y un ícono de error si falla, mismo patrón ya usado
// en otros lados de la app (ver FileLink en finances/page.tsx antes de esta
// unificación).

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getFinanceSignedUrl } from "@/lib/finance-files";

interface SignedFileLinkProps {
  path: string | null | undefined;
  className?: string;
  title?: string;
  children: React.ReactNode;
}

interface ResolvedState {
  path: string | null;
  url: string | null;
  error: boolean;
}

export function SignedFileLink({ path, className, title, children }: SignedFileLinkProps) {
  // Guarda junto al resultado el "path" al que corresponde -- así el
  // loading/error se derivan comparando contra el path actual, en vez de
  // necesitar un setState síncrono al inicio del efecto (evita disparar un
  // render en cascada).
  const [resolved, setResolved] = useState<ResolvedState>({ path: null, url: null, error: false });

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    getFinanceSignedUrl(path).then((signedUrl) => {
      if (cancelled) return;
      setResolved({ path, url: signedUrl, error: !signedUrl });
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!path) return null;

  const loading = resolved.path !== path;
  const url = loading ? null : resolved.url;
  const error = !loading && resolved.error;

  if (loading) {
    return <Loader2 className={`h-3.5 w-3.5 animate-spin text-muted-foreground ${className ?? ""}`} />;
  }

  if (error || !url) {
    return (
      <span className={`text-destructive ${className ?? ""}`} title="No se pudo cargar el archivo">
        {children}
      </span>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className} title={title}>
      {children}
    </a>
  );
}

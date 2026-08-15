"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Genera el PNG del QR en el navegador (sin depender de ningun servicio
// externo, consistente con el resto del CRM). El data URL resultante sirve
// tanto para mostrarlo como <img> como para el link de descarga.
export function QrImage({ url, size = 160 }: { url: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: size, margin: 1 })
      .then((d) => {
        if (!cancelled) setDataUrl(d);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url, size]);

  if (!dataUrl) {
    return <div className="bg-muted rounded animate-pulse" style={{ width: size, height: size }} />;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={dataUrl} alt="Código QR" width={size} height={size} className="rounded" />;
}

export async function generateQrDataUrl(url: string, size = 512): Promise<string> {
  return QRCode.toDataURL(url, { width: size, margin: 1 });
}

import { PDFDocument } from "pdf-lib";

export interface ImageToMerge {
  base64: string; // sin el prefijo data:...;base64,
  mediaType: "image/jpeg" | "image/png" | "image/webp";
}

// Combina 2+ fotos de comprobantes en un solo PDF (una foto por página, a
// tamaño carta con márgenes) -- pensado para cuando un mismo gasto se paga
// con varios comprobantes (ej. 2-3 boletas de un mismo proveedor) y hay que
// dejar un solo archivo adjunto en vez de varios sueltos.
//
// pdf-lib no soporta WebP nativamente -- esas imágenes se re-codifican a
// PNG en el navegador/servidor antes de llamar a esta función (ver
// `normalizeToEmbeddable` en el endpoint que la usa).
export async function mergeImagesToPdf(images: ImageToMerge[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  for (const img of images) {
    const bytes = Buffer.from(img.base64, "base64");
    const embedded = img.mediaType === "image/png"
      ? await pdfDoc.embedPng(bytes)
      : await pdfDoc.embedJpg(bytes);

    // Tamaño carta (612x792pt) con margen de 24pt, la imagen se escala
    // manteniendo proporción para que quepa completa en la página.
    const pageWidth = 612;
    const pageHeight = 792;
    const margin = 24;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;

    const scale = Math.min(maxWidth / embedded.width, maxHeight / embedded.height, 1);
    const drawWidth = embedded.width * scale;
    const drawHeight = embedded.height * scale;

    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawImage(embedded, {
      x: (pageWidth - drawWidth) / 2,
      y: (pageHeight - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });
  }

  return pdfDoc.save();
}

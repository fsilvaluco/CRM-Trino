// ─── Escritor de PDF compartido ─────────────────────────────────────────────
// Salio de external-signature.ts (comprobante de firma / acta de cierre) el
// dia que la Planilla de costos tambien necesito su propio PDF: los tres son
// la misma hoja carta con cursor vertical y salto de pagina automatico, asi
// que vive aca y no duplicado en cada archivo que arma un documento.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/** pdf-lib con las fuentes estandar solo sabe escribir WinAnsi (Latin-1):
 * cualquier caracter fuera de ese set revienta el documento entero. Las
 * comillas curvas y las rayas largas que salen de los textos pegados por
 * el usuario son el caso tipico. */
export function sanitize(text: string): string {
  return text
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "");
}

/** Hoja carta con los ayudantes de escritura (cursor vertical, salto de
 * pagina automatico, filas etiqueta/valor). Lo comparten el comprobante de
 * UNA firma, el acta con TODAS y la planilla de costos. */
export async function nuevoPdf() {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const WIDTH = 595.28;
  const HEIGHT = 841.89;
  const MARGIN = 50;
  const RIGHT = WIDTH - MARGIN;

  let page = pdf.addPage([WIDTH, HEIGHT]);
  let y = HEIGHT - MARGIN;

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) {
      page = pdf.addPage([WIDTH, HEIGHT]);
      y = HEIGHT - MARGIN;
    }
  }

  function text(value: string, opts: { size?: number; bold?: boolean; gray?: boolean; gap?: number } = {}) {
    const size = opts.size ?? 10;
    ensureSpace(size + 6);
    y -= size + 2;
    page.drawText(sanitize(value), {
      x: MARGIN,
      y,
      size,
      font: opts.bold ? bold : regular,
      color: opts.gray ? rgb(0.45, 0.45, 0.5) : rgb(0.08, 0.09, 0.17),
    });
    y -= opts.gap ?? 2;
  }

  /** Fila etiqueta-izquierda / valor-derecha, como una linea de planilla. */
  function row(label: string, value: string, opts: { bold?: boolean; size?: number } = {}) {
    const size = opts.size ?? 10;
    ensureSpace(size + 6);
    y -= size + 2;
    const font = opts.bold ? bold : regular;
    const clean = sanitize(value);
    page.drawText(sanitize(label), { x: MARGIN, y, size, font, color: rgb(0.08, 0.09, 0.17) });
    page.drawText(clean, {
      x: RIGHT - font.widthOfTextAtSize(clean, size),
      y,
      size,
      font,
      color: rgb(0.08, 0.09, 0.17),
    });
    y -= 2;
  }

  function rule(gap = 8) {
    ensureSpace(gap + 2);
    y -= gap;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: RIGHT, y },
      thickness: 0.5,
      color: rgb(0.85, 0.86, 0.9),
    });
    y -= gap;
  }

  function heading(value: string) {
    ensureSpace(24);
    y -= 12;
    text(value, { size: 9, bold: true, gray: true });
  }

  /** Parrafo con corte de linea a lo ancho de la pagina. */
  function paragraph(value: string, size = 8.5) {
    const words = sanitize(value).split(/\s+/);
    const maxWidth = RIGHT - MARGIN;
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (regular.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        text(line, { size, gray: true, gap: 0 });
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) text(line, { size, gray: true, gap: 0 });
  }

  /** Fila de tabla en columnas. `widths` son fracciones del ancho util y
   * tienen que sumar 1; el texto que no cabe en su columna se corta con
   * puntos suspensivos en vez de pisar la columna vecina. */
  function cols(
    values: string[],
    opts: {
      widths: readonly number[];
      align?: readonly ("left" | "right")[];
      size?: number;
      bold?: boolean;
      gray?: boolean;
    } = { widths: [] }
  ) {
    const size = opts.size ?? 9;
    const font = opts.bold ? bold : regular;
    const color = opts.gray ? rgb(0.45, 0.45, 0.5) : rgb(0.08, 0.09, 0.17);
    const usable = RIGHT - MARGIN;
    ensureSpace(size + 6);
    y -= size + 2;

    let x = MARGIN;
    values.forEach((value, i) => {
      const width = (opts.widths[i] ?? 1 / values.length) * usable;
      const align = opts.align?.[i] ?? "left";
      const PAD = 4;
      let clean = sanitize(value);
      while (clean.length > 1 && font.widthOfTextAtSize(clean, size) > width - PAD) {
        clean = clean.slice(0, -2) + "\u2026";
      }
      const drawX = align === "right" ? x + width - PAD - font.widthOfTextAtSize(clean, size) : x;
      page.drawText(clean, { x: drawX, y, size, font, color });
      x += width;
    });
    y -= 2;
  }

  function space(n: number) {
    y -= n;
  }

  return { text, row, cols, rule, heading, paragraph, space, save: () => pdf.save() };
}

export type EscritorPdf = Awaited<ReturnType<typeof nuevoPdf>>;

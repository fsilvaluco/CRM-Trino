import { PDFParse } from "pdf-parse";

/** Extrae el texto plano de un PDF (setlists, contratos, riders, etc. que
 * ya vienen como texto real, no como imagen escaneada). */
export async function extractTextFromPdf(base64: string): Promise<string> {
  const buffer = Buffer.from(base64, "base64");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  return result.text;
}

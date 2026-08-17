import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { extractReceiptFromImage, extractReceiptFromText, isOpenAIEnabled } from "@/lib/openai";
import { extractTextFromPdf } from "@/lib/pdf-text";

const MAX_BASE64_LENGTH = 12_000_000;

// POST /api/eventos/cost-submissions-extract -- { mode: "image"|"pdf", ... }
// Lee un comprobante (foto o PDF) y sugiere el monto total pagado -- usado
// en /eventos/[id]/gastos al adjuntar el archivo. Es solo una sugerencia
// editable, mismo patrón que setlist/timing/tickets-extract.
export async function POST(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  if (!isOpenAIEnabled()) {
    return NextResponse.json({ error: "Lectura con IA no disponible (falta configurar OPENAI_API_KEY)" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { mode, imageBase64, mediaType, pdfBase64 } = body as {
    mode?: "image" | "pdf";
    imageBase64?: string;
    mediaType?: string;
    pdfBase64?: string;
  };

  try {
    if (mode === "image") {
      if (!imageBase64) return NextResponse.json({ error: "Falta la imagen" }, { status: 400 });
      if (imageBase64.length > MAX_BASE64_LENGTH) {
        return NextResponse.json({ error: "La imagen es muy grande" }, { status: 413 });
      }
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      const type = allowedTypes.includes(mediaType ?? "") ? (mediaType as "image/jpeg" | "image/png" | "image/webp") : "image/jpeg";
      const receipt = await extractReceiptFromImage(imageBase64, type);
      return NextResponse.json(receipt);
    }

    if (mode === "pdf") {
      if (!pdfBase64) return NextResponse.json({ error: "Falta el PDF" }, { status: 400 });
      if (pdfBase64.length > MAX_BASE64_LENGTH) {
        return NextResponse.json({ error: "El PDF es muy grande" }, { status: 413 });
      }
      let pdfText: string;
      try {
        pdfText = await extractTextFromPdf(pdfBase64);
      } catch (err) {
        console.error("[cost-submissions-extract] fallo leyendo el PDF", err);
        return NextResponse.json({ error: "No se pudo leer el PDF -- ingresa el monto a mano." }, { status: 422 });
      }
      if (!pdfText.trim()) {
        return NextResponse.json({ error: "El PDF no tiene texto extraíble -- ingresa el monto a mano." }, { status: 422 });
      }
      const receipt = await extractReceiptFromText(pdfText);
      return NextResponse.json(receipt);
    }

    return NextResponse.json({ error: "Modo inválido" }, { status: 400 });
  } catch (err) {
    console.error("[cost-submissions-extract] failed", err);
    return NextResponse.json({ error: "No se pudo leer el comprobante -- ingresa el monto a mano." }, { status: 502 });
  }
}

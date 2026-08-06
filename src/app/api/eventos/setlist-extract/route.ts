import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { extractSetlistFromImage, extractSetlistFromText, isOpenAIEnabled } from "@/lib/openai";
import { extractTextFromPdf } from "@/lib/pdf-text";

const MAX_BASE64_LENGTH = 12_000_000;

// POST /api/eventos/setlist-extract -- { mode: "image"|"pdf"|"text", ... }
// Un solo endpoint para las tres formas de subir un setlist: foto/captura,
// PDF, o texto plano (pegado o de un .txt). El PDF se resuelve primero a
// texto acá mismo (pdf-parse) y despues sigue el mismo camino que "text".
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

  const { mode, imageBase64, mediaType, pdfBase64, text } = body as {
    mode?: "image" | "pdf" | "text";
    imageBase64?: string;
    mediaType?: string;
    pdfBase64?: string;
    text?: string;
  };

  try {
    if (mode === "image") {
      if (!imageBase64) return NextResponse.json({ error: "Falta la imagen" }, { status: 400 });
      if (imageBase64.length > MAX_BASE64_LENGTH) {
        return NextResponse.json({ error: "La imagen es muy grande" }, { status: 413 });
      }
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      const type = allowedTypes.includes(mediaType ?? "") ? (mediaType as "image/jpeg" | "image/png" | "image/webp") : "image/jpeg";
      const songs = await extractSetlistFromImage(imageBase64, type);
      return NextResponse.json({ songs });
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
        console.error("[setlist-extract] fallo leyendo el PDF", err);
        return NextResponse.json(
          { error: "No se pudo leer el PDF -- si es un escaneo/imagen, prueba subiéndolo como foto en vez de PDF." },
          { status: 422 }
        );
      }
      if (!pdfText.trim()) {
        return NextResponse.json(
          { error: "El PDF no tiene texto extraíble -- probablemente es un escaneo. Prueba subiéndolo como foto." },
          { status: 422 }
        );
      }
      const songs = await extractSetlistFromText(pdfText);
      return NextResponse.json({ songs });
    }

    if (mode === "text") {
      if (!text) return NextResponse.json({ error: "Falta el texto" }, { status: 400 });
      const songs = await extractSetlistFromText(text);
      return NextResponse.json({ songs });
    }

    return NextResponse.json({ error: "Modo inválido" }, { status: 400 });
  } catch (err) {
    console.error("[setlist-extract] failed", err);
    return NextResponse.json({ error: "No se pudo leer el setlist -- intenta de nuevo o ingrésalo a mano" }, { status: 502 });
  }
}

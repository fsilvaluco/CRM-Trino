import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { extractKmFromMapsScreenshot, isOpenAIEnabled } from "@/lib/openai";

const MAX_BASE64_LENGTH = 12_000_000;

// POST /api/eventos/km-extract -- { imageBase64, mediaType } -- lee una
// captura de una app de mapas y sugiere los km del trayecto, para la
// categoría "Bencina" de la Planilla de costos (Planilla interna y el
// link de "reportar gasto"). Mismo patrón que cost-submissions-extract.
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

  const { imageBase64, mediaType } = body as { imageBase64?: string; mediaType?: string };
  if (!imageBase64) return NextResponse.json({ error: "Falta la imagen" }, { status: 400 });
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    return NextResponse.json({ error: "La imagen es muy grande" }, { status: 413 });
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  const type = allowedTypes.includes(mediaType ?? "") ? (mediaType as "image/jpeg" | "image/png" | "image/webp") : "image/jpeg";

  try {
    const { km } = await extractKmFromMapsScreenshot(imageBase64, type);
    return NextResponse.json({ km });
  } catch (err) {
    console.error("[km-extract] failed", err);
    return NextResponse.json({ error: "No se pudo leer la captura -- ingresa los km a mano." }, { status: 502 });
  }
}

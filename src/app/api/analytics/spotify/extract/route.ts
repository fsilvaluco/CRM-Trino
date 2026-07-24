import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { extractSpotifyStatsFromScreenshot, isAIEnabled } from "@/lib/claude";

const MAX_BASE64_LENGTH = 8_000_000; // ~6MB de imagen — de sobra para un pantallazo comprimido en el cliente

export async function POST(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  if (!isAIEnabled()) {
    return NextResponse.json({ error: "Lectura con IA no disponible (falta configurar ANTHROPIC_API_KEY)" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { imageBase64, mediaType } = body as { imageBase64?: string; mediaType?: string };

  if (!imageBase64) {
    return NextResponse.json({ error: "Falta la imagen" }, { status: 400 });
  }
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    return NextResponse.json({ error: "La imagen es muy grande — intenta con una captura más chica" }, { status: 413 });
  }
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  const type = allowedTypes.includes(mediaType ?? "") ? (mediaType as "image/jpeg" | "image/png" | "image/webp") : "image/jpeg";

  try {
    const result = await extractSpotifyStatsFromScreenshot(imageBase64, type);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[spotify/extract] failed", err);
    return NextResponse.json({ error: "No se pudo leer el pantallazo — intenta de nuevo o ingresa los datos a mano" }, { status: 502 });
  }
}

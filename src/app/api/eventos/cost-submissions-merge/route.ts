import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { extractReceiptFromImage, isOpenAIEnabled } from "@/lib/openai";
import { mergeImagesToPdf, type ImageToMerge } from "@/lib/pdf-merge";

const MAX_BASE64_LENGTH = 12_000_000;
const MAX_IMAGES = 5;

type MediaType = "image/jpeg" | "image/png" | "image/webp";

// pdf-lib no embebe WebP -- se re-codifica a PNG con sharp antes de armar
// el PDF (la lectura con IA sí acepta WebP directo, no hace falta tocarla).
async function toEmbeddableImage(base64: string, mediaType: MediaType): Promise<ImageToMerge> {
  if (mediaType !== "image/webp") return { base64, mediaType };
  const sharp = (await import("sharp")).default;
  const pngBuffer = await sharp(Buffer.from(base64, "base64")).png().toBuffer();
  return { base64: pngBuffer.toString("base64"), mediaType: "image/png" };
}

// POST /api/eventos/cost-submissions-merge -- { images: [{ base64, mediaType }] }
// Cuando un gasto se paga con 2 a 5 comprobantes por separado (ej. varias
// boletas del mismo proveedor), esto lee el monto de CADA imagen con IA,
// suma el total, y las junta en un solo PDF (una foto por página) para
// dejar un único archivo adjunto en vez de varios sueltos.
export async function POST(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { images } = body as { images?: { base64?: string; mediaType?: string }[] };

  if (!Array.isArray(images) || images.length === 0) {
    return NextResponse.json({ error: "Faltan las imágenes" }, { status: 400 });
  }
  if (images.length > MAX_IMAGES) {
    return NextResponse.json({ error: `Máximo ${MAX_IMAGES} imágenes` }, { status: 400 });
  }

  const allowedTypes: MediaType[] = ["image/jpeg", "image/png", "image/webp"];
  const normalized: { base64: string; mediaType: MediaType }[] = [];
  for (const img of images) {
    if (!img.base64) {
      return NextResponse.json({ error: "Una de las imágenes viene vacía" }, { status: 400 });
    }
    if (img.base64.length > MAX_BASE64_LENGTH) {
      return NextResponse.json({ error: "Una de las imágenes es muy grande" }, { status: 413 });
    }
    const mediaType = allowedTypes.includes(img.mediaType as MediaType) ? (img.mediaType as MediaType) : "image/jpeg";
    normalized.push({ base64: img.base64, mediaType });
  }

  try {
    // Lectura del monto de cada comprobante -- best-effort, si la IA no
    // está configurada o falla en una imagen puntual, esa queda en null y
    // no bloquea el resto.
    const amounts: (number | null)[] = isOpenAIEnabled()
      ? await Promise.all(
          normalized.map(async (img) => {
            try {
              const receipt = await extractReceiptFromImage(img.base64, img.mediaType);
              return typeof receipt.amount === "number" && receipt.amount > 0 ? receipt.amount : null;
            } catch {
              return null;
            }
          })
        )
      : normalized.map(() => null);

    const validAmounts = amounts.filter((a): a is number => a !== null);
    const totalAmount = validAmounts.length > 0 ? validAmounts.reduce((sum, a) => sum + a, 0) : null;

    const embeddable = await Promise.all(normalized.map((img) => toEmbeddableImage(img.base64, img.mediaType)));
    const pdfBytes = await mergeImagesToPdf(embeddable);
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

    return NextResponse.json({ pdfBase64, totalAmount, amounts });
  } catch (err) {
    console.error("[cost-submissions-merge] failed", err);
    return NextResponse.json({ error: "No se pudieron combinar los comprobantes" }, { status: 502 });
  }
}

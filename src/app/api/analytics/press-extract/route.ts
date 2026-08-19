import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { extractPressMentionFromText, isOpenAIEnabled } from "@/lib/openai";
import { htmlToText } from "@/lib/html-to-text";
import type { PressMentionType } from "@/types/press";

const VALID_TYPES: PressMentionType[] = ["radio", "tv", "digital", "digital_rrss"];

function normalizeType(raw: string | null): PressMentionType | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  return (VALID_TYPES as string[]).includes(lower) ? (lower as PressMentionType) : null;
}

// POST /api/analytics/press-extract -- { url } -- abre el link de la nota
// de prensa, lo limpia a texto plano y le pide a la IA que sugiera medio /
// tipo / descripción / fecha para precargar el formulario de "Registrar
// mención de prensa". Mismo patrón que /api/eventos/tickets-extract (modo
// "url"): el servidor hace el fetch (evita CORS en el navegador), no se
// guarda nada todavía -- el usuario revisa/edita antes de guardar.
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

  const { url } = body as { url?: string };
  if (!url) return NextResponse.json({ error: "Falta el link" }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "El link no es válido" }, { status: 400 });
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return NextResponse.json({ error: "El link no es válido" }, { status: 400 });
  }

  let html: string;
  try {
    const pageRes = await fetch(parsed.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ArtistProBot/1.0)" },
    });
    if (!pageRes.ok) {
      return NextResponse.json({ error: `El sitio respondió con error (${pageRes.status})` }, { status: 502 });
    }
    html = await pageRes.text();
  } catch (err) {
    console.error("[press-extract] fallo el fetch del link", err);
    return NextResponse.json({ error: "No se pudo abrir ese link" }, { status: 502 });
  }

  const text = htmlToText(html);
  if (!text) {
    return NextResponse.json({ error: "La página no tiene contenido legible" }, { status: 422 });
  }

  try {
    const extraction = await extractPressMentionFromText(text);
    return NextResponse.json({
      outlet: extraction.outlet,
      type: normalizeType(extraction.type),
      title: extraction.title,
      mentionDate: extraction.mentionDate,
    });
  } catch (err) {
    console.error("[press-extract] extracción falló", err);
    return NextResponse.json({ error: "No se pudo leer la nota -- completa los datos a mano." }, { status: 502 });
  }
}

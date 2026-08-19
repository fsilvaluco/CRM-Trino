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

interface Extracted {
  outlet: string | null;
  type: PressMentionType | null;
  title: string | null;
  mentionDate: string | null;
  warning?: string;
}

const UA = "Mozilla/5.0 (compatible; ArtistProBot/1.0)";

// Instagram no tiene oEmbed público desde 2020 (requiere token de la Graph
// API con app revisada) y la página sirve la descripción/caption vía JS,
// no en el HTML plano -- por eso no se puede leer el contenido de la
// publicación como con un sitio de noticias normal. Lo único disponible sin
// login es la cuenta que publicó (va en el meta og:url).
async function extractFromInstagram(url: string): Promise<Extracted> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    const html = await res.text();
    const match = html.match(/property="og:url"\s+content="https:\/\/www\.instagram\.com\/([^/"]+)\//);
    const handle = match?.[1] ?? null;
    return {
      outlet: handle ? `@${handle}` : null,
      type: "digital_rrss",
      title: null,
      mentionDate: null,
      warning: "Instagram no deja leer el contenido de la publicación sin iniciar sesión -- completa descripción y fecha a mano. Se rellenó la cuenta que publicó.",
    };
  } catch (err) {
    console.error("[press-extract] fallo leyendo Instagram", err);
    return { outlet: null, type: "digital_rrss", title: null, mentionDate: null, warning: "No se pudo leer nada de ese link de Instagram -- completa a mano." };
  }
}

// TikTok y YouTube sí tienen oEmbed público (sin token) que devuelve
// título/autor de forma confiable -- más simple y preciso que scrapear +
// mandarlo a la IA.
async function extractFromOEmbed(oembedUrl: string): Promise<Extracted> {
  const res = await fetch(oembedUrl, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`oEmbed respondió ${res.status}`);
  const data = await res.json();
  const title: string | null = typeof data.title === "string" ? data.title.slice(0, 300) : null;
  const author: string | null = typeof data.author_name === "string" ? data.author_name : null;
  return { outlet: author, type: "digital_rrss", title, mentionDate: null };
}

async function extractFromGenericPage(url: string): Promise<Extracted> {
  const pageRes = await fetch(url, { headers: { "User-Agent": UA } });
  if (!pageRes.ok) throw new Error(`El sitio respondió con error (${pageRes.status})`);
  const html = await pageRes.text();
  const text = htmlToText(html);
  if (!text) throw new Error("La página no tiene contenido legible");

  const extraction = await extractPressMentionFromText(text);
  return {
    outlet: extraction.outlet,
    type: normalizeType(extraction.type),
    title: extraction.title,
    mentionDate: extraction.mentionDate,
  };
}

// POST /api/analytics/press-extract -- { url } -- lee el link de una nota
// de prensa o de una publicación en RRSS y sugiere medio / tipo /
// descripción / fecha para precargar el formulario de "Registrar mención
// de prensa". Nada se guarda todavía -- el usuario revisa/edita antes de
// guardar. Tres caminos según el dominio:
// - TikTok / YouTube: oEmbed público (título + autor, sin IA).
// - Instagram: no expone el contenido de la publicación sin login -- solo
//   se rellena la cuenta que publicó, con una advertencia.
// - Cualquier otro sitio: se scrapea a texto plano y se manda a la IA
//   (mismo patrón que /api/eventos/tickets-extract modo "url").
export async function POST(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

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

  const host = parsed.hostname.replace(/^www\./, "");

  try {
    if (host === "instagram.com" || host === "instagr.am") {
      return NextResponse.json(await extractFromInstagram(parsed.toString()));
    }

    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
      return NextResponse.json(await extractFromOEmbed(`https://www.tiktok.com/oembed?url=${encodeURIComponent(parsed.toString())}`));
    }

    if (host === "youtube.com" || host === "youtu.be" || host.endsWith(".youtube.com")) {
      return NextResponse.json(await extractFromOEmbed(`https://www.youtube.com/oembed?url=${encodeURIComponent(parsed.toString())}&format=json`));
    }

    // Cualquier otro sitio (medios de prensa, blogs, etc.) necesita IA para
    // resumir el contenido -- ahí sí depende de que esté configurada.
    if (!isOpenAIEnabled()) {
      return NextResponse.json({ error: "Lectura con IA no disponible (falta configurar OPENAI_API_KEY)" }, { status: 503 });
    }
    return NextResponse.json(await extractFromGenericPage(parsed.toString()));
  } catch (err) {
    console.error("[press-extract] extracción falló", err);
    const message = err instanceof Error ? err.message : "No se pudo leer ese link -- completa los datos a mano.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

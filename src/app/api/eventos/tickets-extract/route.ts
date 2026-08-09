import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { extractTicketTiersFromScreenshot, extractTicketTiersFromText, isOpenAIEnabled } from "@/lib/openai";

const MAX_BASE64_LENGTH = 8_000_000;

// Convierte HTML a texto legible: saca <script>/<style>, tags, y decodifica
// las entidades mas comunes. No es un parser perfecto, pero para paginas de
// estadisticas de ticketeras (texto simple, sin mucho JS-rendering) alcanza
// -- ya se probó contra una pagina real de PortalTickets.
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

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

  const { mode, imageBase64, mediaType, url } = body as {
    mode?: "image" | "url";
    imageBase64?: string;
    mediaType?: string;
    url?: string;
  };

  try {
    if (mode === "url") {
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
        console.error("[tickets-extract] fallo el fetch del link", err);
        return NextResponse.json({ error: "No se pudo abrir ese link" }, { status: 502 });
      }

      const text = htmlToText(html);
      if (!text) {
        return NextResponse.json({ error: "La página no tiene contenido legible" }, { status: 422 });
      }
      const tiers = await extractTicketTiersFromText(text);
      return NextResponse.json({ tiers });
    }

    // Default / mode === "image" -- pantallazo (comportamiento original)
    if (!imageBase64) {
      return NextResponse.json({ error: "Falta la imagen" }, { status: 400 });
    }
    if (imageBase64.length > MAX_BASE64_LENGTH) {
      return NextResponse.json({ error: "La imagen es muy grande — intenta con una captura más chica" }, { status: 413 });
    }
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    const type = allowedTypes.includes(mediaType ?? "") ? (mediaType as "image/jpeg" | "image/png" | "image/webp") : "image/jpeg";

    const tiers = await extractTicketTiersFromScreenshot(imageBase64, type);
    return NextResponse.json({ tiers });
  } catch (err) {
    console.error("[eventos/tickets/extract] failed", err);
    return NextResponse.json({ error: "No se pudo leer los datos — intenta de nuevo o ingresa los datos a mano" }, { status: 502 });
  }
}

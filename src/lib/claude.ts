import Anthropic from "@anthropic-ai/sdk";
import type { Temperature } from "@/types";

const apiKey = process.env.ANTHROPIC_API_KEY;

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!apiKey) return null;
  if (!client) {
    client = new Anthropic({ apiKey });
  }
  return client;
}

export function isAIEnabled(): boolean {
  return !!apiKey;
}

export interface SpotifyScreenshotExtraction {
  periodStart: string | null; // YYYY-MM-DD
  periodEnd: string | null; // YYYY-MM-DD
  listeners: number | null;
  monthlyActiveListeners: number | null;
  streams: number | null;
  streamsPerListener: number | null;
  saves: number | null;
  playlistAdds: number | null;
  followers: number | null;
  /** Campos que la IA no pudo leer con confianza — el front los deja en
   * blanco en vez de rellenar con un valor inventado. */
  fieldsNotFound: string[];
}

const SPOTIFY_EXTRACTION_FALLBACK: SpotifyScreenshotExtraction = {
  periodStart: null,
  periodEnd: null,
  listeners: null,
  monthlyActiveListeners: null,
  streams: null,
  streamsPerListener: null,
  saves: null,
  playlistAdds: null,
  followers: null,
  fieldsNotFound: [],
};

/**
 * Lee un pantallazo de Spotify for Artists (pantalla Audience > Descripción
 * general, o Home) y extrae las métricas visibles. SIEMPRE se revisa/edita
 * en el front antes de guardar — esto nunca escribe directo a la base.
 */
export async function extractSpotifyStatsFromScreenshot(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp"
): Promise<SpotifyScreenshotExtraction> {
  const anthropic = getClient();
  if (!anthropic) {
    return SPOTIFY_EXTRACTION_FALLBACK;
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          {
            type: "text",
            text: `Esta es una captura de pantalla de Spotify for Artists (panel de estadísticas de un artista). Extrae los siguientes datos si están visibles en la imagen. Responde SOLO con JSON válido, sin texto adicional.

Campos a buscar (nombres tal como aparecen en español en la interfaz):
- "Oyentes" o "Oyentes mensuales" -> listeners
- "Oyentes activos mensuales" -> monthlyActiveListeners
- "Reproducciones" -> streams
- "Reproducciones por oyente" -> streamsPerListener
- "Veces que se guardó" -> saves
- "Veces que se agregó a una playlist" -> playlistAdds
- "Seguidores" -> followers
- El rango de fechas del período mostrado (ej. "25 jun 2026 - 22 jul 2026") -> periodStart, periodEnd en formato YYYY-MM-DD

Reglas:
- Si un campo NO aparece en la imagen o no se puede leer con certeza, su valor debe ser null — nunca inventes un número.
- Los números pueden venir abreviados (ej. "60k" = 60000, "8.8K" = 8800, "1.2M" = 1200000) — conviértelos al valor completo.
- streamsPerListener puede tener decimales.
- Lista en "fieldsNotFound" los nombres de los campos (en inglés, como en el JSON) que no pudiste encontrar en la imagen.

Formato de respuesta exacto:
{
  "periodStart": "YYYY-MM-DD" | null,
  "periodEnd": "YYYY-MM-DD" | null,
  "listeners": <number> | null,
  "monthlyActiveListeners": <number> | null,
  "streams": <number> | null,
  "streamsPerListener": <number> | null,
  "saves": <number> | null,
  "playlistAdds": <number> | null,
  "followers": <number> | null,
  "fieldsNotFound": [<string>, ...]
}`,
          },
        ],
      },
    ],
  });

  try {
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { ...SPOTIFY_EXTRACTION_FALLBACK, ...parsed };
    }
  } catch (err) {
    console.error("[claude] spotify screenshot extraction parse failed", err);
  }

  return SPOTIFY_EXTRACTION_FALLBACK;
}

interface ClassifyResult {
  temperature: Temperature;
  score: number;
  nextAction: string;
  reasoning: string;
}

export async function classifyLead(
  contactInfo: {
    name: string;
    company?: string;
    source?: string;
    notes?: string;
  },
  interactionHistory: Array<{
    type: string;
    description: string;
    date: string;
  }>
): Promise<ClassifyResult> {
  const anthropic = getClient();
  if (!anthropic) {
    return {
      temperature: "cold",
      score: 25,
      nextAction: "Enviar email de introduccion",
      reasoning: "Clasificacion por defecto (sin API key configurada)",
    };
  }

  const historyText = interactionHistory
    .map((i) => `- ${i.date}: [${i.type}] ${i.description}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `Analiza este lead y clasifica su temperatura. Responde SOLO con JSON valido.

Contacto:
- Nombre: ${contactInfo.name}
- Empresa: ${contactInfo.company || "No especificada"}
- Fuente: ${contactInfo.source || "No especificada"}
- Notas: ${contactInfo.notes || "Sin notas"}

Historial de interacciones:
${historyText || "Sin interacciones registradas"}

Responde con este formato JSON exacto:
{
  "temperature": "cold" | "warm" | "hot",
  "score": <numero 0-100>,
  "nextAction": "<siguiente accion recomendada en espanol>",
  "reasoning": "<razon de la clasificacion en espanol>"
}`,
      },
    ],
  });

  try {
    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as ClassifyResult;
    }
  } catch {
    // Fall through to default
  }

  return {
    temperature: "cold",
    score: 25,
    nextAction: "Revisar manualmente",
    reasoning: "No se pudo analizar la respuesta de la IA",
  };
}

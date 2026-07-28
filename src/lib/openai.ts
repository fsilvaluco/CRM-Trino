const apiKey = process.env.OPENAI_API_KEY;

// gpt-4.1-mini: soporta visión + Structured Outputs, mucho más barato que
// gpt-4o para tareas de extracción simples como estas (leer números de una
// imagen, o mapear encabezados de columnas).
const MODEL = "gpt-4.1-mini";
const API_URL = "https://api.openai.com/v1/chat/completions";

export function isOpenAIEnabled(): boolean {
  return !!apiKey;
}

export interface SpotifyScreenshotExtraction {
  periodStart: string | null;
  periodEnd: string | null;
  listeners: number | null;
  monthlyActiveListeners: number | null;
  streams: number | null;
  streamsPerListener: number | null;
  saves: number | null;
  playlistAdds: number | null;
  followers: number | null;
  fieldsNotFound: string[];
}

const FALLBACK: SpotifyScreenshotExtraction = {
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

const EXTRACTION_PROMPT = `Esta es una captura de pantalla de Spotify for Artists (panel de estadísticas de un artista). Extrae los siguientes datos si están visibles en la imagen.

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
- Lista en "fieldsNotFound" los nombres de los campos (en inglés, como aparecen en el JSON) que no pudiste encontrar en la imagen.`;

const EXTRACTION_SCHEMA = {
  name: "spotify_stats_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      periodStart: { type: ["string", "null"] },
      periodEnd: { type: ["string", "null"] },
      listeners: { type: ["number", "null"] },
      monthlyActiveListeners: { type: ["number", "null"] },
      streams: { type: ["number", "null"] },
      streamsPerListener: { type: ["number", "null"] },
      saves: { type: ["number", "null"] },
      playlistAdds: { type: ["number", "null"] },
      followers: { type: ["number", "null"] },
      fieldsNotFound: { type: "array", items: { type: "string" } },
    },
    required: [
      "periodStart",
      "periodEnd",
      "listeners",
      "monthlyActiveListeners",
      "streams",
      "streamsPerListener",
      "saves",
      "playlistAdds",
      "followers",
      "fieldsNotFound",
    ],
    additionalProperties: false,
  },
};

/**
 * Lee un pantallazo de Spotify for Artists y extrae las métricas visibles.
 * SIEMPRE se revisa/edita en el front antes de guardar — esto nunca
 * escribe directo a la base.
 */
export async function extractSpotifyStatsFromScreenshot(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp"
): Promise<SpotifyScreenshotExtraction> {
  if (!apiKey) return FALLBACK;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: EXTRACTION_PROMPT },
            { type: "image_url", image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
          ],
        },
      ],
      response_format: { type: "json_schema", json_schema: EXTRACTION_SCHEMA },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[openai] extraction request failed", { status: res.status, body });
    throw new Error(`OpenAI respondió con error (status ${res.status})`);
  }

  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) {
    console.error("[openai] unexpected response shape", data);
    return FALLBACK;
  }

  try {
    const parsed = JSON.parse(text);
    return { ...FALLBACK, ...parsed };
  } catch (err) {
    console.error("[openai] failed to parse extraction JSON", { text, err });
    return FALLBACK;
  }
}

interface MilestoneExtraction {
  title: string;
  dueDate: string | null; // YYYY-MM-DD
  description: string;
  suggestedCampaign: string | null;
}

const MILESTONE_SCHEMA = {
  name: "milestones_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      milestones: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            dueDate: { type: ["string", "null"] },
            description: { type: "string" },
            suggestedCampaign: { type: ["string", "null"] },
          },
          required: ["title", "dueDate", "description", "suggestedCampaign"],
          additionalProperties: false,
        },
      },
    },
    required: ["milestones"],
    additionalProperties: false,
  },
};

/**
 * Lee un documento de texto libre (cronograma, contrato, plan de
 * lanzamiento, etc.) y extrae cada fecha/hito como una tarea candidata.
 * SIEMPRE se revisa/edita en el front antes de crear nada -- igual
 * filosofia que el resto de las extracciones con IA de esta app.
 */
export async function extractMilestonesFromDocument(
  documentText: string,
  campaignNames: string[],
  referenceYear: number
): Promise<MilestoneExtraction[]> {
  if (!apiKey) return [];

  const prompt = `Este es un documento con un cronograma de hitos y fechas límite (lanzamiento musical, plan de distribución, contrato, etc). Extrae CADA fecha límite o hito mencionado como un item separado.

Reglas:
- Cada fecha mencionada con una acción asociada es un item -- no agrupes varias fechas en un solo item.
- "title": resumen corto y accionable (ej. "Entregar videoclip oficial", "Depósito Cuota 1 del préstamo").
- "dueDate": formato YYYY-MM-DD. Si el documento no menciona el año explícitamente, asume el año ${referenceYear} salvo que el contexto indique claramente otro año (ej. si dice "diciembre" pero ya se mencionó que ese hito es del año siguiente).
- "description": 1-2 frases con el contexto relevante (quién participa, monto si es un pago, condición asociada).
- "suggestedCampaign": si el documento menciona una fase/campaña explícita que calce con alguna de esta lista, usa EXACTAMENTE ese nombre: ${JSON.stringify(campaignNames)}. Si no calza con ninguna o no hay suficiente contexto, usa null -- no inventes una campaña que no esté en la lista.
- Si una fecha es un rango o aproximada ("mediados de agosto", "fines de julio"), usa tu mejor estimación de fecha puntual (ej. "mediados de agosto" -> día 15 de ese mes).
- No inventes hitos que no estén en el documento.

Documento:
"""
${documentText}
"""`;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_schema", json_schema: MILESTONE_SCHEMA },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[openai] milestone extraction failed", { status: res.status, body });
    throw new Error(`OpenAI respondió con error (status ${res.status})`);
  }

  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.milestones) ? parsed.milestones : [];
  } catch (err) {
    console.error("[openai] failed to parse milestones JSON", { text, err });
    return [];
  }
}
interface SuggestMappingField {
  key: string;
  label: string;
}

/**
 * Sugiere qué columna del archivo corresponde a cada campo destino,
 * mirando los encabezados y unas filas de ejemplo. Es solo una sugerencia
 * inicial — el usuario la revisa y puede cambiar cualquier mapeo antes de
 * importar.
 */
export async function suggestColumnMapping(
  targetFields: SuggestMappingField[],
  headers: string[],
  sampleRows: Record<string, string>[]
): Promise<Record<string, string | null>> {
  const fallback: Record<string, string | null> = Object.fromEntries(targetFields.map((f) => [f.key, null]));
  if (!apiKey) return fallback;

  const prompt = `Tengo un archivo (CSV/Excel) con estas columnas: ${JSON.stringify(headers)}

Filas de ejemplo:
${JSON.stringify(sampleRows.slice(0, 5), null, 2)}

Necesito mapear cada uno de estos campos destino a la columna del archivo que mejor corresponda:
${targetFields.map((f) => `- "${f.key}" (${f.label})`).join("\n")}

Responde con un objeto JSON donde cada clave es el "key" del campo destino y el valor es el nombre EXACTO de la columna del archivo que corresponde, o null si ninguna columna corresponde a ese campo. No inventes columnas que no estén en la lista de encabezados.`;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    console.error("[openai] mapping suggestion failed", { status: res.status });
    return fallback;
  }

  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) return fallback;

  try {
    const parsed = JSON.parse(text);
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

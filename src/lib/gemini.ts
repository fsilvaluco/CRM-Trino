const apiKey = process.env.GEMINI_API_KEY;

// Modelo económico: esta tarea es leer números de una captura de pantalla,
// no requiere el modelo más potente. gemini-2.5-flash-lite es el más
// barato de la familia vigente que sigue soportando visión (los 2.0
// dejaron de estar disponibles el 1 de junio de 2026).
const MODEL = "gemini-2.5-flash-lite";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export function isGeminiEnabled(): boolean {
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

const RESPONSE_SCHEMA = {
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
  if (!apiKey) {
    return FALLBACK;
  }

  const res = await fetch(`${API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { inline_data: { mime_type: mediaType, data: imageBase64 } },
            { text: EXTRACTION_PROMPT },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[gemini] extraction request failed", { status: res.status, body });
    throw new Error(`Gemini respondió con error (status ${res.status})`);
  }

  const data = await res.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    console.error("[gemini] unexpected response shape", data);
    return FALLBACK;
  }

  try {
    const parsed = JSON.parse(text);
    return { ...FALLBACK, ...parsed };
  } catch (err) {
    console.error("[gemini] failed to parse extraction JSON", { text, err });
    return FALLBACK;
  }
}

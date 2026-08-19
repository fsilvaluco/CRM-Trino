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

interface TicketTierExtraction {
  label: string;
  unitPrice: number | null;
  quantitySold: number | null;
  capacity: number | null;
  statusLabel: string | null;
}

const TICKET_TIERS_SCHEMA = {
  name: "ticket_tiers_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      tiers: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            unitPrice: { type: ["number", "null"] },
            quantitySold: { type: ["number", "null"] },
            capacity: { type: ["number", "null"] },
            statusLabel: { type: ["string", "null"] },
          },
          required: ["label", "unitPrice", "quantitySold", "capacity", "statusLabel"],
          additionalProperties: false,
        },
      },
    },
    required: ["tiers"],
    additionalProperties: false,
  },
};

const TICKET_TIERS_PROMPT = `Esta es una captura de pantalla de un panel de venta de entradas (ej. PortalTickets, Passline, Ticketmaster, o similar). Muestra una lista de "tramos" o tipos de entrada (ej. "Preventa 1", "Preventa 2", "General", "Cortesía").

Para cada tramo, extrae:
- "label": el nombre del tramo tal como aparece (ej. "Preventa 1", "General O", "Cortesía").
- "unitPrice": el PRECIO UNITARIO ACTUAL de ese tramo (busca específicamente un campo como "Precio actual" o el precio individual de una entrada -- NO el monto total/acumulado que a veces aparece junto al nombre del tramo, que es precio x cantidad vendida, no el precio unitario).
- "quantitySold": la cantidad de tickets vendidos de ese tramo (busca "X TICKETS" o similar).
- "capacity": el cupo total de ese tramo si aparece (ej. "/ 20 CUPOS" -> 20). Si no aparece, null.
- "statusLabel": la etiqueta de estado si aparece (ej. "AGOTADA", "OCULTO", "ACTIVA"). Si no aparece, null.

Reglas:
- Un tramo con precio $0 y algún ticket vendido probablemente sea de cortesía -- aún así extráelo con unitPrice 0, no lo omitas.
- Si un número no se puede leer con certeza, usa null para ese campo específico -- nunca inventes.
- Ignora filas que sean claramente encabezados o totales generales, no tramos individuales.
- Devuelve los tramos en el mismo orden en que aparecen en la imagen.`;

/**
 * Lee un pantallazo de una plataforma de venta de entradas y extrae los
 * tramos (preventa, general, cortesía, etc.) con precio unitario y
 * cantidad vendida. SIEMPRE se revisa/edita en el front antes de guardar.
 */
export async function extractTicketTiersFromScreenshot(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp"
): Promise<TicketTierExtraction[]> {
  if (!apiKey) return [];

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
            { type: "text", text: TICKET_TIERS_PROMPT },
            { type: "image_url", image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
          ],
        },
      ],
      response_format: { type: "json_schema", json_schema: TICKET_TIERS_SCHEMA },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[openai] ticket tiers extraction failed", { status: res.status, body });
    throw new Error(`OpenAI respondió con error (status ${res.status})`);
  }

  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.tiers) ? parsed.tiers : [];
  } catch (err) {
    console.error("[openai] failed to parse ticket tiers JSON", { text, err });
    return [];
  }
}

export interface ReceiptExtraction {
  amount: number | null;
  vendor: string | null;
  description: string | null;
}

const FALLBACK_RECEIPT: ReceiptExtraction = { amount: null, vendor: null, description: null };

const RECEIPT_SCHEMA = {
  name: "receipt_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      amount: { type: ["number", "null"] },
      vendor: { type: ["string", "null"] },
      description: { type: ["string", "null"] },
    },
    required: ["amount", "vendor", "description"],
    additionalProperties: false,
  },
};

const RECEIPT_PROMPT = `Este es un comprobante de un gasto (boleta, factura, recibo de transferencia, captura de un pago, etc.), asociado a un evento en vivo.

Extrae:
- "amount": el MONTO TOTAL pagado (el total final, no un subtotal ni un ítem individual dentro del comprobante). Como número, sin símbolo de moneda ni puntos/comas de miles (ej. $45.000 -> 45000).
- "vendor": a quién se le pagó -- el proveedor, comercio o persona que RECIBIÓ la plata.
- "description": una descripción corta de qué es el gasto, si se puede inferir (ej. "Arriendo de sonido", "Transporte equipo"). Si no se puede inferir nada razonable, null.

Reglas para "vendor":
- Si es un COMPROBANTE DE TRANSFERENCIA (tiene "Origen" y "Destino", o "De"/"Para", dos cuentas bancarias): "vendor" es SIEMPRE la persona/cuenta de DESTINO (quien recibe la plata) -- NUNCA la persona de origen (quien envía/paga), aunque el origen aparezca primero o más destacado en el comprobante.
- Si es una boleta/factura de un comercio: "vendor" es el comercio que emitió el documento.
- Nunca uses como "vendor" a quien está pagando/enviando el dinero.

Reglas para "amount":
- Si el monto total no se puede leer con certeza, usa null -- nunca inventes un número.
- Si el comprobante tiene varios montos (subtotal, IVA, total), usa el TOTAL final.
- Los montos vienen normalmente en pesos chilenos (CLP), sin decimales.`;

/**
 * Lee una imagen (foto de una boleta/factura/comprobante) y extrae el
 * monto total pagado. SIEMPRE es solo una sugerencia editable -- quien
 * reporta el gasto revisa/corrige el monto antes de enviar.
 */
export async function extractReceiptFromImage(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp"
): Promise<ReceiptExtraction> {
  if (!apiKey) return FALLBACK_RECEIPT;

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
            { type: "text", text: RECEIPT_PROMPT },
            { type: "image_url", image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
          ],
        },
      ],
      response_format: { type: "json_schema", json_schema: RECEIPT_SCHEMA },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[openai] receipt image extraction failed", { status: res.status, body });
    throw new Error(`OpenAI respondió con error (status ${res.status})`);
  }

  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) return FALLBACK_RECEIPT;

  try {
    return { ...FALLBACK_RECEIPT, ...JSON.parse(text) };
  } catch (err) {
    console.error("[openai] failed to parse receipt image JSON", { text, err });
    return FALLBACK_RECEIPT;
  }
}

const RECEIPT_TEXT_PROMPT = `${RECEIPT_PROMPT}

Texto extraído del documento (PDF):
"""
{{TEXT}}
"""`;

/**
 * Lee texto plano (extraído de un PDF) y extrae el monto total del
 * comprobante. Mismo criterio que extractReceiptFromImage.
 */
export async function extractReceiptFromText(rawText: string): Promise<ReceiptExtraction> {
  if (!apiKey) return FALLBACK_RECEIPT;
  if (!rawText.trim()) return FALLBACK_RECEIPT;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [{ role: "user", content: RECEIPT_TEXT_PROMPT.replace("{{TEXT}}", rawText.slice(0, 12000)) }],
      response_format: { type: "json_schema", json_schema: RECEIPT_SCHEMA },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[openai] receipt text extraction failed", { status: res.status, body });
    throw new Error(`OpenAI respondió con error (status ${res.status})`);
  }

  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) return FALLBACK_RECEIPT;

  try {
    return { ...FALLBACK_RECEIPT, ...JSON.parse(text) };
  } catch (err) {
    console.error("[openai] failed to parse receipt text JSON", { text, err });
    return FALLBACK_RECEIPT;
  }
}

const SETLIST_SCHEMA = {
  name: "setlist_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      songs: { type: "array", items: { type: "string" } },
    },
    required: ["songs"],
    additionalProperties: false,
  },
};

const SETLIST_IMAGE_PROMPT = `Esta imagen muestra un setlist (lista de canciones a tocar en un show), ya sea escrito a mano, en una nota, o en algún formato de lista.

Extrae cada canción como un string, en el mismo orden en que aparecen en la imagen. Reglas:
- Quita numeración (ej. "1.", "2)") y viñetas -- deja solo el nombre de la canción.
- Si hay anotaciones extra junto al título (tonalidad, BPM, "acústico", nombre del intérprete si es sesionista, etc.), puedes dejarlas como parte del texto si están pegadas al nombre, pero no inventes nada que no esté escrito.
- Si la imagen no es un setlist o no se puede leer ninguna canción con certeza, devuelve una lista vacía.`;

const SETLIST_TEXT_PROMPT = `El siguiente texto es un setlist (lista de canciones a tocar en un show), posiblemente extraído de un PDF o pegado directamente. Puede tener numeración, viñetas, o líneas en blanco entremedio.

Extrae cada canción como un string, en el mismo orden en que aparece. Reglas:
- Quita numeración y viñetas -- deja solo el nombre de la canción (y anotaciones pegadas al título si las hay, como tonalidad).
- Ignora líneas que sean claramente encabezados, notas generales, o texto que no sea el nombre de una canción (ej. "SETLIST GAMUZA", "Duración total: 45 min").
- Si no se detecta ninguna canción, devuelve una lista vacía.

Texto:
"""
{{TEXT}}
"""`;

/**
 * Lee una imagen (foto de un papel, captura de nota, etc.) y extrae la
 * lista de canciones. SIEMPRE se revisa/edita en el front antes de guardar.
 */
export async function extractSetlistFromImage(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp"
): Promise<string[]> {
  if (!apiKey) return [];

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
            { type: "text", text: SETLIST_IMAGE_PROMPT },
            { type: "image_url", image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
          ],
        },
      ],
      response_format: { type: "json_schema", json_schema: SETLIST_SCHEMA },
    }),
  });

  if (!res.ok) {
    console.error("[openai] setlist image extraction failed", { status: res.status, body: await res.text() });
    throw new Error(`OpenAI respondió con error (status ${res.status})`);
  }

  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.songs) ? parsed.songs : [];
  } catch (err) {
    console.error("[openai] failed to parse setlist image JSON", { text, err });
    return [];
  }
}

/**
 * Lee texto plano (pegado a mano, o extraído de un PDF/.txt) y extrae la
 * lista de canciones. SIEMPRE se revisa/edita en el front antes de guardar.
 */
export async function extractSetlistFromText(rawText: string): Promise<string[]> {
  if (!apiKey) return [];
  if (!rawText.trim()) return [];

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [{ role: "user", content: SETLIST_TEXT_PROMPT.replace("{{TEXT}}", rawText.slice(0, 12000)) }],
      response_format: { type: "json_schema", json_schema: SETLIST_SCHEMA },
    }),
  });

  if (!res.ok) {
    console.error("[openai] setlist text extraction failed", { status: res.status, body: await res.text() });
    throw new Error(`OpenAI respondió con error (status ${res.status})`);
  }

  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.songs) ? parsed.songs : [];
  } catch (err) {
    console.error("[openai] failed to parse setlist text JSON", { text, err });
    return [];
  }
}

interface TimingExtraction {
  timeLabel: string | null;
  activity: string;
  responsable: string | null;
  notes: string | null;
}

const TIMING_SCHEMA = {
  name: "timing_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            timeLabel: { type: ["string", "null"] },
            activity: { type: "string" },
            responsable: { type: ["string", "null"] },
            notes: { type: ["string", "null"] },
          },
          required: ["timeLabel", "activity", "responsable", "notes"],
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  },
};

const TIMING_INSTRUCTIONS = `Esto es un cronograma/timing de un evento en vivo (montaje, soundcheck, apertura de puertas, show, desmontaje, etc.), típicamente con columnas como "Hora", "Actividad", "Responsable" y "Notas/Detalles".

Para cada fila del cronograma extrae:
- "timeLabel": la hora u horario tal como aparece (ej. "14:30", "15:00 - 16:30"). Si no hay hora para esa fila, null.
- "activity": la actividad/detalle de esa fila (ej. "Montaje de estructuras y backline"). Este campo es obligatorio -- si no se puede determinar la actividad, no incluyas esa fila.
- "responsable": quién está a cargo, si aparece (ej. "Diego Millán"). Si hay varios nombres, déjalos juntos como un string. Si no aparece, null.
- "notes": notas o detalles adicionales de esa fila, si aparecen. Si no, null.

Reglas:
- Ignora encabezados de sección que no son filas reales (ej. "MONTAJE", "PRODUCCIÓN", "EVENTO", "DESMONTAJE" como títulos de bloque) -- esos no tienen su propia hora/actividad real, son separadores.
- Ignora encabezados de tabla (ej. la fila que dice literalmente "Hora | Actividad | Responsable | Notas").
- Mantén el orden en que aparecen las filas.
- No inventes datos que no estén escritos -- usa null si no se puede leer con certeza.`;

const TIMING_TEXT_PROMPT = `${TIMING_INSTRUCTIONS}

Texto:
"""
{{TEXT}}
"""`;

/**
 * Lee una imagen (foto o captura de un cronograma/timing) y extrae cada
 * fila. SIEMPRE se revisa/edita en el front antes de guardar.
 */
export async function extractTimingFromImage(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp"
): Promise<TimingExtraction[]> {
  if (!apiKey) return [];

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
            { type: "text", text: TIMING_INSTRUCTIONS },
            { type: "image_url", image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
          ],
        },
      ],
      response_format: { type: "json_schema", json_schema: TIMING_SCHEMA },
    }),
  });

  if (!res.ok) {
    console.error("[openai] timing image extraction failed", { status: res.status, body: await res.text() });
    throw new Error(`OpenAI respondió con error (status ${res.status})`);
  }

  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch (err) {
    console.error("[openai] failed to parse timing image JSON", { text, err });
    return [];
  }
}

/**
 * Lee texto plano (pegado a mano, o extraído de un PDF/.txt) y extrae cada
 * fila del cronograma. SIEMPRE se revisa/edita en el front antes de guardar.
 */
export async function extractTimingFromText(rawText: string): Promise<TimingExtraction[]> {
  if (!apiKey) return [];
  if (!rawText.trim()) return [];

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [{ role: "user", content: TIMING_TEXT_PROMPT.replace("{{TEXT}}", rawText.slice(0, 12000)) }],
      response_format: { type: "json_schema", json_schema: TIMING_SCHEMA },
    }),
  });

  if (!res.ok) {
    console.error("[openai] timing text extraction failed", { status: res.status, body: await res.text() });
    throw new Error(`OpenAI respondió con error (status ${res.status})`);
  }

  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch (err) {
    console.error("[openai] failed to parse timing text JSON", { text, err });
    return [];
  }
}

const TICKET_TIERS_TEXT_PROMPT = `${TICKET_TIERS_PROMPT}

Texto de la página (extraído de una web de venta de entradas, ej. PortalTickets):
"""
{{TEXT}}
"""`;

/**
 * Lee texto plano (extraído del HTML de una página de estadísticas de
 * ticketera, ej. PortalTickets/PortalDisc) y extrae los tramos. Pensado
 * para el botón "Sincronizar" -- se puede re-ejecutar cuando quieran
 * refrescar los números sin subir un pantallazo de nuevo.
 */
export async function extractTicketTiersFromText(rawText: string): Promise<TicketTierExtraction[]> {
  if (!apiKey) return [];
  if (!rawText.trim()) return [];

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [{ role: "user", content: TICKET_TIERS_TEXT_PROMPT.replace("{{TEXT}}", rawText.slice(0, 12000)) }],
      response_format: { type: "json_schema", json_schema: TICKET_TIERS_SCHEMA },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[openai] ticket tiers text extraction failed", { status: res.status, body });
    throw new Error(`OpenAI respondió con error (status ${res.status})`);
  }

  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.tiers) ? parsed.tiers : [];
  } catch (err) {
    console.error("[openai] failed to parse ticket tiers text JSON", { text, err });
    return [];
  }
}

export interface PressMentionExtraction {
  outlet: string | null;
  // String libre (no enum) -- se normaliza a PressMentionType en la capa de
  // API, mismo criterio que el resto de las extracciones (ej. statusLabel
  // de ticket tiers), para no arriesgar un error de schema por mezclar
  // enum + null en la respuesta estructurada de OpenAI.
  type: string | null;
  title: string | null;
  mentionDate: string | null; // YYYY-MM-DD
}

const FALLBACK_PRESS_MENTION: PressMentionExtraction = { outlet: null, type: null, title: null, mentionDate: null };

const PRESS_MENTION_SCHEMA = {
  name: "press_mention_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      outlet: { type: ["string", "null"] },
      type: { type: ["string", "null"] },
      title: { type: ["string", "null"] },
      mentionDate: { type: ["string", "null"] },
    },
    required: ["outlet", "type", "title", "mentionDate"],
    additionalProperties: false,
  },
};

const PRESS_MENTION_PROMPT = `Este es el texto de una nota de prensa, artículo, o página web que menciona a un artista o proyecto musical. Extrae:

- "outlet": el nombre del medio que publicó la nota (ej. "La Tercera", "Rockaxis", "Radio Futuro", "Página 12"). Si no se puede identificar con certeza, null.
- "type": el tipo de medio, EXACTAMENTE uno de estos 4 valores: "radio" (si es una radio), "tv" (televisión), "digital_rrss" (una publicación de redes sociales -- Instagram, YouTube, TikTok -- o un medio 100% de RRSS), "digital" (cualquier otro medio digital/web: portales de noticias, blogs, revistas online -- el más común). Si no se puede inferir, null.
- "title": un resumen corto (una frase) de qué trata la mención -- de qué habla la nota en relación al artista/proyecto (ej. "Reseña del nuevo single", "Entrevista sobre la gira 2026"). Si no se puede inferir nada razonable, null.
- "mentionDate": la fecha de publicación de la nota, en formato YYYY-MM-DD, si aparece en el texto. Si no aparece o no se puede leer con certeza, null -- nunca inventes una fecha.

Reglas:
- Nunca inventes datos que no aparezcan claramente en el texto -- usa null en cualquier campo que no puedas leer con certeza.
- El texto puede venir con ruido de navegación/menús del sitio (es HTML convertido a texto plano) -- ignora eso y enfócate en el contenido del artículo.`;

const PRESS_MENTION_TEXT_PROMPT = `${PRESS_MENTION_PROMPT}

Texto de la página:
"""
{{TEXT}}
"""`;

/**
 * Lee texto plano (extraído del HTML de un link de prensa) y sugiere los
 * datos de la mención (medio, tipo, descripción, fecha) para precargar el
 * formulario de "Registrar mención de prensa". Siempre editable antes de
 * guardar -- igual que el resto de las extracciones con IA de la app.
 */
export async function extractPressMentionFromText(rawText: string): Promise<PressMentionExtraction> {
  if (!apiKey) return FALLBACK_PRESS_MENTION;
  if (!rawText.trim()) return FALLBACK_PRESS_MENTION;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [{ role: "user", content: PRESS_MENTION_TEXT_PROMPT.replace("{{TEXT}}", rawText.slice(0, 12000)) }],
      response_format: { type: "json_schema", json_schema: PRESS_MENTION_SCHEMA },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[openai] press mention text extraction failed", { status: res.status, body });
    throw new Error(`OpenAI respondió con error (status ${res.status})`);
  }

  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) return FALLBACK_PRESS_MENTION;

  try {
    return { ...FALLBACK_PRESS_MENTION, ...JSON.parse(text) };
  } catch (err) {
    console.error("[openai] failed to parse press mention text JSON", { text, err });
    return FALLBACK_PRESS_MENTION;
  }
}

interface MilestoneExtraction {
  title: string;
  dueDate: string | null; // YYYY-MM-DD
  description: string;
  suggestedCampaign: string | null;
  assigneeName: string | null;
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
            assigneeName: { type: ["string", "null"] },
          },
          required: ["title", "dueDate", "description", "suggestedCampaign", "assigneeName"],
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
  referenceYear: number,
  memberNames: string[] = [],
  referenceDate: string = new Date().toISOString().slice(0, 10)
): Promise<MilestoneExtraction[]> {
  if (!apiKey) return [];

  const prompt = `Este documento puede ser un cronograma de hitos (lanzamiento musical, plan de distribución, contrato) O una nota/transcripción de una reunión (ej. notas de Gemini de Meet, con un resumen y luego la transcripción completa). Extrae CADA fecha límite, compromiso o "próximo paso" mencionado como un item separado -- tanto los que tienen fecha explícita como los compromisos claros sin fecha exacta (ej. "lo envío esta semana").

Reglas para fechas:
- "dueDate": formato YYYY-MM-DD, o null si es imposible estimar una fecha razonable.
- Si el documento no menciona el año explícitamente, asume el año ${referenceYear} salvo que el contexto indique claramente otro año.
- Si una fecha es un rango o aproximada ("mediados de agosto", "fines de julio"), usa tu mejor estimación de fecha puntual (ej. "mediados de agosto" -> día 15 de ese mes).
- Este documento puede tener su propia fecha (ej. la fecha de una reunión, indicada al inicio como "jul 17, 2026" o similar). Si encuentras esa fecha, ÚSALA como ancla para resolver expresiones relativas ("esta semana", "el viernes que viene", "en una semana más", "el próximo lunes") -- no la fecha de hoy. Si el documento no trae ninguna fecha propia, usa ${referenceDate} como ancla.
- Cuando el documento tiene tanto un resumen ("Próximos pasos") como una transcripción completa, usa la transcripción para desambiguar o encontrar contexto de fecha que el resumen no deja claro (ej. "el viernes" puede aclararse en la transcripción como "el viernes que viene"), pero no dupliques el mismo compromiso como dos items distintos si aparece en ambas partes -- es un solo item.

Otras reglas:
- Cada compromiso es un item -- no agrupes varios en uno solo.
- "title": resumen corto y accionable (ej. "Entregar videoclip oficial", "Enviar máster sin voz").
- "description": 1-2 frases con el contexto relevante (quién participa, monto si es un pago, condición asociada).
- "suggestedCampaign": si el documento menciona una fase/campaña explícita que calce con alguna de esta lista, usa EXACTAMENTE ese nombre: ${JSON.stringify(campaignNames)}. Si no calza con ninguna o no hay suficiente contexto, usa null -- no inventes una campaña que no esté en la lista.
- "assigneeName": si el compromiso tiene un responsable claro (ej. "[Denis] Enviar contenidos", o se deduce de la transcripción) y ese nombre calza con alguien de esta lista de integrantes del proyecto, usa EXACTAMENTE ese nombre: ${JSON.stringify(memberNames)}. Si no calza con nadie de la lista o no hay responsable claro, usa null -- no inventes ni adivines un integrante que no esté en la lista.
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
/**
 * Dado un link de Google Docs, descarga el contenido como texto plano usando
 * el endpoint de export de Google Docs (funciona sin login siempre que el
 * doc esté compartido como "cualquiera con el link puede ver" -- que es el
 * caso por defecto de las notas de Gemini de Meet). No sirve para docs
 * restringidos a cuentas específicas; en ese caso hay que pegar el texto
 * directamente.
 */
export async function fetchGoogleDocText(url: string): Promise<string> {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) {
    throw new Error("Ese link no parece ser de Google Docs. Pega el texto directamente.");
  }
  const docId = match[1];
  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;

  const res = await fetch(exportUrl, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(
      "No se pudo leer el documento (¿el link requiere acceso restringido? cambia el permiso a 'Cualquier persona con el link' o pega el texto directamente)"
    );
  }
  const text = await res.text();
  // Si Google redirige a una pantalla de login, el body es HTML, no texto plano.
  if (text.trim().startsWith("<") || text.includes("accounts.google.com/ServiceLogin")) {
    throw new Error(
      "El documento requiere inicio de sesión para verlo. Cambia el permiso a 'Cualquier persona con el link' o pega el texto directamente."
    );
  }
  return text;
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

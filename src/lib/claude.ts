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

interface ClassifyResult {
  temperature: Temperature;
  score: number;
  nextAction: string;
  reasoning: string;
}

export interface EmailLeadCandidate {
  signalReason: string;
  dealTitle: string;
  summary: string;
  detectedName: string | null;
  detectedEmail: string | null;
  detectedPhone: string | null;
  detectedCompany: string | null;
  artistProjectId: string | null;
}

interface DetectLeadsInput {
  fromAddress: string;
  subject: string;
  snippet: string;
  selloName: string;
  artistProjects: Array<{ id: string; name: string }>;
}

/**
 * Analiza un correo (solo remitente, asunto y el snippet corto que Gmail
 * ya genera -- nunca el cuerpo completo) y devuelve 0, 1 o VARIOS leads
 * candidatos. Puede devolver varios cuando el mismo correo menciona mas
 * de una linea de negocio (ej: un matrimonio que pide el artista Y un
 * servicio de sonido por separado).
 */
export async function detectLeadsInEmail(
  input: DetectLeadsInput
): Promise<EmailLeadCandidate[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[detectLeadsInEmail] OPENAI_API_KEY no configurada -- omitiendo clasificacion");
    return [];
  }

  const artistList = input.artistProjects.length
    ? input.artistProjects.map((p) => `- ${p.name} (id: ${p.id})`).join("\n")
    : "(sin artistas asociados)";

  const prompt = `Eres un asistente que revisa correos de una agencia de management musical/eventos (${input.selloName}) para detectar oportunidades de negocio (leads) reales.

Correo a analizar:
- De: ${input.fromAddress}
- Asunto: ${input.subject}
- Fragmento: ${input.snippet}

Artistas/proyectos asociados a ${input.selloName} (usa el id EXACTO si el correo menciona a uno de ellos; si no aplica a ninguno, usa null):
${artistList}

Instrucciones:
- Solo marca como lead correos que sugieran una oportunidad comercial real (cotizacion, propuesta de show/evento, contratacion, interes concreto). Ignora spam, newsletters, correos internos, o conversaciones ya cerradas/administrativas.
- Si el correo menciona VARIAS lineas de negocio distintas (ej: contratar un artista Y por separado un servicio de sonido o podcast), devuelve un lead SEPARADO por cada linea -- no los mezcles en uno solo.
- No inventes datos que no estan en el texto. Si no sabes el nombre, telefono o empresa, usa null.
- "dealTitle": un titulo corto y concreto para el trato, tipo "Artista en Evento/Lugar" (ej: "Gamuza en Festival Peñalolén", "Deni Li en matrimonio Las Rosas"). Si no hay nombre de evento/lugar, usa "Artista con Empresa/Persona".
- "summary": 1-2 frases en tus propias palabras resumiendo la oportunidad (que se pide, cuando, donde, cualquier detalle util) -- NO copies el texto del correo tal cual, parafrasea.
- "signalReason": una frase MUY corta (3-6 palabras) de por que se marco como lead, para mostrar como etiqueta (ej: "Cotizacion para festival").

Responde SOLO con JSON valido, sin texto adicional, con este formato exacto:
{
  "leads": [
    {
      "signalReason": "<3-6 palabras, ej: 'Cotizacion para festival'>",
      "dealTitle": "<titulo corto tipo 'Artista en Evento/Lugar'>",
      "summary": "<1-2 frases parafraseando la oportunidad>",
      "detectedName": "<nombre o null>",
      "detectedEmail": "<email o null>",
      "detectedPhone": "<telefono o null>",
      "detectedCompany": "<empresa o null>",
      "artistProjectId": "<id de la lista o null>"
    }
  ]
}

Si no es un lead, responde: {"leads": []}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });

  if (!res.ok) {
    console.error("[detectLeadsInEmail] OpenAI error", await res.text());
    return [];
  }

  try {
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(text) as { leads?: EmailLeadCandidate[] };
    return Array.isArray(parsed.leads) ? parsed.leads : [];
  } catch {
    return [];
  }
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

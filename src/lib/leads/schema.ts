import { z } from "zod";

// Contrato del POST /api/leads/ingest. Los nombres calzan con el formulario
// de la landing (sisoy.pro/podcast). Todo lo opcional acepta "" o null.
const optionalText = (max: number) =>
  z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => (v === null || v === undefined ? null : String(v).trim().slice(0, max) || null));

export const leadIngestSchema = z.object({
  form: z.string().trim().min(1).max(64),
  name: z.string().trim().min(2, "Nombre requerido").max(120),
  phone: z.string().trim().min(8, "WhatsApp requerido").max(30),
  email: z
    .union([z.string().trim().email().max(160), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v ? v : null)),
  event_date: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato AAAA-MM-DD"), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v ? v : null)),
  venue: optionalText(160),
  guests: optionalText(20),
  comuna: optionalText(80),
  heard_from: optionalText(80),
  contact_time: optionalText(40),
  message: optionalText(1000),
  utm_source: optionalText(120),
  utm_medium: optionalText(120),
  utm_campaign: optionalText(160),
  utm_content: optionalText(160),
  utm_term: optionalText(160),
  fbclid: optionalText(500),
  fbp: optionalText(200),
  fbc: optionalText(600),
  event_id: z
    .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v ? v : null)),
  page_url: optionalText(500),
  // Honeypot: campo invisible en el formulario. Si viene con contenido, es un bot.
  website: optionalText(200),
});

export type LeadIngestInput = z.infer<typeof leadIngestSchema>;

// La landing puede mandar las cookies con su nombre original (_fbp/_fbc).
export function normalizeIncomingKeys(body: Record<string, unknown>): Record<string, unknown> {
  const out = { ...body };
  if (out.fbp === undefined && typeof out._fbp === "string") out.fbp = out._fbp;
  if (out.fbc === undefined && typeof out._fbc === "string") out.fbc = out._fbc;
  return out;
}

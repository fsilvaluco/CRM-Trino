import type { LeadFormConfig } from "./forms";
import type { LeadIngestInput } from "./schema";

// Arma el registro legible que queda en deals.notes cuando entra un lead
// (formulario publico o "Lead rapido"). Omite las lineas sin datos.

const CHILE_TZ = "America/Santiago";

/** "23-09-2026 17:20" en hora de Chile. */
export function formatChileDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("es-CL", {
    timeZone: CHILE_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")} ${get("hour")}:${get("minute")}`;
}

// Leads de formularios instantaneos de Meta (/api/leads/meta-webhook): llegan
// con utm_source=meta_lead_ads, utm_medium=plataforma (fb/ig),
// utm_campaign=campaña, utm_term=conjunto de anuncios y utm_content=anuncio.
export const META_LEAD_ADS_SOURCE = "meta_lead_ads";
export const META_LEAD_ADS_LABEL = "Meta Lead Ads (formulario instantáneo)";

export function isMetaLeadAds(input: LeadIngestInput): boolean {
  return input.utm_source === META_LEAD_ADS_SOURCE;
}

/** Origen del lead: canal manual, Meta Lead Ads, pauta (ads), organico o web. */
export function leadOrigin(input: LeadIngestInput, formKey: string): string {
  if (formKey === "quick") return input.heard_from ?? "manual";
  if (isMetaLeadAds(input)) return META_LEAD_ADS_SOURCE;
  if (input.utm_source || input.fbclid) return "ads";
  return input.heard_from ? "organico" : "web";
}

/**
 * Una respuesta del formulario (ej. formularios instantaneos de Meta). Se
 * guardan todas en deals.lead_meta.answers; las que no calzan con un campo
 * conocido (nombre, telefono, email, fecha...) se muestran en notas y avisos.
 */
export interface LeadAnswer {
  key: string;
  label: string;
  value: string;
  /** true si ya quedo en un campo conocido del lead (no se repite en notas). */
  mapped?: boolean;
}

/** "Etiqueta: valor" por cada respuesta que no quedo en un campo conocido. */
export function formatAnswerLines(answers: LeadAnswer[] | null | undefined): string[] {
  return (answers ?? []).filter((a) => !a.mapped && a.value).map((a) => `${a.label}: ${a.value}`);
}

export interface LeadNotesParams {
  formKey: string;
  form: LeadFormConfig;
  input: LeadIngestInput;
  phone: string | null;
  email: string | null;
  receivedAt?: Date;
  /** "new": trato recien creado; "resubmit": nuevo envio sobre un trato abierto. */
  kind?: "new" | "resubmit";
  /** Respuestas del formulario; las no mapeadas se agregan al final. */
  answers?: LeadAnswer[];
}

const PLATFORM_LABEL: Record<string, string> = { fb: "Facebook", ig: "Instagram", an: "Audience Network", ms: "Messenger" };

const joinParts = (parts: (string | null | false | undefined)[]) => parts.filter(Boolean).join(" · ");

export function formatLeadNotes({
  formKey,
  form,
  input,
  phone,
  email,
  receivedAt = new Date(),
  kind = "new",
  answers,
}: LeadNotesParams): string {
  const isQuick = formKey === "quick";
  const isMeta = !isQuick && isMetaLeadAds(input);
  const when = `${formatChileDateTime(receivedAt)} (Chile)`;
  const source = isQuick
    ? `Canal: ${input.heard_from ?? "manual"}`
    : isMeta
      ? `${META_LEAD_ADS_LABEL} · ${form.productName}`
      : `Formulario ${form.productName}`;
  const title =
    kind === "resubmit" ? "📥 Nuevo envío" : isQuick ? "📥 Lead cargado a mano" : "📥 Lead recibido";

  const utm = [
    input.utm_source && `utm_source=${input.utm_source}`,
    input.utm_campaign && `utm_campaign=${input.utm_campaign}`,
    input.utm_content && `utm_content=${input.utm_content}`,
  ].filter(Boolean);

  const metaAd = isMeta
    ? joinParts([
        input.utm_medium && `Plataforma: ${PLATFORM_LABEL[input.utm_medium] ?? input.utm_medium}`,
        input.utm_campaign && `Campaña: ${input.utm_campaign}`,
        input.utm_term && `Conjunto: ${input.utm_term}`,
        input.utm_content && `Anuncio: ${input.utm_content}`,
      ])
    : "";

  const lines = [
    `${title} ${when} · ${source}`,
    phone && `WhatsApp: ${phone}`,
    email && `Email: ${email}`,
    joinParts([
      input.event_date && `Fecha del evento: ${input.event_date}`,
      input.venue && `Lugar: ${input.venue}`,
      input.comuna && `Comuna: ${input.comuna}`,
      input.guests && `Invitados: ${input.guests}`,
    ]),
    joinParts([
      // En el lead rapido el canal ya va en el encabezado.
      !isQuick && input.heard_from && `Cómo nos conoció: ${input.heard_from}`,
      input.contact_time && `Contactar: ${input.contact_time}`,
    ]),
    isMeta
      ? `Origen: ${META_LEAD_ADS_LABEL}${metaAd ? ` (${metaAd})` : ""}`
      : !isQuick && `Origen: ${leadOrigin(input, formKey)}${utm.length ? ` (${utm.join(", ")})` : ""}`,
    input.message && `Mensaje: ${input.message}`,
    ...formatAnswerLines(answers),
  ];
  return lines.filter(Boolean).join("\n");
}

/** Agrega un bloque al final de las notas existentes sin pisarlas. */
export function appendNotes(existing: string | null | undefined, block: string): string {
  const prev = existing?.trimEnd();
  return prev ? `${prev}\n\n${block}` : block;
}

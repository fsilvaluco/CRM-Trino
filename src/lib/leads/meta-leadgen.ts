import { createHmac, createHash, randomBytes, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { META_LEAD_ADS_SOURCE } from "./notes";

// Leads de formularios instantaneos de Meta Lead Ads (Facebook / Instagram).
// Meta avisa por webhook (objeto Page, campo leadgen) solo con el leadgen_id;
// los datos del formulario se piden a la Graph API con el token de la pagina.
// Credenciales por proyecto en artist_integrations, platform='meta_leadgen':
//   account_id   = ID de la pagina de Facebook
//   account_name = nombre de la pagina (opcional)
//   access_token = token de acceso de la pagina (permiso leads_retrieval)
//   config       = { app_secret, verify_token }
//   last_sync_at = ultimo lead recibido por el webhook

export const META_LEADGEN_PLATFORM = "meta_leadgen";
const GRAPH_API_VERSION = "v21.0";

export interface MetaLeadgenIntegration {
  id: string;
  organizationId: string;
  projectId: string | null;
  pageId: string | null;
  pageAccessToken: string | null;
  appSecret: string | null;
  verifyToken: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toIntegration(row: any): MetaLeadgenIntegration {
  const config = (row.config ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id ?? null,
    pageId: str(row.account_id),
    pageAccessToken: str(row.access_token),
    appSecret: str(config.app_secret),
    verifyToken: str(config.verify_token),
  };
}

export async function listMetaLeadgenIntegrations(db: SupabaseClient): Promise<MetaLeadgenIntegration[]> {
  const { data, error } = await db
    .from("artist_integrations")
    .select("id, organization_id, project_id, account_id, access_token, config")
    .eq("platform", META_LEADGEN_PLATFORM);
  if (error) throw new Error(`No se pudieron leer las integraciones meta_leadgen: ${error.message}`);
  return (data ?? []).map(toIntegration);
}

export function generateVerifyToken(): string {
  return randomBytes(24).toString("hex");
}

export function metaLeadgenCallbackUrl(): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://artistpro.app").replace(/\/+$/, "");
  return `${base}/api/leads/meta-webhook`;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Compara el verify_token del handshake de Meta sin filtrar tiempos. */
export function verifyTokenMatches(expected: string | null, received: string | null): boolean {
  return Boolean(expected && received) && safeEqual(expected!, received!);
}

/** Valida X-Hub-Signature-256 ("sha256=<hex>") contra el cuerpo crudo. */
export function isValidMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
  return safeEqual(expected, header.trim());
}

export interface LeadgenChange {
  leadgenId: string;
  pageId: string | null;
  formId: string | null;
  adId: string | null;
  adgroupId: string | null;
  createdTime: number | null;
}

/** Extrae los cambios `leadgen` del payload del webhook (objeto Page). */
export function extractLeadgenChanges(payload: unknown): LeadgenChange[] {
  const out: LeadgenChange[] = [];
  const entries = (payload as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return out;
  const str = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const c = change as { field?: unknown; value?: Record<string, unknown> };
      if (c.field !== "leadgen" || !c.value) continue;
      const leadgenId = str(c.value.leadgen_id);
      if (!leadgenId) continue;
      const created = Number(c.value.created_time);
      out.push({
        leadgenId,
        pageId: str(c.value.page_id) ?? str((entry as { id?: unknown }).id),
        formId: str(c.value.form_id),
        adId: str(c.value.ad_id),
        adgroupId: str(c.value.adgroup_id),
        createdTime: Number.isFinite(created) && created > 0 ? created : null,
      });
    }
  }
  return out;
}

export interface GraphLead {
  id: string;
  created_time?: string;
  field_data?: { name: string; values?: string[] }[];
  ad_id?: string;
  ad_name?: string;
  adset_name?: string;
  campaign_name?: string;
  form_id?: string;
  platform?: string;
  is_organic?: boolean;
}

async function graphRequest(
  path: string,
  token: string,
  init: { method?: "GET" | "POST"; params?: Record<string, string> } = {}
): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ ...(init.params ?? {}), access_token: token });
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${path}?${qs.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { method: init.method ?? "GET", signal: controller.signal, cache: "no-store" });
    const body = (await res.json().catch(() => null)) as (Record<string, unknown> & { error?: { message?: string } }) | null;
    if (!res.ok || !body || body.error) {
      throw new Error(`Graph API ${res.status}: ${body?.error?.message ?? "respuesta invalida"}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * El token guardado puede ser de pagina o de usuario del sistema. Con un token
 * de usuario (del sistema) se pide el token de la pagina; si no se puede, se
 * usa el guardado tal cual.
 */
export async function resolvePageAccessToken(pageId: string, token: string): Promise<string> {
  try {
    const body = await graphRequest(encodeURIComponent(pageId), token, { params: { fields: "access_token" } });
    return typeof body.access_token === "string" && body.access_token ? body.access_token : token;
  } catch {
    return token;
  }
}

/** Suscribe la pagina a la app (campo leadgen). Devuelve las apps suscritas despues. */
export async function subscribePageToLeadgen(pageId: string, token: string): Promise<string[]> {
  const pageToken = await resolvePageAccessToken(pageId, token);
  await graphRequest(`${encodeURIComponent(pageId)}/subscribed_apps`, pageToken, {
    method: "POST",
    params: { subscribed_fields: "leadgen" },
  });
  const list = await graphRequest(`${encodeURIComponent(pageId)}/subscribed_apps`, pageToken);
  const data = Array.isArray(list.data) ? (list.data as Array<Record<string, unknown>>) : [];
  return data.map((a) => String(a.name ?? a.id ?? ""));
}

/** Pide el lead; si el token guardado no sirve directo, reintenta con el token de la pagina. */
export async function fetchGraphLeadForPage(leadgenId: string, pageId: string | null, token: string): Promise<GraphLead> {
  try {
    return await fetchGraphLead(leadgenId, token);
  } catch (err) {
    if (!pageId) throw err;
    const pageToken = await resolvePageAccessToken(pageId, token);
    if (pageToken === token) throw err;
    return fetchGraphLead(leadgenId, pageToken);
  }
}

/** Pide el lead a la Graph API. Lanza con el mensaje de Meta si falla (sin el token). */
export async function fetchGraphLead(leadgenId: string, pageAccessToken: string): Promise<GraphLead> {
  const fields = "created_time,field_data,ad_id,ad_name,adset_name,campaign_name,form_id,platform,is_organic";
  const url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(leadgenId)}` +
    `?fields=${fields}&access_token=${encodeURIComponent(pageAccessToken)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    const body = (await res.json().catch(() => null)) as (GraphLead & { error?: { message?: string } }) | null;
    if (!res.ok || !body || body.error) {
      throw new Error(`Graph API ${res.status}: ${body?.error?.message ?? "respuesta invalida"}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Mapeo de field_data al formato de /api/leads/ingest (leadIngestSchema)
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
};

function isoDate(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Fecha de un formulario de Meta a AAAA-MM-DD (null si no se entiende). */
export function parseLeadDate(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); // 2026-12-05, 2026-12-05T00:00:00
  if (m) return isoDate(+m[1], +m[2], +m[3]);
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    // En Chile va dia/mes; solo si el segundo numero no puede ser mes se asume mes/dia.
    return b > 12 && a <= 12 ? isoDate(+m[3], a, b) : isoDate(+m[3], b, a);
  }
  m = v.match(/(\d{1,2})\s*(?:de\s+)?([a-záéíóú]+)\s*(?:de(?:l)?\s+)?(\d{4})/); // 5 de diciembre de 2026
  if (m && MONTHS[m[2]]) return isoDate(+m[3], MONTHS[m[2]], +m[1]);
  return null;
}

function normKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function prettyQuestion(name: string): string {
  return name.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Arma el objeto crudo que valida leadIngestSchema a partir del lead de Meta. */
export function mapGraphLeadToIngest(formKey: string, lead: GraphLead, change: LeadgenChange): Record<string, unknown> {
  let fullName: string | null = null;
  let firstName: string | null = null;
  let lastName: string | null = null;
  let phone: string | null = null;
  let email: string | null = null;
  let eventDate: string | null = null;
  let venue: string | null = null;
  let comuna: string | null = null;
  let guests: string | null = null;
  const extra: string[] = [];

  for (const field of lead.field_data ?? []) {
    const value = (field.values ?? []).map((x) => String(x).trim()).filter(Boolean).join(", ");
    if (!value) continue;
    const key = normKey(field.name);
    if (key === "full_name" || key === "nombre_completo" || key === "nombre") fullName ??= value;
    else if (key === "first_name") firstName ??= value;
    else if (key === "last_name") lastName ??= value;
    else if (key === "phone_number" || key === "phone" || key.includes("telefono") || key.includes("whatsapp")) phone ??= value;
    else if (key === "email" || key.includes("correo")) email ??= value;
    else if (!eventDate && /fecha|date|matrimonio|boda/.test(key) && parseLeadDate(value)) eventDate = parseLeadDate(value);
    else if (!venue && /lugar|donde|venue|centro_de_evento|recinto/.test(key)) venue = value;
    else if (!comuna && /comuna|ciudad|city/.test(key)) comuna = value;
    else if (!guests && /invitad|guest|personas/.test(key)) guests = value;
    else extra.push(`${prettyQuestion(field.name)}: ${value}`);
  }

  // Leads de la herramienta de pruebas de Meta: traen textos como
  // "<test lead: dummy data for phone_number>". Se reemplazan por datos de
  // prueba validos para poder verificar el flujo completo (trato + avisos).
  const isDummy = (v: string | null) => Boolean(v && /^<test lead/i.test(v));
  if ([fullName, firstName, lastName, phone, email].some(isDummy)) {
    fullName = "Prueba Meta Lead Ads";
    firstName = lastName = null;
    phone = "+56 9 0000 0000";
    email = null;
    extra.unshift("Lead de prueba enviado desde la herramienta de pruebas de Meta.");
  }

  const name = fullName ?? ([firstName, lastName].filter(Boolean).join(" ") || email || phone || "Lead Meta");
  const platform = lead.platform?.toLowerCase() || null;

  return {
    form: formKey,
    name,
    phone,
    email,
    event_date: eventDate,
    venue,
    comuna,
    guests,
    message: extra.length ? extra.join("\n") : null,
    utm_source: META_LEAD_ADS_SOURCE,
    utm_medium: platform,
    utm_campaign: lead.campaign_name ?? null,
    utm_term: lead.adset_name ?? null,
    utm_content: lead.ad_name ?? null,
    event_id: leadgenEventId(change.leadgenId),
  };
}

/**
 * UUID estable derivado del leadgen_id: ingestLead ya deduplica por
 * lead_meta.event_id, asi un reintento del webhook no crea otro trato.
 */
export function leadgenEventId(leadgenId: string): string {
  const h = createHash("sha256").update(`meta-leadgen:${leadgenId}`).digest("hex");
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Datos de Meta que se guardan en deals.lead_meta.meta_lead_ads. */
export function metaLeadAdsMeta(lead: GraphLead, change: LeadgenChange): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    leadgen_id: change.leadgenId,
    page_id: change.pageId,
    form_id: lead.form_id ?? change.formId,
    ad_id: lead.ad_id ?? change.adId,
    adgroup_id: change.adgroupId,
    ad_name: lead.ad_name,
    adset_name: lead.adset_name,
    campaign_name: lead.campaign_name,
    platform: lead.platform,
    is_organic: lead.is_organic,
    created_time: lead.created_time ?? (change.createdTime ? new Date(change.createdTime * 1000).toISOString() : null),
  };
  return Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== null && v !== undefined && v !== ""));
}

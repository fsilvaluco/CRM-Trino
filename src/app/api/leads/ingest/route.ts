import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getClientIp } from "@/lib/client-ip";
import { buildFbc, resolveMetaCapiConfig, sendMetaCapiEvent } from "@/lib/meta-capi";
import { LEAD_FORMS, formForOrigin, isAllowedOrigin, type LeadFormConfig } from "@/lib/leads/forms";
import { leadIngestSchema, normalizeIncomingKeys, type LeadIngestInput } from "@/lib/leads/schema";
import { ingestLead, type IngestResult } from "@/lib/leads/ingest";
import { sha256 } from "@/lib/leads/normalize";

// POST /api/leads/ingest -- recibe leads de formularios publicos (landing
// sisoy.pro/podcast) y los deja como contacto + trato en la primera etapa
// del Kanban del proyecto. Publico por diseño (el formulario corre en el
// navegador, un secret ahi no seria secreto): lo protegen el Origin
// permitido por formulario, el rate limit estricto de middleware.ts, un
// honeypot y el project_id fijo del lado del servidor (src/lib/leads/forms.ts).

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return NextResponse.json(body, { status, headers: corsHeaders(origin) });
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!formForOrigin(origin)) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  let raw: Record<string, unknown>;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: "JSON invalido" }, 400, formForOrigin(origin) ? origin : null);
  }

  const formKey = typeof raw.form === "string" ? raw.form : "";
  const form = LEAD_FORMS[formKey];
  if (!form) return json({ ok: false, error: "Formulario desconocido" }, 404, null);
  if (!isAllowedOrigin(form, origin)) return json({ ok: false, error: "Origen no permitido" }, 403, null);

  const parsed = leadIngestSchema.safeParse(normalizeIncomingKeys(raw));
  if (!parsed.success) {
    return json({ ok: false, error: "Datos invalidos", details: parsed.error.flatten().fieldErrors }, 400, origin);
  }
  const input = parsed.data;

  // Honeypot: se responde OK para no darle pistas al bot, pero no se guarda nada.
  if (input.website) return json({ ok: true }, 200, origin);

  const db = createAdminClient();
  let result: IngestResult;
  try {
    result = await ingestLead(db, formKey, form, input);
  } catch (err) {
    console.error("[leads/ingest]", err instanceof Error ? err.message : err);
    return json({ ok: false, error: "No pudimos registrar tu solicitud. Escribenos por WhatsApp." }, 500, origin);
  }

  // Evento Lead a la Conversions API despues de responder (nunca retrasa ni
  // rompe el formulario). Mismo event_id que el Pixel del navegador para que
  // Meta lo deduplique. Un reintento del mismo envio no se vuelve a mandar.
  if (result.status !== "duplicate_event") {
    const ip = getClientIp(request);
    const userAgent = request.headers.get("user-agent");
    after(() => sendLeadToMeta({ db, form, input, result, ip, userAgent, origin }));
  }

  return json({ ok: true, status: result.status }, result.status === "created" ? 201 : 200, origin);
}

async function sendLeadToMeta(params: {
  db: ReturnType<typeof createAdminClient>;
  form: LeadFormConfig;
  input: LeadIngestInput;
  result: IngestResult;
  ip: string;
  userAgent: string | null;
  origin: string | null;
}) {
  const { db, form, input, result, ip, userAgent, origin } = params;
  const config = await resolveMetaCapiConfig(db, result.organizationId, form.projectId, { allowEnvFallback: false });
  if (!config) return; // El proyecto aun no tiene pixel propio configurado.

  const hashed: Record<string, string> = { external_id: sha256(result.contactId) };
  if (result.email) hashed.em = sha256(result.email);
  if (result.phone) hashed.ph = sha256(result.phone.replace(/\D/g, ""));

  const capi = await sendMetaCapiEvent({
    config,
    eventName: "Lead",
    eventId: input.event_id ?? crypto.randomUUID(),
    eventSourceUrl: input.page_url ?? `${origin ?? ""}/`,
    clientIpAddress: ip === "unknown" ? null : ip,
    clientUserAgent: userAgent,
    fbc: buildFbc(input.fbclid, input.fbc),
    fbp: input.fbp,
    hashedUserData: hashed,
    customData: { value: form.metaValue, currency: "CLP", content_name: form.productName },
    testEventCode: process.env.META_TEST_EVENT_CODE || undefined,
  });

  // Se guarda el resultado en el trato para poder auditar la deduplicacion.
  const { data: deal } = await db.from("deals").select("lead_meta").eq("id", result.dealId).single();
  const meta = (deal?.lead_meta ?? {}) as Record<string, unknown>;
  await db
    .from("deals")
    .update({ lead_meta: { ...meta, capi: { ok: capi.ok, status: capi.status ?? null, at: new Date().toISOString() } } })
    .eq("id", result.dealId);
}

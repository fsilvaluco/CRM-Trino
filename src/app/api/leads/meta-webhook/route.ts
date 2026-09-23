import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { metaLeadAdsFormForProject } from "@/lib/leads/forms";
import { leadIngestSchema } from "@/lib/leads/schema";
import { ingestLead } from "@/lib/leads/ingest";
import { notifyNewLead } from "@/lib/leads/notify";
import {
  extractLeadgenChanges,
  fetchGraphLead,
  isValidMetaSignature,
  listMetaLeadgenIntegrations,
  mapGraphLeadToIngest,
  metaLeadAdsMeta,
  verifyTokenMatches,
  type LeadgenChange,
  type MetaLeadgenIntegration,
} from "@/lib/leads/meta-leadgen";

// Webhook de Meta Lead Ads (objeto Page, campo leadgen). Cada lead de un
// formulario instantaneo de Facebook/Instagram entra al CRM por el mismo
// camino que los leads web de sisoy.pro/podcast (ingestLead + notifyNewLead),
// marcado con origen "Meta Lead Ads (formulario instantáneo)". No se manda
// evento Lead a la API de conversiones: Meta ya atribuye estos leads.
// Publico (lo llama Meta): lo protege la firma X-Hub-Signature-256 con el
// App Secret guardado en artist_integrations (platform='meta_leadgen').

const LOG = "[leads/meta-webhook]";

// GET: handshake de verificacion al suscribir el webhook en la app de Meta.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (mode !== "subscribe" || !token || !challenge) return new NextResponse("Forbidden", { status: 403 });

  try {
    const integrations = await listMetaLeadgenIntegrations(createAdminClient());
    if (integrations.some((i) => verifyTokenMatches(i.verifyToken, token))) {
      return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
  } catch (err) {
    console.error(LOG, "verificacion:", err instanceof Error ? err.message : err);
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// POST: aviso de lead nuevo. Se valida la firma, se responde 200 al tiro y el
// trabajo pesado (Graph API, trato, notas, avisos) corre en after().
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const db = createAdminClient();

  let integrations: MetaLeadgenIntegration[];
  try {
    integrations = await listMetaLeadgenIntegrations(db);
  } catch (err) {
    console.error(LOG, err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false }, { status: 500 }); // Meta reintenta
  }

  // La firma se valida contra cada App Secret configurado (normalmente uno).
  const signedBy = integrations.filter((i) => i.appSecret && isValidMetaSignature(rawBody, signature, i.appSecret));
  if (!signedBy.length) {
    console.error(LOG, "firma X-Hub-Signature-256 invalida o sin App Secret configurado");
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error(LOG, "JSON invalido");
    return NextResponse.json({ ok: true });
  }

  const changes = extractLeadgenChanges(payload);
  for (const change of changes) {
    // La pagina del lead tiene que ser una de las configuradas con ese mismo App Secret.
    const integration = signedBy.find((i) => i.pageId && i.pageId === change.pageId);
    if (!integration) {
      console.error(LOG, `pagina ${change.pageId ?? "?"} sin integracion meta_leadgen (lead ${change.leadgenId})`);
      continue;
    }
    after(() =>
      processLeadgen(db, integration, change).catch((err) =>
        console.error(LOG, `lead ${change.leadgenId}:`, err instanceof Error ? err.message : err)
      )
    );
  }

  return NextResponse.json({ ok: true });
}

async function processLeadgen(
  db: ReturnType<typeof createAdminClient>,
  integration: MetaLeadgenIntegration,
  change: LeadgenChange
): Promise<void> {
  const target = metaLeadAdsFormForProject(integration.projectId);
  if (!target) {
    console.error(LOG, `el proyecto ${integration.projectId ?? "?"} no tiene formulario con metaLeadAds`);
    return;
  }
  const { key: formKey, form } = target;
  if (!integration.pageAccessToken) {
    console.error(LOG, `falta el token de la pagina ${integration.pageId} (lead ${change.leadgenId})`);
    return;
  }

  // Idempotencia: Meta reintenta el webhook; si el lead ya quedo en un trato, no se repite.
  const { data: seen } = await db
    .from("deals")
    .select("id")
    .eq("project_id", form.projectId)
    .contains("lead_meta", { leadgen_ids: [change.leadgenId] })
    .limit(1);
  if (seen?.[0]) return;

  const lead = await fetchGraphLead(change.leadgenId, integration.pageAccessToken);
  const parsed = leadIngestSchema.safeParse(mapGraphLeadToIngest(formKey, lead, change));
  if (!parsed.success) {
    const fields = Object.keys(parsed.error.flatten().fieldErrors).join(", ");
    console.error(LOG, `lead ${change.leadgenId} con datos invalidos (${fields}); revisa las preguntas del formulario`);
    return;
  }
  const input = parsed.data;
  const metaInfo = metaLeadAdsMeta(lead, change);

  const result = await ingestLead(db, formKey, form, input, {
    contactSource: "redes_sociales",
    extraLeadMeta: { leadgen_id: change.leadgenId, leadgen_ids: [change.leadgenId], meta_lead_ads: metaInfo },
  });

  // Si cayo sobre un trato abierto del mismo contacto, se deja el leadgen_id
  // registrado ahi (para la idempotencia) sin pisar su origen original.
  if (result.status === "existing_deal") {
    const { data: deal } = await db.from("deals").select("lead_meta").eq("id", result.dealId).single();
    const meta = (deal?.lead_meta ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(meta.leadgen_ids) ? (meta.leadgen_ids as unknown[]).map(String) : [];
    await db
      .from("deals")
      .update({ lead_meta: { ...meta, leadgen_ids: [...new Set([...ids, change.leadgenId])], meta_lead_ads: metaInfo } })
      .eq("id", result.dealId);
  }

  await db
    .from("artist_integrations")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("id", integration.id);

  if (form.notify && result.status !== "duplicate_event") {
    await notifyNewLead({ formKey, form, input, result }).catch((err) => console.error("[leads/notify]", err));
  }
}

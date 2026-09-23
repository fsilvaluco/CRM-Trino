import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadFormConfig } from "./forms";
import type { LeadIngestInput } from "./schema";
import { normalizeEmail, normalizePhone } from "./normalize";
import { appendNotes, formatLeadNotes, leadOrigin } from "./notes";

// Logica de base de datos del ingreso de leads (sin HTTP): busca o crea el
// contacto, evita tratos duplicados y deja una actividad en el historial.
// Usa el cliente admin: el formulario es anonimo, asi que no hay sesion
// para RLS -- el aislamiento lo garantiza el project_id fijo del formulario.

export interface IngestResult {
  status: "created" | "existing_deal" | "duplicate_event";
  dealId: string;
  contactId: string;
  organizationId: string;
  phone: string | null;
  email: string | null;
}

async function findContact(
  db: SupabaseClient,
  projectId: string,
  phone: string | null,
  email: string | null
): Promise<{ id: string; email: string | null; phone: string | null } | null> {
  if (phone) {
    // Los telefonos guardados a mano vienen en formatos distintos: se filtra
    // por los ultimos 8 digitos y se compara normalizado.
    const tail = phone.replace(/\D/g, "").slice(-8);
    const { data } = await db
      .from("contacts")
      .select("id, email, phone")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .ilike("phone", `%${tail.slice(0, 4)}%${tail.slice(4)}%`)
      .limit(10);
    const match = (data ?? []).find((c) => normalizePhone(c.phone) === phone);
    if (match) return match;
  }
  if (email) {
    const { data } = await db
      .from("contacts")
      .select("id, email, phone")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .ilike("email", email)
      .limit(1);
    if (data?.[0]) return data[0];
  }
  return null;
}

function buildLeadMeta(input: LeadIngestInput, form: LeadFormConfig, key: string) {
  const origin = leadOrigin(input, key);
  const meta: Record<string, unknown> = {
    form: key,
    product: form.productName,
    origin,
    event_date: input.event_date,
    venue: input.venue,
    guests: input.guests,
    comuna: input.comuna,
    heard_from: input.heard_from,
    contact_time: input.contact_time,
    promo_fundador: form.promoFundador ?? true,
    utm_source: input.utm_source,
    utm_medium: input.utm_medium,
    utm_campaign: input.utm_campaign,
    utm_content: input.utm_content,
    utm_term: input.utm_term,
    fbclid: input.fbclid,
    event_id: input.event_id,
    page_url: input.page_url,
  };
  // No guardar claves vacias: el jsonb queda legible en el CRM.
  return Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== null && v !== undefined && v !== ""));
}

export async function ingestLead(
  db: SupabaseClient,
  formKey: string,
  form: LeadFormConfig,
  input: LeadIngestInput,
  options: { createdBy?: string | null; contactSource?: string } = {}
): Promise<IngestResult> {
  const createdBy = options.createdBy ?? null;
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);

  const { data: project, error: projectErr } = await db
    .from("projects")
    .select("id, organization_id")
    .eq("id", form.projectId)
    .single();
  if (projectErr || !project) throw new Error(`Proyecto del formulario no encontrado: ${projectErr?.message ?? ""}`);
  const orgId: string = project.organization_id;

  // Reintento del mismo envio (doble clic, red lenta): idempotente por event_id.
  if (input.event_id) {
    const { data: dup } = await db
      .from("deals")
      .select("id, contact_id")
      .eq("project_id", form.projectId)
      .eq("lead_meta->>event_id", input.event_id)
      .limit(1);
    if (dup?.[0]) {
      return { status: "duplicate_event", dealId: dup[0].id, contactId: dup[0].contact_id, organizationId: orgId, phone, email };
    }
  }

  const { data: stages, error: stagesErr } = await db
    .from("pipeline_stages")
    .select("id, is_won, is_lost, order")
    .eq("organization_id", orgId)
    .order("order", { ascending: true });
  if (stagesErr || !stages?.length) throw new Error("La organizacion no tiene etapas de pipeline");
  const firstStage = stages.find((s) => !s.is_won && !s.is_lost) ?? stages[0];
  const closedStageIds = stages.filter((s) => s.is_won || s.is_lost).map((s) => s.id);

  // Contacto: reutilizar si ya existe (por telefono o email) y completar el email si faltaba.
  let contact = await findContact(db, form.projectId, phone, email);
  if (contact) {
    if (email && !contact.email) await db.from("contacts").update({ email }).eq("id", contact.id);
  } else {
    const { data: created, error } = await db
      .from("contacts")
      .insert({
        name: input.name,
        phone,
        email,
        source: options.contactSource ?? "website",
        created_by: createdBy,
        temperature: "warm",
        score: 0,
        notes: input.message,
        organization_id: orgId,
        project_id: form.projectId,
      })
      .select("id, email, phone")
      .single();
    if (error || !created) throw new Error(`No se pudo crear el contacto: ${error?.message ?? ""}`);
    contact = created;
  }

  const leadMeta = buildLeadMeta(input, form, formKey);
  const summary = [
    input.event_date && `fecha ${input.event_date}`,
    input.venue,
    input.comuna,
    input.guests && `${input.guests} invitados`,
    input.contact_time && `contactar en la ${input.contact_time}`,
  ]
    .filter(Boolean)
    .join(" · ");

  // Si la pareja ya tiene un trato abierto, no se duplica: se deja constancia del nuevo envio.
  let openQuery = db
    .from("deals")
    .select("id, notes")
    .eq("project_id", form.projectId)
    .eq("contact_id", contact.id)
    .is("deleted_at", null)
    .limit(1);
  if (closedStageIds.length) openQuery = openQuery.not("stage_id", "in", `(${closedStageIds.join(",")})`);
  const { data: open } = await openQuery;

  const notesParams = { formKey, form, input, phone, email, receivedAt: new Date() };

  if (open?.[0]) {
    const block = formatLeadNotes({ ...notesParams, kind: "resubmit" });
    await db
      .from("deals")
      .update({ notes: appendNotes(open[0].notes as string | null, block) })
      .eq("id", open[0].id);
    await db.from("activities").insert({
      type: "note",
      description: `Volvio a enviar el formulario ${form.productName}${summary ? ` (${summary})` : ""}`,
      contact_id: contact.id,
      deal_id: open[0].id,
      organization_id: orgId,
      project_id: form.projectId,
      created_by: createdBy,
    });
    return { status: "existing_deal", dealId: open[0].id, contactId: contact.id, organizationId: orgId, phone, email };
  }

  const { data: deal, error: dealErr } = await db
    .from("deals")
    .insert({
      title: `${form.productName} · ${input.name}`,
      value: form.dealValueCents,
      stage_id: firstStage.id,
      contact_id: contact.id,
      probability: 10,
      notes: formatLeadNotes({ ...notesParams, kind: "new" }),
      lead_meta: leadMeta,
      organization_id: orgId,
      project_id: form.projectId,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (dealErr || !deal) throw new Error(`No se pudo crear el trato: ${dealErr?.message ?? ""}`);

  await db.from("activities").insert({
    type: "note",
    description: `${formKey === "quick" ? "Lead cargado a mano" : "Lead desde el formulario"} ${form.productName}${summary ? ` (${summary})` : ""}`,
    contact_id: contact.id,
    deal_id: deal.id,
    organization_id: orgId,
    project_id: form.projectId,
    created_by: createdBy,
  });

  return { status: "created", dealId: deal.id, contactId: contact.id, organizationId: orgId, phone, email };
}

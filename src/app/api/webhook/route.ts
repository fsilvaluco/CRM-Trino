import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { z } from "zod";

// Field name mapping: common variations → standard field
const FIELD_MAP: Record<string, string> = {
  // Name
  name: "name",
  nombre: "name",
  full_name: "name",
  fullname: "name",
  first_name: "name",
  nombre_completo: "name",
  // Email
  email: "email",
  correo: "email",
  email_address: "email",
  correo_electronico: "email",
  // Phone
  phone: "phone",
  telefono: "phone",
  phone_number: "phone",
  cel: "phone",
  celular: "phone",
  whatsapp: "phone",
  movil: "phone",
  // Company
  company: "company",
  empresa: "company",
  company_name: "company",
  negocio: "company",
  organizacion: "company",
  // Notes
  notes: "notes",
  notas: "notes",
  message: "notes",
  mensaje: "notes",
  comments: "notes",
  comentarios: "notes",
  descripcion: "notes",
};

function extractFields(
  payload: Record<string, unknown>
): Record<string, string> {
  // Handle Typeform-style nested data
  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : payload;

  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    const normalizedKey = key.toLowerCase().trim().replace(/\s+/g, "_");
    const mappedField = FIELD_MAP[normalizedKey];
    if (mappedField && !result[mappedField]) {
      result[mappedField] = String(value).trim();
    }
  }

  // Handle "first_name + last_name" pattern
  if (!result.name) {
    const firstName =
      data.first_name || data.nombre || data.firstName || data.primer_nombre;
    const lastName =
      data.last_name || data.apellido || data.lastName || data.apellidos;
    if (firstName) {
      result.name = [firstName, lastName].filter(Boolean).join(" ").trim();
    }
  }

  return result;
}

const webhookContactSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido"),
  email: z
    .union([z.string().trim().email(), z.literal(""), z.null(), z.undefined()])
    .transform((value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null)),
  phone: z
    .union([z.string().trim(), z.null(), z.undefined()])
    .transform((value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null)),
  company: z
    .union([z.string().trim(), z.null(), z.undefined()])
    .transform((value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null)),
  notes: z
    .union([z.string().trim(), z.null(), z.undefined()])
    .transform((value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null)),
});

const uuidSchema = z.string().uuid();
type SupabaseServerClient = Awaited<ReturnType<typeof requireAuth>>["supabase"];

function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function getOrCreateCompanyId(params: {
  supabase: SupabaseServerClient;
  organizationId: string;
  createdBy: string;
  projectId: string;
  companyName: string | null;
}): Promise<string | null> {
  if (!params.companyName) {
    return null;
  }

  const normalizedCompanyName = params.companyName.trim();
  if (!normalizedCompanyName) {
    return null;
  }

  const escapedCompanyName = escapeIlikePattern(normalizedCompanyName);

  const { data: existingCompanies, error: findError } = await params.supabase
    .from("companies")
    .select("id")
    .eq("organization_id", params.organizationId)
    .ilike("name", escapedCompanyName)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1);

  if (findError) {
    throw new Error(`Error buscando empresa '${normalizedCompanyName}': ${findError.message}`);
  }

  const existingId = existingCompanies?.[0]?.id;
  if (typeof existingId === "string" && uuidSchema.safeParse(existingId).success) {
    return existingId;
  }

  const { data: insertedCompany, error: insertError } = await params.supabase
    .from("companies")
    .insert({
      name: normalizedCompanyName,
      organization_id: params.organizationId,
      created_by: params.createdBy,
      project_id: params.projectId,
    })
    .select("id")
    .single();

  if (!insertError && insertedCompany?.id && uuidSchema.safeParse(insertedCompany.id).success) {
    return insertedCompany.id;
  }

  const { data: retriedCompanies, error: retryError } = await params.supabase
    .from("companies")
    .select("id")
    .eq("organization_id", params.organizationId)
    .ilike("name", escapedCompanyName)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1);

  const retriedId = retriedCompanies?.[0]?.id;
  if (!retryError && typeof retriedId === "string" && uuidSchema.safeParse(retriedId).success) {
    return retriedId;
  }

  throw new Error(
    `No se pudo resolver company_id para '${normalizedCompanyName}': ${insertError?.message ?? retryError?.message ?? "desconocido"}`
  );
}

export async function POST(request: NextRequest) {
  const { supabase, user, orgId, isAdmin, allowedProjectIds, error: authError } = await requireAuth();
  if (authError) return authError;

  // Auth check: if a webhook secret is stored, require it in the header
  const { data: stored } = await supabase
    .from("crm_settings").select("value").eq("key", "webhook_secret").single();

  if (stored) {
    const secretHeader = request.headers.get("x-webhook-secret");
    if (!secretHeader || secretHeader !== stored.value) {
      return NextResponse.json({ error: "Secret invalido o faltante" }, { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  // Resolve project_id: prefer payload > crm_settings fallback
  let resolvedProjectId: string | null = null;

  const payloadProjectId =
    typeof payload.project_id === "string" && uuidSchema.safeParse(payload.project_id).success
      ? payload.project_id
      : null;
  if (payloadProjectId) {
    // Validate that it belongs to the org before accepting
    const { data: proj } = await supabase
      .from("projects")
      .select("id")
      .eq("id", payloadProjectId)
      .eq("organization_id", orgId)
      .single();
    if (proj) resolvedProjectId = proj.id;
  }

  if (!resolvedProjectId) {
    // Fall back to the stored webhook default project
    const { data: settingRow } = await supabase
      .from("crm_settings")
      .select("value")
      .eq("key", "webhook_default_project_id")
      .single();
    if (settingRow?.value && uuidSchema.safeParse(settingRow.value).success) {
      resolvedProjectId = settingRow.value;
    }
  }

  if (!resolvedProjectId) {
    return NextResponse.json(
      {
        error: "No se pudo determinar el proyecto para este webhook.",
        hint: "Configura 'webhook_default_project_id' en crm_settings o incluye 'project_id' en el payload del webhook.",
      },
      { status: 422 }
    );
  }

  // Members can only write into projects they explicitly belong to
  if (!isAdmin && !allowedProjectIds?.includes(resolvedProjectId)) {
    return NextResponse.json(
      { error: "Sin acceso al proyecto especificado para este webhook" },
      { status: 403 }
    );
  }

  const fields = extractFields(payload);
  const parsedFields = webhookContactSchema.safeParse(fields);

  if (!parsedFields.success) {
    return NextResponse.json(
      {
        error: "Payload de contacto invalido",
        details: parsedFields.error.flatten(),
        received: Object.keys(payload),
        hint: "Campos soportados: name, nombre, full_name, email, correo, phone, telefono, company, empresa, notes, notas, message",
      },
      { status: 400 }
    );
  }

  const fieldsData = parsedFields.data;

  let companyId: string | null = null;
  try {
    companyId = await getOrCreateCompanyId({
      supabase,
      organizationId: orgId,
      createdBy: user!.id,
      projectId: resolvedProjectId,
      companyName: fieldsData.company,
    });
  } catch (companyError) {
    return NextResponse.json(
      {
        error: `Error resolviendo empresa: ${companyError instanceof Error ? companyError.message : "Unknown"}`,
      },
      { status: 500 }
    );
  }

  try {
    const { data: contact, error: contactErr } = await supabase
      .from("contacts")
      .insert({
        name: fieldsData.name,
        email: fieldsData.email,
        phone: fieldsData.phone,
        company_id: companyId,
        source: "webhook",
        temperature: "cold",
        score: 0,
        notes: fieldsData.notes,
        organization_id: orgId,
        project_id: resolvedProjectId,
        created_by: user!.id,
      })
      .select().single();

    if (contactErr || !contact) {
      throw new Error(contactErr?.message ?? "Error al insertar contacto");
    }

    await supabase.from("activities").insert({
      type: "note",
      description: `Lead recibido via webhook${fieldsData.company ? ` (${fieldsData.company})` : ""}`,
      contact_id: contact.id,
      organization_id: orgId,
      project_id: resolvedProjectId,
      created_by: user!.id,
    });

    return NextResponse.json(
      { success: true, contact: { id: contact.id, name: contact.name, email: contact.email, source: contact.source } },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: `Error al crear contacto: ${error instanceof Error ? error.message : "Unknown"}` },
      { status: 500 }
    );
  }
}

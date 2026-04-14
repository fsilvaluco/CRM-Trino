import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

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

  const payloadProjectId = typeof payload.project_id === "string" ? payload.project_id : null;
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
    if (settingRow?.value) resolvedProjectId = settingRow.value;
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

  if (!fields.name) {
    return NextResponse.json(
      {
        error: "Campo 'name' o 'nombre' es requerido",
        received: Object.keys(payload),
        hint: "Campos soportados: name, nombre, full_name, email, correo, phone, telefono, company, empresa, notes, notas, message",
      },
      { status: 400 }
    );
  }

  try {
    const { data: contact, error: contactErr } = await supabase
      .from("contacts")
      .insert({
        name: fields.name,
        email: fields.email || null,
        phone: fields.phone || null,
        company: fields.company || null,
        source: "webhook",
        temperature: "cold",
        score: 0,
        notes: fields.notes || null,
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
      description: `Lead recibido via webhook${fields.company ? ` (${fields.company})` : ""}`,
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

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { z } from "zod";

const patchLeadCandidateSchema = z.object({
  action: z.enum(["approve", "reject"]),
  // Permite corregir datos detectados antes de aprobar (ej: el nombre vino mal parseado)
  overrides: z
    .object({
      name: z.string().trim().min(1).optional(),
      email: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
      phone: z.union([z.string(), z.null()]).optional(),
      companyName: z.union([z.string(), z.null()]).optional(),
      projectId: z.union([z.string().uuid(), z.null()]).optional(),
    })
    .optional(),
});

function errorResponse(message: string, status: number, details?: unknown) {
  return NextResponse.json(
    { error: { message, details: details ?? null } },
    { status }
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, orgId, error } = await requireAuth();
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsedBody = patchLeadCandidateSchema.safeParse(body);
  if (!parsedBody.success) {
    return errorResponse("Payload invalido", 400, parsedBody.error.flatten());
  }

  const { data: lead, error: leadErr } = await supabase
    .from("lead_candidates")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId!)
    .single();

  if (leadErr || !lead) {
    return errorResponse("Lead candidato no encontrado", 404);
  }

  if (lead.status !== "pending_review") {
    return errorResponse("Este lead ya fue revisado", 409);
  }

  const { action, overrides } = parsedBody.data;

  // --- Rechazo: solo se marca, no se crea nada ---
  if (action === "reject") {
    const { data, error: updateErr } = await supabase
      .from("lead_candidates")
      .update({
        status: "rejected",
        reviewed_by: user!.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateErr) {
      return errorResponse("No se pudo rechazar el lead", 500, updateErr.message);
    }

    return NextResponse.json({ id: data.id, status: data.status });
  }

  // --- Aprobacion: crea company (si falta) + contact + task ---
  const name = overrides?.name ?? lead.detected_name;
  if (!name) {
    return errorResponse(
      "Falta el nombre del contacto -- corrigelo antes de aprobar",
      400
    );
  }

  const projectId = overrides?.projectId ?? lead.project_id;
  if (!projectId) {
    return errorResponse(
      "Falta asignar un proyecto antes de aprobar",
      400
    );
  }

  let companyId: string | null = null;
  const companyName = overrides?.companyName ?? lead.detected_company;

  if (companyName) {
    // Busca empresa existente por nombre dentro del proyecto antes de crear una nueva
    const { data: existingCompany } = await supabase
      .from("companies")
      .select("id")
      .eq("organization_id", orgId!)
      .ilike("name", companyName)
      .maybeSingle();

    if (existingCompany) {
      companyId = existingCompany.id;
    } else {
      const { data: newCompany, error: companyErr } = await supabase
        .from("companies")
        .insert({
          name: companyName,
          organization_id: orgId,
          project_id: projectId,
          created_by: user!.id,
        })
        .select("id")
        .single();

      if (companyErr) {
        return errorResponse("No se pudo crear la empresa", 500, companyErr.message);
      }
      companyId = newCompany.id;
    }
  }

  const { data: newContact, error: contactErr } = await supabase
    .from("contacts")
    .insert({
      name,
      email: overrides?.email ?? lead.detected_email ?? null,
      phone: overrides?.phone ?? lead.detected_phone ?? null,
      company_id: companyId,
      source: lead.source === "whatsapp" ? "whatsapp" : "email",
      temperature: "warm",
      notes: lead.signal_reason
        ? `Detectado automaticamente: ${lead.signal_reason}`
        : "Detectado automaticamente",
      organization_id: orgId,
      created_by: user!.id,
      project_id: projectId,
    })
    .select("id")
    .single();

  if (contactErr) {
    return errorResponse("No se pudo crear el contacto", 500, contactErr.message);
  }

  const { data: newTask, error: taskErr } = await supabase
    .from("tasks")
    .insert({
      title: `Dar seguimiento a ${name}`,
      description: lead.signal_reason ?? "Nuevo lead detectado, requiere seguimiento.",
      status: "pending",
      priority: "medium",
      contact_id: newContact.id,
      company_id: companyId,
      project_id: projectId,
    })
    .select("id")
    .single();

  if (taskErr) {
    return errorResponse("Contacto creado, pero no se pudo crear la tarea", 500, taskErr.message);
  }

  const { data: updatedLead, error: updateErr } = await supabase
    .from("lead_candidates")
    .update({
      status: "approved",
      reviewed_by: user!.id,
      reviewed_at: new Date().toISOString(),
      resulting_contact_id: newContact.id,
      resulting_company_id: companyId,
      resulting_task_id: newTask.id,
    })
    .eq("id", id)
    .select()
    .single();

  if (updateErr) {
    return errorResponse("Se creo el contacto/tarea pero no se pudo actualizar el lead", 500, updateErr.message);
  }

  return NextResponse.json({
    id: updatedLead.id,
    status: updatedLead.status,
    resultingContactId: newContact.id,
    resultingCompanyId: companyId,
    resultingTaskId: newTask.id,
  });
}

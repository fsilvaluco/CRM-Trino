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
  // Como resolver si se encuentra un contacto existente con el mismo
  // email/telefono. Si no se manda y hay match, el endpoint responde 409
  // pidiendo que el usuario decida.
  duplicateAction: z.enum(["update_existing", "create_new"]).optional(),
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

  const { action, overrides, duplicateAction } = parsedBody.data;

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

  // --- Aprobacion: crea/reutiliza company + contact, y deja todo listo
  //     para que el frontend abra el formulario de Deal pre-cargado.
  const name = overrides?.name ?? lead.detected_name;
  if (!name) {
    return errorResponse(
      "Falta el nombre del contacto -- corrigelo antes de aprobar",
      400
    );
  }

  // El contacto se ancla al artista (ej. Gamuza) cuando el lead esta ligado
  // a uno; si es un trato general del sello (ej. servicio de podcast sin
  // artista especifico), se ancla directo al sello (ej. SiSoy).
  const projectId = overrides?.projectId ?? lead.artist_project_id ?? lead.project_id;
  if (!projectId) {
    return errorResponse(
      "Falta asignar un proyecto antes de aprobar",
      400
    );
  }

  const email = overrides?.email ?? lead.detected_email ?? null;
  const phone = overrides?.phone ?? lead.detected_phone ?? null;

  // --- Deteccion de duplicados por email o telefono (dentro de la org) ---
  // Si el frontend todavia no dijo como resolverlo, se pregunta antes de
  // crear nada.
  if (!duplicateAction && (email || phone)) {
    const orFilters = [
      email ? `email.ilike.${email}` : null,
      phone ? `phone.eq.${phone}` : null,
    ]
      .filter(Boolean)
      .join(",");

    const { data: existingMatch } = await supabase
      .from("contacts")
      .select("id, name, email, phone, company_id")
      .eq("organization_id", orgId!)
      .is("deleted_at", null)
      .or(orFilters)
      .limit(1)
      .maybeSingle();

    if (existingMatch) {
      return NextResponse.json(
        {
          requiresDuplicateResolution: true,
          existingContact: existingMatch,
        },
        { status: 409 }
      );
    }
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

  let contactId: string;

  if (duplicateAction === "update_existing") {
    // Actualiza el contacto existente (busca de nuevo para tener su id real)
    const orFilters = [
      email ? `email.ilike.${email}` : null,
      phone ? `phone.eq.${phone}` : null,
    ]
      .filter(Boolean)
      .join(",");

    const { data: existingMatch, error: findErr } = await supabase
      .from("contacts")
      .select("id, notes")
      .eq("organization_id", orgId!)
      .is("deleted_at", null)
      .or(orFilters)
      .limit(1)
      .single();

    if (findErr || !existingMatch) {
      return errorResponse("No se encontro el contacto existente a actualizar", 404);
    }

    const appendedNote = lead.signal_reason
      ? `Nuevo lead detectado: ${lead.signal_reason}`
      : "Nuevo lead detectado automaticamente";
    const mergedNotes = existingMatch.notes ? `${existingMatch.notes}\n${appendedNote}` : appendedNote;

    const { error: updateContactErr } = await supabase
      .from("contacts")
      .update({
        name,
        email: email || undefined,
        phone: phone || undefined,
        company_id: companyId ?? undefined,
        notes: mergedNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingMatch.id);

    if (updateContactErr) {
      return errorResponse("No se pudo actualizar el contacto existente", 500, updateContactErr.message);
    }

    contactId = existingMatch.id;
  } else {
    const { data: newContact, error: contactErr } = await supabase
      .from("contacts")
      .insert({
        name,
        email: email || null,
        phone: phone || null,
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

    contactId = newContact.id;
  }

  const { data: updatedLead, error: updateErr } = await supabase
    .from("lead_candidates")
    .update({
      status: "approved",
      reviewed_by: user!.id,
      reviewed_at: new Date().toISOString(),
      resulting_contact_id: contactId,
      resulting_company_id: companyId,
    })
    .eq("id", id)
    .select()
    .single();

  if (updateErr) {
    return errorResponse("Se creo/actualizo el contacto pero no se pudo actualizar el lead", 500, updateErr.message);
  }

  // Si el lead sugiere una tarea, buscar tareas ABIERTAS ya existentes para
  // este mismo contacto -- si el correo es en realidad el avance de algo
  // que ya se estaba siguiendo, conviene comentar la tarea existente en vez
  // de crear una duplicada.
  let existingOpenTasks: Array<{ id: string; title: string }> = [];
  if (lead.item_type === "task" || lead.item_type === "both") {
    const { data: openTasks } = await supabase
      .from("tasks")
      .select("id, title")
      .eq("contact_id", contactId)
      .not("status", "in", "(listo,descartado)")
      .order("created_at", { ascending: false })
      .limit(5);

    existingOpenTasks = openTasks ?? [];
  }

  // No se crea ninguna tarea/deal automatica -- el frontend usa esto para
  // abrir el formulario correspondiente (Deal, Tarea, o elegir entre
  // ambos), pre-cargado, que el usuario revisa antes de guardar.
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 3);

  return NextResponse.json({
    id: updatedLead.id,
    status: updatedLead.status,
    resultingContactId: contactId,
    resultingCompanyId: companyId,
    itemType: lead.item_type,
    suggestedDeal: {
      contactId,
      companyId,
      projectId: lead.project_id,
      artistProjectId: lead.artist_project_id,
      title: lead.suggested_deal_title || lead.signal_reason || `Oportunidad con ${name}`,
      notes: lead.summary || lead.raw_excerpt,
    },
    suggestedTask: {
      contactId,
      companyId,
      projectId: lead.artist_project_id || lead.project_id,
      title: lead.suggested_task_title || lead.signal_reason || `Seguimiento a ${name}`,
      description: lead.summary || lead.raw_excerpt,
      dueDate: dueDate.toISOString().slice(0, 10),
    },
    existingOpenTasks,
    taskUpdate: {
      summary: lead.summary || lead.raw_excerpt,
      authorName: lead.detected_name || "Email entrante",
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { markEntityViewed } from "@/lib/entity-views";
import { logActivity } from "@/lib/activity-logs";
import { getProjectRole, canEditDeals } from "@/lib/project-roles";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDeal(row: any) {
  return {
    id: row.id,
    title: row.title,
    value: row.value,
    valueType: row.value_type ?? "fixed",
    percentageValue: row.percentage_value ?? null,
    taxType: row.tax_type ?? "afecto",
    stageId: row.stage_id,
    contactId: row.contact_id,
    companyId: row.company_id ?? null,
    projectId: row.project_id ?? null,
    artistProjectId: row.artist_project_id ?? null,
    expectedClose: row.expected_close ?? null,
    probability: row.probability,
    notes: row.notes ?? null,
    referenceUrl: row.reference_url ?? null,
    isShow: row.is_show ?? false,
    source: row.source ?? null,
    commissionRate: row.commission_rate ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assignees: row.deal_assignees?.map((da: any) => ({
      userId: da.user_id,
      assignedAt: da.assigned_at,
      profile: da.profiles ? {
        fullName: da.profiles.full_name,
        avatarUrl: da.profiles.avatar_url,
        email: da.profiles.email,
      } : null,
    })) ?? [],
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, error } = await requireAuth();
  if (error) return error;

  const { data, error: dbError } = await supabase
    .from("deals")
    .select(`
      *,
      deal_assignees!deal_assignees_deal_id_fkey (
        user_id,
        assigned_at,
        profiles!deal_assignees_user_id_fkey ( full_name, avatar_url, email )
      )
    `)
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (dbError || !data) {
    return NextResponse.json({ error: "Deal no encontrado" }, { status: 404 });
  }

  if (user) void markEntityViewed(supabase, user.id, "deal", id);

  const [{ data: project }, { data: linkedShow }] = await Promise.all([
    data.project_id
      ? supabase.from("projects").select("default_commission_rate").eq("id", data.project_id).single()
      : Promise.resolve({ data: null }),
    supabase.from("shows").select("id, fee, ticket_income, expenses").eq("deal_id", id).limit(1).maybeSingle(),
  ]);

  return NextResponse.json({
    ...mapDeal(data),
    projectDefaultCommissionRate: project?.default_commission_rate ?? 30,
    linkedEventId: linkedShow?.id ?? null,
    linkedEventUtilidad: linkedShow
      ? (linkedShow.fee ?? 0) + (linkedShow.ticket_income ?? 0) - (linkedShow.expenses ?? 0)
      : null,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, error } = await requireAuth();
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { data: existing, error: findErr } = await supabase
    .from("deals")
    .select("id, contact_id, company_id, project_id, artist_project_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Deal no encontrado" }, { status: 404 });
  }

  const dealRole = await getProjectRole(supabase, user!.id, existing.artist_project_id || existing.project_id || null);
  if (!canEditDeals(dealRole)) {
    return NextResponse.json({ error: "Tu rol no puede editar este deal" }, { status: 403 });
  }

  const normalizedValueType = body.valueType === "percentage" ? "percentage" : "fixed";
  const normalizedTaxType = body.taxType === "exento" ? "exento" : "afecto";
  const normalizedPercentageValue = body.percentageValue == null || body.percentageValue === ""
    ? null
    : Number(body.percentageValue);
  const finalContactId = body.contactId !== undefined ? (body.contactId || null) : existing.contact_id;
  const finalCompanyId = body.companyId !== undefined ? (body.companyId || null) : existing.company_id;

  if (!finalContactId && !finalCompanyId) {
    return NextResponse.json(
      { error: "El deal debe tener al menos un contacto o empresa" },
      { status: 400 }
    );
  }

  if (
    body.valueType !== undefined &&
    normalizedValueType === "percentage" &&
    (
      normalizedPercentageValue == null ||
      Number.isNaN(normalizedPercentageValue) ||
      normalizedPercentageValue <= 0 ||
      normalizedPercentageValue > 100
    )
  ) {
    return NextResponse.json(
      { error: "El porcentaje debe ser mayor a 0 y menor o igual a 100" },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.value !== undefined) updates.value = body.value;
  if (body.valueType !== undefined) updates.value_type = normalizedValueType;
  if (body.percentageValue !== undefined) updates.percentage_value = normalizedPercentageValue;
  if (body.taxType !== undefined) updates.tax_type = normalizedTaxType;
  if (body.stageId !== undefined) updates.stage_id = body.stageId;
  if (body.contactId !== undefined) updates.contact_id = body.contactId || null;
  if (body.companyId !== undefined) updates.company_id = body.companyId || null;
  if (body.projectId !== undefined) updates.project_id = body.projectId || null;
  if (body.artistProjectId !== undefined) updates.artist_project_id = body.artistProjectId || null;
  if (body.expectedClose !== undefined) {
    updates.expected_close = body.expectedClose
      ? new Date(body.expectedClose).toISOString()
      : null;
  }
  if (body.probability !== undefined) {
    updates.probability = Math.max(0, Math.min(100, Number(body.probability)));
  }
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.referenceUrl !== undefined) updates.reference_url = (body.referenceUrl as string)?.trim() || null;
  if (body.isShow !== undefined) updates.is_show = Boolean(body.isShow);
  if (body.source !== undefined) {
    const ALLOWED_SOURCES = new Set(["trino", "trino_nuevo", "artista_antiguo", "artista_nuevo"]);
    updates.source = ALLOWED_SOURCES.has(body.source) ? body.source : null;
  }
  if (body.commissionRate !== undefined) {
    updates.commission_rate =
      body.commissionRate == null || body.commissionRate === "" ? null : Number(body.commissionRate);
  }

  const assigneeIds = Array.isArray(body.assigneeIds)
    ? body.assigneeIds.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
    : null;

  if (assigneeIds) {
    if (!user) {
      return NextResponse.json({ error: "Usuario no autenticado" }, { status: 401 });
    }
    const uniqueAssigneeIds = [...new Set(assigneeIds)];
    const { error: deleteAssigneesError } = await supabase
      .from("deal_assignees")
      .delete()
      .eq("deal_id", id);

    if (deleteAssigneesError) {
      return NextResponse.json({ error: `Error al actualizar responsables: ${deleteAssigneesError.message}` }, { status: 500 });
    }

    if (uniqueAssigneeIds.length > 0) {
      const { error: insertAssigneesError } = await supabase
        .from("deal_assignees")
        .insert(
          uniqueAssigneeIds.map((assigneeId) => ({
            deal_id: id,
            user_id: assigneeId,
            assigned_by: user!.id,
          }))
        );

      if (insertAssigneesError) {
        return NextResponse.json({ error: `Error al actualizar responsables: ${insertAssigneesError.message}` }, { status: 500 });
      }
    }
  }

  const { data, error: dbError } = await supabase
    .from("deals")
    .update(updates)
    .eq("id", id)
    .select(`
      *,
      deal_assignees!deal_assignees_deal_id_fkey (
        user_id,
        assigned_at,
        profiles!deal_assignees_user_id_fkey ( full_name, avatar_url, email )
      )
    `)
    .single();

  if (dbError) {
    if (dbError.message.includes("contact_id") && dbError.message.includes("null value")) {
      return NextResponse.json(
        { error: "Tu base de datos aun exige contacto obligatorio en deals. Aplica la migracion para permitir deals solo con empresa (contact_id nullable)." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: `Error al actualizar deal: ${dbError.message}` },
      { status: 500 }
    );
  }

  if (user) void markEntityViewed(supabase, user.id, "deal", id);

  await logActivity({
    supabase,
    userId: user!.id,
    userEmail: user!.email,
    action: "update",
    entityType: "deal",
    entityId: data.id,
    entityName: data.title,
    projectId: data.project_id ?? data.artist_project_id ?? null,
  });

  return NextResponse.json(mapDeal(data));
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, error } = await requireAuth();
  if (error) return error;

  const { data: existing, error: findErr } = await supabase
    .from("deals")
    .select("id, title, project_id, artist_project_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Deal no encontrado" }, { status: 404 });
  }

  // Antes bastaba con ser admin de la ORGANIZACIÓN para borrar cualquier
  // deal, sin importar el proyecto -- mismo hueco que en eventos (23 ago
  // 2026). Ahora se exige el mismo rol de proyecto que ya se usa para
  // editar (admin/member de ESE proyecto puntual).
  const dealRole = await getProjectRole(supabase, user!.id, existing.artist_project_id || existing.project_id || null);
  if (!canEditDeals(dealRole)) {
    return NextResponse.json({ error: "Tu rol no puede eliminar este deal" }, { status: 403 });
  }

  const { error: dbError } = await createAdminClient()
    .from("deals")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (dbError) {
    return NextResponse.json(
      { error: `Error al eliminar deal: ${dbError.message}` },
      { status: 500 }
    );
  }

  await logActivity({
    supabase,
    userId: user!.id,
    userEmail: user!.email,
    action: "delete",
    entityType: "deal",
    entityId: existing.id,
    entityName: existing.title,
    projectId: existing.project_id ?? existing.artist_project_id ?? null,
  });

  return NextResponse.json({ success: true });
}

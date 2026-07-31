import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { markEntityViewed } from "@/lib/entity-views";

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

  return NextResponse.json(mapDeal(data));
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
    .select("id, contact_id, company_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Deal no encontrado" }, { status: 404 });
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

  return NextResponse.json(mapDeal(data));
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) {
    return NextResponse.json({ error: "Solo Admin o Propietario pueden eliminar tratos" }, { status: 403 });
  }

  const { data: existing, error: findErr } = await supabase
    .from("deals")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Deal no encontrado" }, { status: 404 });
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

  return NextResponse.json({ success: true });
}

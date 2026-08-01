import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

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
    artistProjectId: row.artist_project_id ?? null,
    expectedClose: row.expected_close ?? null,
    probability: row.probability,
    notes: row.notes ?? null,
    referenceUrl: row.reference_url ?? null,
    isShow: row.is_show ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    contactName: row.contacts?.name ?? null,
    contactEmail: row.contacts?.email ?? null,
    stageName: row.pipeline_stages?.name ?? null,
    stageColor: row.pipeline_stages?.color ?? null,
    stageOrder: row.pipeline_stages?.order ?? null,
    stageIsWon: row.pipeline_stages?.is_won ?? false,
    stageIsLost: row.pipeline_stages?.is_lost ?? false,
    companyName: row.companies?.name ?? null,
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

export async function GET(request: NextRequest) {
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  let query = supabase
    .from("deals")
    .select(`
      *,
      contacts ( name, email ),
      pipeline_stages ( name, color, order, is_won, is_lost ),
      companies ( name ),
      deal_assignees!deal_assignees_deal_id_fkey (
        user_id,
        assigned_at,
        profiles!deal_assignees_user_id_fkey ( full_name, avatar_url, email )
      )
    `)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (projectId) {
    const { data: children } = await supabase
      .from("projects")
      .select("id")
      .eq("parent_project_id", projectId);

    const visibleIds = [projectId, ...(children ?? []).map((c) => c.id)];

    query = query.or(
      `project_id.in.(${visibleIds.join(",")}),artist_project_id.in.(${visibleIds.join(",")})`
    );
  }

  const { data, error: dbError } = await query;

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json((data ?? []).map(mapDeal));
}

export async function POST(request: NextRequest) {
  const { supabase, user, orgId, error } = await requireAuth();
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { title, value, valueType, percentageValue, taxType, stageId, contactId, companyId, expectedClose, probability, notes, referenceUrl, isShow, projectId, artistProjectId, assigneeIds } = body;

  const normalizedValueType = valueType === "percentage" ? "percentage" : "fixed";
  const normalizedTaxType = taxType === "exento" ? "exento" : "afecto";
  const normalizedValue = Number(value) || 0;
  const normalizedPercentageValue = percentageValue == null || percentageValue === ""
    ? null
    : Number(percentageValue);

  if (!title || (!contactId && !companyId)) {
    return NextResponse.json(
      { error: "Titulo y una asociacion (contacto o empresa) son requeridos" },
      { status: 400 }
    );
  }

  if (
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

  // Si no viene stageId, tomar la primera etapa del pipeline
  let finalStageId = stageId;
  if (!finalStageId) {
    const { data: firstStage } = await supabase
      .from("pipeline_stages")
      .select("id")
      .order("order", { ascending: true })
      .limit(1)
      .single();
    finalStageId = firstStage?.id;
  }

  if (!finalStageId) {
    return NextResponse.json(
      { error: "No hay etapas de pipeline configuradas" },
      { status: 400 }
    );
  }

  const finalContactId = contactId || null;
  const finalCompanyId = companyId || null;

  const { data, error: dbError } = await supabase
    .from("deals")
    .insert({
      title,
      value: normalizedValueType === "fixed" ? normalizedValue : 0,
      value_type: normalizedValueType,
      tax_type: normalizedTaxType,
      stage_id: finalStageId,
      contact_id: finalContactId,
      company_id: finalCompanyId,
      expected_close: expectedClose ? new Date(expectedClose).toISOString() : null,
      probability: Math.max(0, Math.min(100, Number(probability) || 0)),
      notes: notes || null,
      reference_url: (typeof referenceUrl === "string" ? referenceUrl.trim() : null) || null,
      is_show: Boolean(isShow),
      organization_id: orgId,
      created_by: user!.id,
      project_id: projectId || null,
      artist_project_id: artistProjectId || null,
      ...(normalizedValueType === "percentage" ? { percentage_value: normalizedPercentageValue } : {}),
    })
    .select()
    .single();

  if (dbError) {
    if (dbError.message.includes("contact_id") && dbError.message.includes("null value")) {
      return NextResponse.json(
        { error: "Tu base de datos aun exige contacto obligatorio en deals. Aplica la migracion para permitir deals solo con empresa (contact_id nullable)." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: `Error al crear deal: ${dbError.message}` },
      { status: 500 }
    );
  }

  // Insert assignees if provided (mismo patron que tasks: no fatal si falla)
  if (assigneeIds && Array.isArray(assigneeIds) && assigneeIds.length > 0 && data) {
    const assigneesData = assigneeIds.map((userId: string) => ({
      deal_id: data.id,
      user_id: userId,
      assigned_by: user!.id,
    }));

    const { error: assignError } = await supabase
      .from("deal_assignees")
      .insert(assigneesData);

    if (assignError) {
      console.error("Failed to assign users to deal:", assignError);
    }
  }

  return NextResponse.json(mapDeal(data), { status: 201 });
}

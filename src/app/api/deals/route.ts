import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDeal(row: any) {
  return {
    id: row.id,
    title: row.title,
    value: row.value,
    stageId: row.stage_id,
    contactId: row.contact_id,
    companyId: row.company_id ?? null,
    expectedClose: row.expected_close ?? null,
    probability: row.probability,
    notes: row.notes ?? null,
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
      companies ( name )
    `)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (projectId) query = query.eq("project_id", projectId);

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

  const { title, value, stageId, contactId, companyId, expectedClose, probability, notes, projectId } = body;

  if (!title || !contactId) {
    return NextResponse.json(
      { error: "Titulo y contacto son requeridos" },
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

  const { data, error: dbError } = await supabase
    .from("deals")
    .insert({
      title,
      value: value || 0,
      stage_id: finalStageId,
      contact_id: contactId,
      company_id: companyId || null,
      expected_close: expectedClose ? new Date(expectedClose).toISOString() : null,
      probability: Math.max(0, Math.min(100, Number(probability) || 0)),
      notes: notes || null,
      organization_id: orgId,
      created_by: user!.id,
      project_id: projectId || null,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json(
      { error: `Error al crear deal: ${dbError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(mapDeal(data), { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStage(stage: any, deals: any[]) {
  return {
    id: stage.id,
    name: stage.name,
    order: stage.order,
    color: stage.color,
    isWon: stage.is_won,
    isLost: stage.is_lost,
    deals: deals
      .filter((d) => d.stage_id === stage.id)
      .map((d) => ({
        id: d.id,
        title: d.title,
        value: d.value,
        stageId: d.stage_id,
        contactId: d.contact_id,
        companyId: d.company_id ?? null,
        expectedClose: d.expected_close ?? null,
        probability: d.probability,
        notes: d.notes ?? null,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
        contactName: d.contacts?.name ?? null,
        contactTemperature: d.contacts?.temperature ?? null,
      })),
  };
}

export async function GET() {
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const [{ data: stages, error: stagesErr }, { data: allDeals, error: dealsErr }] =
    await Promise.all([
      supabase
        .from("pipeline_stages")
        .select("*")
        .order("order", { ascending: true }),
      supabase
        .from("deals")
        .select("*, contacts ( name, temperature )")
        .is("deleted_at", null),
    ]);

  if (stagesErr) return NextResponse.json({ error: stagesErr.message }, { status: 500 });
  if (dealsErr) return NextResponse.json({ error: dealsErr.message }, { status: 500 });

  const pipeline = (stages ?? []).map((stage) =>
    mapStage(stage, allDeals ?? [])
  );

  return NextResponse.json(pipeline);
}

export async function PUT(request: NextRequest) {
  const { supabase, orgId, user, error } = await requireAuth();
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  // Mover deal entre etapas (drag & drop)
  if (body.dealId && body.stageId) {
    const { data: existing, error: findErr } = await supabase
      .from("deals")
      .select("id")
      .eq("id", body.dealId)
      .is("deleted_at", null)
      .single();

    if (findErr || !existing) {
      return NextResponse.json({ error: "Deal no encontrado" }, { status: 404 });
    }

    const { data, error: dbError } = await supabase
      .from("deals")
      .update({ stage_id: body.stageId, updated_at: new Date().toISOString() })
      .eq("id", body.dealId)
      .select()
      .single();

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({
      id: data.id,
      stageId: data.stage_id,
      updatedAt: data.updated_at,
    });
  }

  // Reemplazar etapas en bulk (desde /setup o /customize)
  if (body.stages && Array.isArray(body.stages)) {
    const { count } = await supabase
      .from("deals")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null);

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: "No se pueden reemplazar etapas cuando hay deals activos." },
        { status: 400 }
      );
    }

    // Eliminar etapas existentes e insertar nuevas
    await supabase.from("pipeline_stages").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    const newStages = body.stages.map(
      (stage: { name: string; order: number; color?: string; isWon?: boolean; isLost?: boolean }, idx: number) => ({
        name: stage.name,
        order: stage.order ?? idx,
        color: stage.color || "#64748b",
        is_won: stage.isWon || false,
        is_lost: stage.isLost || false,
        organization_id: orgId,
      })
    );

    const { data: inserted, error: insertErr } = await supabase
      .from("pipeline_stages")
      .insert(newStages)
      .select()
      .order("order", { ascending: true });

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json(
      (inserted ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        order: s.order,
        color: s.color,
        isWon: s.is_won,
        isLost: s.is_lost,
      }))
    );
  }

  return NextResponse.json({ error: "Request invalido" }, { status: 400 });
}


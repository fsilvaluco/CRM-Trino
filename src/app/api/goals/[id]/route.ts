import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { computeGoalCurrentValue, type GoalRow } from "@/lib/goals";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGoal(row: any, currentValue: number) {
  return {
    id: row.id,
    projectId: row.project_id,
    metricType: row.metric_type,
    title: row.title,
    targetValue: row.target_value,
    currentValue,
    periodType: row.period_type,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// PUT /api/goals/[id] -- edita titulo, target_value, period, y para
// metric_type = 'manual' tambien current_value (el numero que el
// equipo actualiza a mano).
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const { title, targetValue, currentValue, periodType, periodStart, periodEnd } = body as {
    title?: string;
    targetValue?: number;
    currentValue?: number;
    periodType?: string;
    periodStart?: string | null;
    periodEnd?: string | null;
  };

  const { data: existing, error: findErr } = await supabase
    .from("goals").select("*").eq("id", id).single();
  if (findErr || !existing) {
    return NextResponse.json({ error: "Meta no encontrada" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title.trim();
  if (targetValue !== undefined) updates.target_value = Number(targetValue) || 0;
  if (existing.metric_type === "manual" && currentValue !== undefined) {
    updates.current_value = Number(currentValue) || 0;
  }
  if (periodType !== undefined) {
    updates.period_type = periodType === "annual" || periodType === "custom" ? periodType : "monthly";
    updates.period_start = periodType === "custom" ? periodStart || null : null;
    updates.period_end = periodType === "custom" ? periodEnd || null : null;
  }

  const { data, error: dbError } = await supabase
    .from("goals")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: `Error al actualizar meta: ${dbError.message}` }, { status: 500 });
  }

  const withProgress = await computeGoalCurrentValue(supabase, data as GoalRow);
  return NextResponse.json(mapGoal(data, withProgress));
}

// DELETE /api/goals/[id] -- para las metas default que un proyecto no usa.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { error: dbError } = await supabase.from("goals").delete().eq("id", id);
  if (dbError) {
    return NextResponse.json({ error: `Error al eliminar meta: ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

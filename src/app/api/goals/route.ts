import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { computeGoalCurrentValue, DEFAULT_GOAL_TITLES, type GoalRow, type GoalMetricType } from "@/lib/goals";

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

// GET /api/goals?projectId=xxx -- lista las metas de un proyecto con su
// progreso ya calculado (excepto 'manual', que trae su propio numero).
export async function GET(request: NextRequest) {
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId es requerido" }, { status: 400 });
  }

  const { data, error: dbError } = await supabase
    .from("goals")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  const goals = (data ?? []) as GoalRow[];
  const withProgress = await Promise.all(
    goals.map(async (g) => mapGoal(g, await computeGoalCurrentValue(supabase, g)))
  );

  return NextResponse.json(withProgress);
}

const VALID_METRIC_TYPES: GoalMetricType[] = [
  "ventas_deals",
  "cantidad_deals",
  "tareas_completadas",
  "seguidores",
  "manual",
];

// POST /api/goals -- crea una meta nueva (ej. si borraron una de las
// default y quieren volver a agregarla, o quieren dos metas manuales
// distintas en el mismo proyecto).
export async function POST(request: NextRequest) {
  const { supabase, user, orgId, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const { projectId, metricType, title, targetValue, periodType, periodStart, periodEnd, currentValue } = body as {
    projectId?: string;
    metricType?: string;
    title?: string;
    targetValue?: number;
    periodType?: string;
    periodStart?: string;
    periodEnd?: string;
    currentValue?: number;
  };

  if (!projectId) {
    return NextResponse.json({ error: "projectId es requerido" }, { status: 400 });
  }
  if (!metricType || !VALID_METRIC_TYPES.includes(metricType as GoalMetricType)) {
    return NextResponse.json({ error: "metricType invalido" }, { status: 400 });
  }

  const { data, error: dbError } = await supabase
    .from("goals")
    .insert({
      organization_id: orgId,
      project_id: projectId,
      metric_type: metricType,
      title: title?.trim() || DEFAULT_GOAL_TITLES[metricType as GoalMetricType],
      target_value: Number(targetValue) || 0,
      current_value: metricType === "manual" ? Number(currentValue) || 0 : null,
      period_type: periodType === "annual" || periodType === "custom" ? periodType : "monthly",
      period_start: periodType === "custom" && periodStart ? periodStart : null,
      period_end: periodType === "custom" && periodEnd ? periodEnd : null,
      created_by: user!.id,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: `Error al crear meta: ${dbError.message}` }, { status: 500 });
  }

  const withProgress = await computeGoalCurrentValue(supabase, data as GoalRow);
  return NextResponse.json(mapGoal(data, withProgress), { status: 201 });
}

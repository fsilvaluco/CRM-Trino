import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Metas (KPIs) por proyecto ───────────────────────────────────────────────
// Ver migracion 047_goals.sql para el porque de la forma de la tabla.

export type GoalMetricType =
  | "ventas_deals"
  | "cantidad_deals"
  | "tareas_completadas"
  | "seguidores"
  | "manual";

export type GoalPeriodType = "monthly" | "annual" | "custom";

export const DEFAULT_GOAL_TITLES: Record<GoalMetricType, string> = {
  ventas_deals: "Ventas ganadas",
  cantidad_deals: "Deals ganados",
  tareas_completadas: "Tareas completadas",
  seguidores: "Crecimiento de seguidores",
  manual: "Meta manual",
};

export interface GoalRow {
  id: string;
  organization_id: string;
  project_id: string;
  metric_type: GoalMetricType;
  title: string;
  target_value: number;
  current_value: number | null;
  period_type: GoalPeriodType;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Resuelve la ventana de fechas [start, end] contra la que se mide el
 * progreso de una meta, segun su period_type:
 * - monthly/annual: SIEMPRE el mes/año calendario ACTUAL (recurrente,
 *   nunca queda "vencida" -- se resetea sola al cambiar de periodo).
 * - custom: el rango guardado en la fila. Si falta alguno de los dos
 *   extremos, se usa el mes actual como respaldo razonable.
 */
export function resolveGoalPeriod(goal: Pick<GoalRow, "period_type" | "period_start" | "period_end">): {
  start: Date;
  end: Date;
} {
  const now = new Date();

  if (goal.period_type === "annual") {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(now.getFullYear(), 11, 31, 23, 59, 59),
    };
  }

  if (goal.period_type === "custom" && goal.period_start && goal.period_end) {
    return {
      start: new Date(goal.period_start),
      end: new Date(`${goal.period_end}T23:59:59`),
    };
  }

  // monthly (o custom incompleto, como respaldo)
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
  };
}

/**
 * Calcula el valor actual (current_value) de una meta segun su tipo.
 * 'manual' no se calcula -- devuelve lo que ya esta guardado en la fila,
 * porque ese numero lo actualiza el equipo a mano.
 */
export async function computeGoalCurrentValue(
  supabase: SupabaseClient,
  goal: GoalRow
): Promise<number> {
  if (goal.metric_type === "manual") {
    return goal.current_value ?? 0;
  }

  const { start, end } = resolveGoalPeriod(goal);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  switch (goal.metric_type) {
    case "ventas_deals":
    case "cantidad_deals": {
      const { data: wonStages } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("organization_id", goal.organization_id)
        .eq("is_won", true);
      const wonStageIds = (wonStages ?? []).map((s) => s.id);
      if (wonStageIds.length === 0) return 0;

      const { data } = await supabase
        .from("deals")
        .select("value")
        .eq("project_id", goal.project_id)
        .in("stage_id", wonStageIds)
        .is("deleted_at", null)
        .gte("updated_at", startIso)
        .lte("updated_at", endIso);

      if (goal.metric_type === "cantidad_deals") return (data ?? []).length;
      return (data ?? []).reduce((sum, d) => sum + (d.value ?? 0), 0) / 100;
    }

    case "tareas_completadas": {
      const { count } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .or(`project_id.eq.${goal.project_id},artist_project_id.eq.${goal.project_id}`)
        .eq("status", "listo")
        .is("deleted_at", null)
        .gte("completed_at", startIso)
        .lte("completed_at", endIso);
      return count ?? 0;
    }

    case "seguidores": {
      // Crecimiento neto: ultimo valor conocido al final del periodo,
      // menos el ultimo valor conocido antes de que empezara -- sumado
      // entre todas las plataformas conectadas de este proyecto.
      const { data: beforeRows } = await supabase
        .from("social_metrics")
        .select("platform, followers, recorded_at")
        .eq("project_id", goal.project_id)
        .lt("recorded_at", start.toISOString().slice(0, 10))
        .order("recorded_at", { ascending: false });

      const { data: withinRows } = await supabase
        .from("social_metrics")
        .select("platform, followers, recorded_at")
        .eq("project_id", goal.project_id)
        .gte("recorded_at", start.toISOString().slice(0, 10))
        .lte("recorded_at", end.toISOString().slice(0, 10))
        .order("recorded_at", { ascending: false });

      const latestPerPlatform = (rows: Array<{ platform: string; followers: number }>) => {
        const map = new Map<string, number>();
        for (const r of rows) {
          if (!map.has(r.platform)) map.set(r.platform, r.followers);
        }
        return map;
      };

      const beforeMap = latestPerPlatform(beforeRows ?? []);
      const endMap = latestPerPlatform(withinRows ?? []);

      let growth = 0;
      for (const [platform, endValue] of endMap) {
        const startValue = beforeMap.get(platform) ?? endValue;
        growth += endValue - startValue;
      }
      return growth;
    }

    default:
      return 0;
  }
}

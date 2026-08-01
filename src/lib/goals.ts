import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Metas (KPIs) por proyecto ───────────────────────────────────────────────
// Ver migracion 047_goals.sql para el porque de la forma de la tabla.

export type GoalMetricType =
  | "ventas_deals"
  | "cantidad_deals"
  | "tareas_completadas"
  | "seguidores"
  | "oyentes_spotify"
  | "menciones_prensa"
  | "manual";

export type GoalPeriodType = "monthly" | "annual" | "custom";

export const DEFAULT_GOAL_TITLES: Record<GoalMetricType, string> = {
  ventas_deals: "Ventas ganadas",
  cantidad_deals: "Deals ganados",
  tareas_completadas: "% de tareas completadas",
  seguidores: "Crecimiento de seguidores",
  oyentes_spotify: "Oyentes mensuales Spotify",
  menciones_prensa: "Menciones de prensa",
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
 * El calculo real por metric_type, para una ventana [start, end]
 * explicita -- separado de resolveGoalPeriod para poder reusarlo tanto
 * para "el periodo actual" como para "el mismo tramo del periodo
 * anterior" (la comparacion de ritmo).
 */
async function computeValueForWindow(
  supabase: SupabaseClient,
  goal: Pick<GoalRow, "organization_id" | "project_id" | "metric_type">,
  start: Date,
  end: Date
): Promise<number> {
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
      // % de tareas CREADAS en el periodo que hoy estan en Listo o
      // Descartado (no cuenta cuando se completaron, sino cuanto de lo
      // que se generó ese mes/año ya quedó resuelto).
      const { data: createdInPeriod } = await supabase
        .from("tasks")
        .select("id, status")
        .or(`project_id.eq.${goal.project_id},artist_project_id.eq.${goal.project_id}`)
        .is("deleted_at", null)
        .gte("created_at", startIso)
        .lte("created_at", endIso);

      const rows = createdInPeriod ?? [];
      if (rows.length === 0) return 0;

      const resolved = rows.filter((t) => t.status === "listo" || t.status === "descartado").length;
      return Math.round((resolved / rows.length) * 1000) / 10; // 1 decimal
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

    case "oyentes_spotify": {
      // No es una suma en el periodo -- es "el ultimo snapshot conocido
      // que cae dentro (o antes) del periodo", porque cada snapshot de
      // Spotify ya representa ~un mes de datos por si solo.
      const { data } = await supabase
        .from("spotify_stats_snapshots")
        .select("listeners, monthly_active_listeners, period_end")
        .eq("project_id", goal.project_id)
        .lte("period_end", end.toISOString().slice(0, 10))
        .order("period_end", { ascending: false })
        .limit(1);
      const snapshot = (data ?? [])[0];
      if (!snapshot) return 0;
      return snapshot.monthly_active_listeners ?? snapshot.listeners ?? 0;
    }

    case "menciones_prensa": {
      const { count } = await supabase
        .from("press_mentions")
        .select("id", { count: "exact", head: true })
        .eq("project_id", goal.project_id)
        .gte("mention_date", start.toISOString().slice(0, 10))
        .lte("mention_date", end.toISOString().slice(0, 10));
      return count ?? 0;
    }

    default:
      return 0;
  }
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
  return computeValueForWindow(supabase, goal, start, end);
}

/**
 * Compara "lo que llevo hoy" contra "lo que llevaba el mes (o año)
 * pasado, a esta misma fecha relativa" -- para saber si el ritmo va
 * mejor o peor que el periodo anterior, sin esperar a que termine el
 * mes para saberlo.
 *
 * Devuelve null cuando no aplica: metas 'manual' (no hay fuente para
 * recalcular el pasado sin un historial guardado) y metas de rango
 * personalizado (no hay un "periodo anterior" natural que comparar).
 */
export async function computeGoalPaceComparison(
  supabase: SupabaseClient,
  goal: GoalRow
): Promise<{ previousValue: number } | null> {
  if (goal.metric_type === "manual") return null;
  if (goal.period_type === "custom") return null;

  const now = new Date();

  let prevStart: Date;
  let prevEnd: Date;

  if (goal.period_type === "annual") {
    prevStart = new Date(now.getFullYear() - 1, 0, 1);
    prevEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 23, 59, 59);
  } else {
    // monthly: mismo dia-del-mes, mes anterior (si el mes anterior es
    // mas corto -- ej. hoy es 31 y el mes pasado tenia 30 dias -- se cae
    // al ultimo dia disponible de ese mes).
    const prevMonthLastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    const day = Math.min(now.getDate(), prevMonthLastDay);
    prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, day, 23, 59, 59);
  }

  const previousValue = await computeValueForWindow(supabase, goal, prevStart, prevEnd);
  return { previousValue };
}

// ─── Historial de metas (para reportes de fin de año) ───────────────────────
// Ver migracion 049_goal_history.sql.

/**
 * Guarda una "foto" del resultado de una meta para un mes o año que ya
 * terminó. Idempotente: si ya existe una foto para esta meta+periodo,
 * no hace nada (por el UNIQUE(goal_id, period_label) + ignoreDuplicates).
 *
 * Para 'manual' usa el current_value que esta guardado en la fila en
 * este momento (no hay otra fuente) -- por eso es importante que esto
 * corra justo al cambiar de periodo, antes de que alguien actualice el
 * numero para el mes/año nuevo.
 */
export async function captureGoalSnapshot(
  supabase: SupabaseClient,
  goal: GoalRow,
  periodType: "monthly" | "annual",
  year: number,
  month?: number // 0-indexed (0 = enero), requerido si periodType = 'monthly'
): Promise<void> {
  const periodLabel =
    periodType === "annual" ? String(year) : `${year}-${String((month ?? 0) + 1).padStart(2, "0")}`;

  let achieved: number;
  if (goal.metric_type === "manual") {
    achieved = goal.current_value ?? 0;
  } else {
    const start = periodType === "annual" ? new Date(year, 0, 1) : new Date(year, month!, 1);
    const end =
      periodType === "annual"
        ? new Date(year, 11, 31, 23, 59, 59)
        : new Date(year, month! + 1, 0, 23, 59, 59);
    achieved = await computeValueForWindow(supabase, goal, start, end);
  }

  const pctAchieved = goal.target_value > 0 ? Math.round((achieved / goal.target_value) * 1000) / 10 : null;

  await supabase.from("goal_history").upsert(
    {
      organization_id: goal.organization_id,
      project_id: goal.project_id,
      goal_id: goal.id,
      metric_type: goal.metric_type,
      title: goal.title,
      period_type: periodType,
      period_label: periodLabel,
      target_value: goal.target_value,
      achieved_value: achieved,
      pct_achieved: pctAchieved,
    },
    { onConflict: "goal_id,period_label", ignoreDuplicates: true }
  );
}

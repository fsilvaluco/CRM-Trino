import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// GET /api/goals/[id]/history -- el historial mensual/anual guardado
// de esta meta (ver migracion 049_goal_history.sql). Vacio si la meta
// es de rango personalizado, es nueva, o todavia no paso ningun cierre
// de mes/año desde que existe el cron de snapshot.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data, error: dbError } = await supabase
    .from("goal_history")
    .select("*")
    .eq("goal_id", id)
    .order("period_label", { ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json(
    (data ?? []).map((row) => ({
      id: row.id,
      periodType: row.period_type,
      periodLabel: row.period_label,
      targetValue: row.target_value,
      achievedValue: row.achieved_value,
      pctAchieved: row.pct_achieved,
      capturedAt: row.captured_at,
    }))
  );
}

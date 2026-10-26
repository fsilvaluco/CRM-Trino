import { NextRequest, NextResponse } from "next/server";
import { requireTourAccess } from "@/lib/tours/access";
import type { SalesPoint } from "@/types/tours";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/giras/[id]/ventas -- serie de venta acumulada por fecha, desde
// goal_history (un punto cada vez que cambian los tiers del evento).
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { access, error } = await requireTourAccess(id, "view");
  if (error) return error;

  const { data: shows } = await access.supabase.from("shows").select("id").eq("tour_id", id);
  const showIds = (shows ?? []).map((s: { id: string }) => s.id);
  if (showIds.length === 0) return NextResponse.json([]);

  const { data, error: dbError } = await access.supabase
    .from("goal_history")
    .select("show_id, captured_at, achieved_value")
    .in("show_id", showIds)
    .eq("metric_type", "entradas_show")
    .order("captured_at");
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  const points: SalesPoint[] = (data ?? []).map((r: { show_id: string; captured_at: string; achieved_value: number }) => ({
    showId: r.show_id,
    capturedAt: r.captured_at,
    sold: Number(r.achieved_value),
  }));
  return NextResponse.json(points);
}

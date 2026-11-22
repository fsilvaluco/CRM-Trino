import { NextRequest, NextResponse } from "next/server";
import { requireTourAccess } from "@/lib/tours/access";
import type { SalesPoint } from "@/types/tours";

type Ctx = { params: Promise<{ id: string }> };

type SnapshotRow = {
  show_id: string;
  captured_at: string;
  sold: number | null;
  capacity: number | null;
  revenue: number | string | null;
  visits: number | null;
};

const PAGE = 1000; // límite de filas por request de PostgREST

// GET /api/giras/[id]/ventas -- serie de venta acumulada por fecha, desde
// ticket_sales_snapshots (la llena la edge function sync-tickets cada 5 min).
// Para no mandar miles de puntos al navegador se deja el último snapshot de
// cada hora por fecha. revenue viene en pesos; se devuelve en centavos como
// el resto de los montos del CRM.
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { access, error } = await requireTourAccess(id, "view");
  if (error) return error;
  const { supabase, canViewCosts } = access;

  const { data: shows } = await supabase.from("shows").select("id").eq("tour_id", id);
  const showIds = (shows ?? []).map((s: { id: string }) => s.id);
  if (showIds.length === 0) return NextResponse.json([]);

  const rows: SnapshotRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error: dbError } = await supabase
      .from("ticket_sales_snapshots")
      .select("show_id, captured_at, sold, capacity, revenue, visits")
      .in("show_id", showIds)
      .order("captured_at")
      .order("id")
      .range(from, from + PAGE - 1);
    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
    rows.push(...((data ?? []) as SnapshotRow[]));
    if (!data || data.length < PAGE) break;
  }

  // Último snapshot por (fecha, hora). Las filas vienen ordenadas, así que
  // basta con sobrescribir.
  const byHour = new Map<string, SnapshotRow>();
  for (const r of rows) byHour.set(`${r.show_id}|${r.captured_at.slice(0, 13)}`, r);

  const points: SalesPoint[] = [...byHour.values()].map((r) => ({
    showId: r.show_id,
    capturedAt: r.captured_at,
    sold: Number(r.sold ?? 0),
    capacity: r.capacity === null ? null : Number(r.capacity),
    revenue: canViewCosts && r.revenue !== null ? Math.round(Number(r.revenue) * 100) : null,
    visits: r.visits === null ? null : Number(r.visits),
  }));
  return NextResponse.json(points);
}

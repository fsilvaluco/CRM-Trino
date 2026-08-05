import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// POST /api/eventos/[id]/costs/close -- marca la planilla de costos como
// cerrada: fecha + quien la cerró. Desde ahí queda de solo lectura (el
// PUT de /costs la rechaza) hasta que se reabra.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, error } = await requireAuth();
  if (error) return error;

  const { data, error: dbError } = await supabase
    .from("shows")
    .update({ cost_sheet_closed_at: new Date().toISOString(), cost_sheet_closed_by: user!.id })
    .eq("id", id)
    .select("cost_sheet_closed_at")
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ closedAt: data.cost_sheet_closed_at });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// POST /api/eventos/[id]/costs/reopen -- deshace el cierre, por si hay que
// corregir algo despues.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { error: dbError } = await supabase
    .from("shows")
    .update({ cost_sheet_closed_at: null, cost_sheet_closed_by: null })
    .eq("id", id);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

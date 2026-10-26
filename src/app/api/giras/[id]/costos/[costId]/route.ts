import { NextRequest, NextResponse } from "next/server";
import { requireTourAccess } from "@/lib/tours/access";

type Ctx = { params: Promise<{ id: string; costId: string }> };

// DELETE /api/giras/[id]/costos/[costId]
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id, costId } = await params;
  const { access, error } = await requireTourAccess(id, "editCosts");
  if (error) return error;

  const { error: dbError } = await access.supabase.from("tour_cost_items").delete().eq("id", costId).eq("tour_id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

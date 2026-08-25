import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// DELETE /api/loans/[id]/repayments/[repaymentId] -- por si se cargó un
// abono por error.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; repaymentId: string }> }
) {
  const { id, repaymentId } = await params;
  const { supabase, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: loan } = await supabase.from("loans").select("id, project_id").eq("id", id).single();
  if (!loan) return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });
  if (!allowedProjectIds.includes(loan.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }

  const { error: dbError } = await supabase.from("loan_repayments").delete().eq("id", repaymentId).eq("loan_id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

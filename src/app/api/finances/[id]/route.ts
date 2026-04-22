import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// PATCH /api/finances/[id] → marcar reembolsado
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if (typeof body.reimbursed === "boolean") {
    updates.reimbursed = body.reimbursed;
    updates.reimbursed_at = body.reimbursed ? new Date().toISOString() : null;
  }
  if (body.transactionDate !== undefined) {
    updates.transaction_date = body.transactionDate ?? null;
  }

  const { error: dbError } = await supabase
    .from("transactions")
    .update(updates)
    .eq("id", id)
    .eq("organization_id", orgId!);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/finances/[id] → soft delete
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const { error: dbError } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", orgId!);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

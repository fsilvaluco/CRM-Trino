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

  const { error: dbError } = await supabase
    .from("transactions")
    .update({ reimbursed: body.reimbursed, reimbursed_at: body.reimbursed ? new Date().toISOString() : null })
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

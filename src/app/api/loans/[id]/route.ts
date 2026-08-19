import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

async function loadLoanProjectId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  id: string
): Promise<string | null> {
  const { data } = await supabase.from("loans").select("project_id").eq("id", id).single();
  return data?.project_id ?? null;
}

// PUT /api/loans/[id] -- editar un préstamo (ej. marcar "recibido" cuando
// llega la plata, corregir el monto/nombre).
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, isAdmin, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const projectId = await loadLoanProjectId(supabase, id);
  if (!projectId) return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });
  if (!isAdmin && (!allowedProjectIds || !allowedProjectIds.includes(projectId))) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { lenderName, principalAmount, received, receivedAt, notes } = body as {
    lenderName?: string;
    principalAmount?: number;
    received?: boolean;
    receivedAt?: string | null;
    notes?: string | null;
  };

  const updates: Record<string, unknown> = {};
  if (lenderName !== undefined) updates.lender_name = lenderName.trim();
  if (principalAmount !== undefined) updates.principal_amount = Math.round(principalAmount);
  if (notes !== undefined) updates.notes = notes || null;
  if (received !== undefined) {
    updates.received = received;
    updates.received_at = received ? (receivedAt || new Date().toISOString()) : null;
  }

  const { data, error: dbError } = await supabase
    .from("loans")
    .update(updates)
    .eq("id", id)
    .select("*, loan_repayments ( id, amount, repayment_date, comprobante_url, notes, created_at )")
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  const repaid = (data.loan_repayments ?? []).reduce((sum: number, r: { amount: number }) => sum + r.amount, 0);
  return NextResponse.json({
    id: data.id,
    lenderName: data.lender_name,
    principalAmount: data.principal_amount,
    received: data.received,
    receivedAt: data.received_at,
    repaidAmount: repaid,
    outstandingAmount: data.principal_amount - repaid,
  });
}

// DELETE /api/loans/[id] -- borra el préstamo y sus abonos (ON DELETE
// CASCADE). Sin confirmaciones extra en la API -- la UI ya pide confirmar.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, isAdmin, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const projectId = await loadLoanProjectId(supabase, id);
  if (!projectId) return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });
  if (!isAdmin && (!allowedProjectIds || !allowedProjectIds.includes(projectId))) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }

  const { error: dbError } = await supabase.from("loans").delete().eq("id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

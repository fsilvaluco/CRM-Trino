import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// POST /api/loans/[id]/repayments -- registra un abono a este prestamista
// puntual (ej. los $85.000 mensuales). El saldo pendiente del préstamo se
// recalcula solo (nunca se guarda aparte).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: loan } = await supabase.from("loans").select("id, project_id").eq("id", id).single();
  if (!loan) return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });
  if (!allowedProjectIds.includes(loan.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { amount, repaymentDate, comprobanteUrl, notes } = body as {
    amount?: number;
    repaymentDate?: string | null;
    comprobanteUrl?: string | null;
    notes?: string | null;
  };

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "El monto tiene que ser mayor a $0" }, { status: 400 });
  }

  const { data, error: dbError } = await supabase
    .from("loan_repayments")
    .insert({
      loan_id: id,
      amount: Math.round(amount),
      repayment_date: repaymentDate || null,
      comprobante_url: comprobanteUrl || null,
      notes: notes || null,
      created_by: user!.id,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json(
    {
      id: data.id,
      amount: data.amount,
      repaymentDate: data.repayment_date,
      comprobanteUrl: data.comprobante_url,
      notes: data.notes,
      createdAt: data.created_at,
    },
    { status: 201 }
  );
}

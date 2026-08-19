import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLoan(row: any) {
  const repaid = (row.loan_repayments ?? []).reduce((sum: number, r: { amount: number }) => sum + r.amount, 0);
  return {
    id: row.id,
    projectId: row.project_id,
    lenderName: row.lender_name,
    principalAmount: row.principal_amount,
    received: row.received,
    receivedAt: row.received_at,
    notes: row.notes,
    createdAt: row.created_at,
    // Calculado -- nunca se guarda, siempre a partir de loan_repayments.
    repaidAmount: repaid,
    outstandingAmount: row.principal_amount - repaid,
    repayments: (row.loan_repayments ?? [])
      .map((r: { id: string; amount: number; repayment_date: string | null; comprobante_url: string | null; notes: string | null; created_at: string }) => ({
        id: r.id,
        amount: r.amount,
        repaymentDate: r.repayment_date,
        comprobanteUrl: r.comprobante_url,
        notes: r.notes,
        createdAt: r.created_at,
      }))
      .sort((a: { createdAt: string }, b: { createdAt: string }) => (a.createdAt < b.createdAt ? 1 : -1)),
  };
}

// GET /api/loans?projectId=... -- lista de préstamos de un proyecto, con
// sus abonos ya sumados (saldo pendiente calculado, nunca guardado).
export async function GET(request: NextRequest) {
  const { supabase, isAdmin, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId requerido" }, { status: 400 });
  if (!isAdmin && (!allowedProjectIds || !allowedProjectIds.includes(projectId))) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }

  const { data, error: dbError } = await supabase
    .from("loans")
    .select("*, loan_repayments ( id, amount, repayment_date, comprobante_url, notes, created_at )")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json((data ?? []).map(mapLoan));
}

// POST /api/loans -- registra un prestamista nuevo.
export async function POST(request: NextRequest) {
  const { supabase, user, orgId, isAdmin, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const { projectId, lenderName, principalAmount, received, receivedAt, notes } = body as {
    projectId?: string;
    lenderName?: string;
    principalAmount?: number;
    received?: boolean;
    receivedAt?: string | null;
    notes?: string | null;
  };

  if (!projectId) return NextResponse.json({ error: "projectId requerido" }, { status: 400 });
  if (!isAdmin && (!allowedProjectIds || !allowedProjectIds.includes(projectId))) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }
  if (!lenderName?.trim()) return NextResponse.json({ error: "Falta el nombre del prestamista" }, { status: 400 });
  if (!principalAmount || principalAmount <= 0) {
    return NextResponse.json({ error: "El monto prestado tiene que ser mayor a $0" }, { status: 400 });
  }

  const { data, error: dbError } = await supabase
    .from("loans")
    .insert({
      organization_id: orgId,
      project_id: projectId,
      lender_name: lenderName.trim(),
      principal_amount: Math.round(principalAmount),
      received: received === true,
      received_at: received === true ? (receivedAt || new Date().toISOString()) : null,
      notes: notes || null,
      created_by: user!.id,
    })
    .select("*, loan_repayments ( id, amount, repayment_date, comprobante_url, notes, created_at )")
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json(mapLoan(data), { status: 201 });
}

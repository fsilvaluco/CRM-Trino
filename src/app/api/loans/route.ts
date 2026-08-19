import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { logActivity } from "@/lib/activity-logs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLoan(row: any) {
  const repaid = (row.loan_repayments ?? []).reduce((sum: number, r: { amount: number }) => sum + r.amount, 0);
  return {
    id: row.id,
    projectId: row.project_id,
    lenderName: row.lender_name,
    // "Responsable" = qué artista consiguió este préstamo (ej. "SoloNacho")
    // -- distinto del prestamista, que puede ser un tercero (su empresa,
    // un familiar) que no es parte del proyecto.
    responsibleName: row.responsible_name,
    principalAmount: row.principal_amount,
    received: row.received,
    receivedAt: row.received_at,
    notes: row.notes,
    // Datos bancarios del prestamista, para hacerle la transferencia de
    // vuelta sin tener que buscarlos en otro lado.
    holderRut: row.holder_rut,
    bankName: row.bank_name,
    accountType: row.account_type,
    accountNumber: row.account_number,
    contactEmail: row.contact_email,
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
  const {
    projectId, lenderName, responsibleName, principalAmount, received, receivedAt, notes,
    holderRut, bankName, accountType, accountNumber, contactEmail,
  } = body as {
    projectId?: string;
    lenderName?: string;
    responsibleName?: string | null;
    principalAmount?: number;
    received?: boolean;
    receivedAt?: string | null;
    notes?: string | null;
    holderRut?: string | null;
    bankName?: string | null;
    accountType?: string | null;
    accountNumber?: string | null;
    contactEmail?: string | null;
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
      responsible_name: responsibleName?.trim() || null,
      principal_amount: Math.round(principalAmount),
      received: received === true,
      received_at: received === true ? (receivedAt || new Date().toISOString()) : null,
      notes: notes || null,
      holder_rut: holderRut?.trim() || null,
      bank_name: bankName?.trim() || null,
      account_type: accountType?.trim() || null,
      account_number: accountNumber?.trim() || null,
      contact_email: contactEmail?.trim() || null,
      created_by: user!.id,
    })
    .select("*, loan_repayments ( id, amount, repayment_date, comprobante_url, notes, created_at )")
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  await logActivity({
    supabase,
    userId: user!.id,
    userEmail: user!.email,
    action: "create",
    entityType: "loan",
    entityId: data.id,
    entityName: data.lender_name,
    projectId: data.project_id,
  });

  return NextResponse.json(mapLoan(data), { status: 201 });
}

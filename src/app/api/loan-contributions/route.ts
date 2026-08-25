import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapContribution(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    contributorName: row.contributor_name,
    amount: row.amount,
    contributionDate: row.contribution_date,
    comprobanteUrl: row.comprobante_url,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

// GET /api/loan-contributions?projectId=... -- aportes que juntan los
// artistas para poder pagarle a los prestamistas. No es ingreso del
// proyecto -- es plata de paso, guardada aparte de Finanzas a propósito.
export async function GET(request: NextRequest) {
  const { supabase, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId requerido" }, { status: 400 });
  if (!allowedProjectIds.includes(projectId)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }

  const { data, error: dbError } = await supabase
    .from("loan_contributions")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json((data ?? []).map(mapContribution));
}

// POST /api/loan-contributions -- registra un aporte (ej. los $150.000
// mensuales de cada artista).
export async function POST(request: NextRequest) {
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const { projectId, contributorName, amount, contributionDate, comprobanteUrl, notes } = body as {
    projectId?: string;
    contributorName?: string;
    amount?: number;
    contributionDate?: string | null;
    comprobanteUrl?: string | null;
    notes?: string | null;
  };

  if (!projectId) return NextResponse.json({ error: "projectId requerido" }, { status: 400 });
  if (!allowedProjectIds.includes(projectId)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }
  if (!contributorName?.trim()) return NextResponse.json({ error: "Falta quién aportó" }, { status: 400 });
  if (!amount || amount <= 0) return NextResponse.json({ error: "El monto tiene que ser mayor a $0" }, { status: 400 });

  const { data, error: dbError } = await supabase
    .from("loan_contributions")
    .insert({
      organization_id: orgId,
      project_id: projectId,
      contributor_name: contributorName.trim(),
      amount: Math.round(amount),
      contribution_date: contributionDate || null,
      comprobante_url: comprobanteUrl || null,
      notes: notes || null,
      created_by: user!.id,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json(mapContribution(data), { status: 201 });
}

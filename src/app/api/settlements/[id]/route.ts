import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { logActivity } from "@/lib/activity-logs";
import { getProjectPermissions, canEditModule, canDeleteModule } from "@/lib/project-roles";

async function checkAccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  orgId: string,
  allowedProjectIds: string[],
  settlementId: string,
  action: "editar" | "eliminar"
): Promise<{ error: NextResponse | null; projectId: string | null }> {
  const { data: existing, error: findErr } = await supabase
    .from("settlements")
    .select("id, project_id")
    .eq("id", settlementId)
    .eq("organization_id", orgId)
    .single();

  if (findErr || !existing) {
    return { error: NextResponse.json({ error: "Liquidación no encontrada" }, { status: 404 }), projectId: null };
  }
  if (!existing.project_id || !allowedProjectIds.includes(existing.project_id)) {
    return { error: NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 }), projectId: null };
  }
  const perm = await getProjectPermissions(supabase, userId, existing.project_id);
  const allowed = action === "editar" ? canEditModule(perm, "finanzas") : canDeleteModule(perm, "finanzas");
  if (!allowed) {
    return {
      error: NextResponse.json({ error: `Tu rol no puede ${action} liquidaciones en este proyecto` }, { status: 403 }),
      projectId: null,
    };
  }
  return { error: null, projectId: existing.project_id };
}

// PUT /api/settlements/[id] -- editar liquidación (montos, %, comprobantes, notas)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const access = await checkAccess(supabase, user!.id, orgId!, allowedProjectIds, id, "editar");
  if (access.error) return access.error;

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  if (body.periodMonth !== undefined) updates.period_month = body.periodMonth ?? null;
  if (body.periodYear !== undefined) updates.period_year = body.periodYear ?? null;
  if (body.payerName !== undefined) updates.payer_name = String(body.payerName).trim();
  if (body.payeeName !== undefined) updates.payee_name = String(body.payeeName).trim();
  if (body.sourceAmount !== undefined) updates.source_amount = Math.round(Number(body.sourceAmount) || 0);
  if (body.sourceProofPath !== undefined) updates.source_proof_path = body.sourceProofPath ?? null;
  if (body.sourceProofName !== undefined) updates.source_proof_name = body.sourceProofName ?? null;
  if (body.percentage !== undefined) updates.percentage = Number(body.percentage) || 0;
  if (body.payoutAmount !== undefined) updates.payout_amount = Math.round(Number(body.payoutAmount) || 0);
  if (body.payoutProofPath !== undefined) updates.payout_proof_path = body.payoutProofPath ?? null;
  if (body.payoutProofName !== undefined) updates.payout_proof_name = body.payoutProofName ?? null;
  if (body.notes !== undefined) updates.notes = body.notes ?? null;
  if (typeof body.paid === "boolean") {
    updates.paid = body.paid;
    updates.paid_at = body.paid ? new Date().toISOString() : null;
  }
  updates.updated_at = new Date().toISOString();

  const { data, error: dbError } = await supabase
    .from("settlements")
    .update(updates)
    .eq("id", id)
    .eq("organization_id", orgId!)
    .select("id, type, payer_name, payee_name, project_id")
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  await logActivity({
    supabase,
    userId: user!.id,
    userEmail: user!.email,
    action: "update",
    entityType: "settlement",
    entityId: data.id,
    entityName: `${data.payer_name} → ${data.payee_name}`,
    projectId: data.project_id,
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/settlements/[id] -- soft delete
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const access = await checkAccess(supabase, user!.id, orgId!, allowedProjectIds, id, "eliminar");
  if (access.error) return access.error;

  const { data, error: dbError } = await supabase
    .from("settlements")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", orgId!)
    .select("id, payer_name, payee_name, project_id")
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  if (data) {
    await logActivity({
      supabase,
      userId: user!.id,
      userEmail: user!.email,
      action: "delete",
      entityType: "settlement",
      entityId: data.id,
      entityName: `${data.payer_name} → ${data.payee_name}`,
      projectId: data.project_id,
    });
  }

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { logActivity } from "@/lib/activity-logs";
import { getProjectPermissions, canEditModule, canDeleteModule, canViewModule } from "@/lib/project-roles";

// GET /api/settlements/[id] -- detalle de una liquidación (usado por la
// pantalla de firma, que necesita cargar UNA sin traer la lista completa).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: row, error: findErr } = await supabase
    .from("settlements")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId!)
    .is("deleted_at", null)
    .single();

  if (findErr || !row) {
    return NextResponse.json({ error: "Liquidación no encontrada" }, { status: 404 });
  }
  if (!allowedProjectIds.includes(row.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }
  const perm = await getProjectPermissions(supabase, user!.id, row.project_id);
  if (!canViewModule(perm, "finanzas")) {
    return NextResponse.json({ error: "Sin acceso a Finanzas para tu rol" }, { status: 403 });
  }

  const [{ data: sigRows }, { data: requiredProfiles }] = await Promise.all([
    supabase
      .from("settlement_signatures")
      .select("user_id, signed_at, ip_address, profiles ( full_name, email )")
      .eq("settlement_id", id),
    row.required_signer_ids?.length
      ? supabase.from("profiles").select("id, full_name, email").in("id", row.required_signer_ids)
      : Promise.resolve({ data: [] }),
  ]);

  const signatures = ((sigRows ?? []) as unknown as {
    user_id: string;
    signed_at: string;
    ip_address: string | null;
    profiles: { full_name: string | null; email: string | null } | null;
  }[]).map((s) => ({
    userId: s.user_id,
    signedAt: s.signed_at,
    ipAddress: s.ip_address ?? null,
    name: s.profiles?.full_name ?? s.profiles?.email ?? null,
  }));

  const requiredSigners = ((requiredProfiles ?? []) as { id: string; full_name: string | null; email: string | null }[]).map(
    (p) => ({ userId: p.id, name: p.full_name ?? p.email ?? "Alguien" })
  );

  const signedIds = new Set(signatures.map((s) => s.userId));
  const isRequiredSigner = (row.required_signer_ids ?? []).includes(user!.id);
  const alreadySigned = signedIds.has(user!.id);

  return NextResponse.json({
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    periodMonth: row.period_month ?? null,
    periodYear: row.period_year ?? null,
    payerName: row.payer_name,
    payeeName: row.payee_name,
    sourceAmount: row.source_amount,
    sourceProofPath: row.source_proof_path ?? null,
    percentage: Number(row.percentage),
    payoutAmount: row.payout_amount,
    payoutProofPath: row.payout_proof_path ?? null,
    paid: row.paid ?? false,
    notes: row.notes ?? null,
    requiredSigners,
    signatures,
    allSigned: requiredSigners.length > 0 && requiredSigners.every((r) => signedIds.has(r.userId)),
    // Si no se eligió a nadie en particular, cae al criterio general
    // (cualquiera que vea Finanzas puede firmar) -- mismo fallback que el
    // endpoint de firma.
    canSign: (row.required_signer_ids?.length ? isRequiredSigner : canViewModule(perm, "finanzas")) && !alreadySigned,
  });
}

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

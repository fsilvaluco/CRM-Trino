import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { logActivity } from "@/lib/activity-logs";
import { getProjectPermissions, canEditModule, canDeleteModule, canViewModule } from "@/lib/project-roles";
import { createAdminClient } from "@/lib/supabase-admin";
import { approvalExternalSigners, maskEmail, OTP_MAX_ATTEMPTS } from "@/lib/external-signature";
import { buildSettlementDocument, settlementDocumentHash, SETTLEMENT_DOCUMENT_COLUMNS } from "@/lib/settlement-document";
import { getSettlementApproval } from "@/lib/settlement-signatures";
import { isSettlementCurrency } from "@/lib/settlement-money";

// GET /api/settlements/[id] -- detalle de una liquidación para su pantalla
// de firma: el documento tal cual se firma, el recuadro de Aprobación
// (equipo + contraparte externa) y lo que necesita el formulario de firma
// con código (migración 109).
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

  const admin = createAdminClient();
  const [doc, approval, { data: sigRows }, { data: me }, { data: otpRow }] = await Promise.all([
    buildSettlementDocument(admin, id),
    getSettlementApproval(admin, id),
    supabase
      .from("settlement_signatures")
      .select(
        "user_id, signed_at, ip_address, signer_name, signer_rut, signer_email, signer_phone, otp_verified_at, document_hash, profiles ( full_name, email )"
      )
      .eq("settlement_id", id),
    supabase.from("profiles").select("full_name, email, phone, rut").eq("id", user!.id).single(),
    admin
      .from("settlement_signature_otps")
      .select("sent_to, sent_at, expires_at, attempts")
      .eq("settlement_id", id)
      .eq("user_id", user!.id)
      .maybeSingle(),
  ]);

  const currentHash = doc ? settlementDocumentHash(doc) : null;
  const signatures = ((sigRows ?? []) as unknown as {
    user_id: string;
    signed_at: string;
    ip_address: string | null;
    signer_name: string | null;
    signer_rut: string | null;
    signer_email: string | null;
    signer_phone: string | null;
    otp_verified_at: string | null;
    document_hash: string | null;
    profiles: { full_name: string | null; email: string | null } | null;
  }[]).map((s) => ({
    userId: s.user_id,
    signedAt: s.signed_at,
    ipAddress: s.ip_address ?? null,
    name: s.profiles?.full_name ?? s.profiles?.email ?? null,
    signerName: s.signer_name ?? null,
    signerRut: s.signer_rut ?? null,
    signerEmail: s.signer_email ?? null,
    signerPhone: s.signer_phone ?? null,
    otpVerifiedAt: s.otp_verified_at ?? null,
    documentHash: s.document_hash ?? null,
    documentUnchanged: s.document_hash ? s.document_hash === currentHash : null,
  }));

  const required: string[] = row.required_signer_ids ?? [];
  const alreadySigned = signatures.some((s) => s.userId === user!.id);
  const otpPending = otpRow && new Date(otpRow.expires_at).getTime() > Date.now() ? otpRow : null;

  return NextResponse.json({
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    currency: row.currency ?? "CLP",
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
    document: doc,
    documentHash: currentHash,
    requiredSigners: approval.team.filter((t) => required.includes(t.userId)).map((t) => ({ userId: t.userId, name: t.name })),
    approval: {
      team: approval.team.map((t) => ({ name: t.name, detail: t.email, signedAt: t.signedAt })),
      external: approvalExternalSigners(approval.externalRows).map((e) => ({
        name: e.name,
        detail: e.roleLabel,
        signedAt: e.signedAt,
      })),
    },
    signatures,
    allSigned: approval.allSigned,
    alreadySigned,
    // Si no se eligió a nadie en particular, cae al criterio general
    // (cualquiera que vea Finanzas puede firmar) -- mismo fallback que el
    // endpoint de firma.
    canSign: (required.length ? required.includes(user!.id) : true) && !alreadySigned,
    canManageSigners: canEditModule(perm, "finanzas"),
    me: {
      fullName: me?.full_name ?? null,
      rut: me?.rut ?? null,
      email: me?.email ?? user!.email ?? null,
      phone: me?.phone ?? null,
      accountEmailMasked: user!.email ? maskEmail(user!.email) : null,
    },
    otp: otpPending
      ? {
          sentToMasked: maskEmail(otpPending.sent_to),
          sentAt: otpPending.sent_at,
          expiresAt: otpPending.expires_at,
          attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - (otpPending.attempts ?? 0)),
        }
      : null,
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
  if (body.currency !== undefined) {
    if (!isSettlementCurrency(body.currency)) {
      return NextResponse.json({ error: "Moneda no soportada (CLP o USD)" }, { status: 400 });
    }
    updates.currency = body.currency;
  }
  if (typeof body.paid === "boolean") {
    updates.paid = body.paid;
    updates.paid_at = body.paid ? new Date().toISOString() : null;
  }

  // ¿Cambia algo de lo que se firmó? (migración 109). Los comprobantes y el
  // "pagado" no: se pueden agregar después de las firmas sin tocarlas.
  // Montos, partes, %, moneda, periodo o notas sí: las firmas existentes
  // aprobaban otra cosa. Se pide confirmación explícita y, con ella, las
  // firmas del equipo se borran (hay que volver a firmar) y las de la
  // contraparte quedan invalidadas -- se conservan con toda su evidencia,
  // como cuando se reabre un cierre de caja (migración 103).
  const admin = createAdminClient();
  const { data: current } = await admin
    .from("settlements")
    .select(SETTLEMENT_DOCUMENT_COLUMNS.join(", "))
    .eq("id", id)
    .single();
  const currentRow = (current ?? {}) as Record<string, unknown>;
  // "20" y "20.00" (numeric de Postgres) son lo mismo; null y "" también.
  const same = (a: unknown, b: unknown) => {
    const na = a === null || a === undefined || a === "" ? null : a;
    const nb = b === null || b === undefined || b === "" ? null : b;
    if (na === null || nb === null) return na === nb;
    if (!Number.isNaN(Number(na)) && !Number.isNaN(Number(nb))) return Number(na) === Number(nb);
    return String(na) === String(nb);
  };
  const touchesDocument = SETTLEMENT_DOCUMENT_COLUMNS.some((col) => col in updates && !same(updates[col], currentRow[col]));

  if (touchesDocument) {
    const [{ count: internalCount }, { data: extSigned }] = await Promise.all([
      admin.from("settlement_signatures").select("user_id", { count: "exact", head: true }).eq("settlement_id", id),
      admin
        .from("event_external_signers")
        .select("id")
        .eq("settlement_id", id)
        .not("signed_at", "is", null)
        .is("invalidated_at", null),
    ]);
    const externalCount = (extSigned ?? []).length;
    if ((internalCount ?? 0) + externalCount > 0) {
      if (body.confirmResetSignatures !== true) {
        return NextResponse.json(
          {
            error: "Esta liquidación ya tiene firmas. Si cambias montos, partes o condiciones, hay que volver a firmarla.",
            needsConfirmation: true,
            internalCount: internalCount ?? 0,
            externalCount,
          },
          { status: 409 }
        );
      }
    }
  }

  // Primera pasada, ANTES de tocar la liquidación: si no se pueden anular
  // las firmas, no se cambia nada -- nunca quedan firmas vigentes sobre
  // cifras que ya no son las de la liquidación.
  if (touchesDocument) {
    const err = await resetSettlementSignatures(admin, id);
    if (err) {
      console.error("[settlements:PUT] no se pudieron anular las firmas", err);
      return NextResponse.json({ error: "No se pudieron anular las firmas anteriores. No se guardó el cambio." }, { status: 500 });
    }
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

  // Después del UPDATE se repite la anulación: una firma que entró entre el
  // conteo y el UPDATE aprobaba las cifras viejas y tampoco puede quedar
  // vigente. La primera pasada (antes del UPDATE) es la que bloquea si falla.
  if (touchesDocument) {
    const err = await resetSettlementSignatures(admin, id);
    if (err) console.error("[settlements:PUT] segunda pasada de anulación falló", err);
  }

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

/** Borra las firmas del equipo y los códigos en vuelo, e invalida las firmas
 * de la contraparte (se conservan con su evidencia). Devuelve el primer
 * error, si hubo. */
async function resetSettlementSignatures(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  id: string
): Promise<unknown> {
  const [{ error: delErr }, { error: invErr }, { error: otpErr }] = await Promise.all([
    admin.from("settlement_signatures").delete().eq("settlement_id", id),
    admin
      .from("event_external_signers")
      .update({ invalidated_at: new Date().toISOString(), invalidated_reason: "Se corrigió la liquidación después de esta firma" })
      .eq("settlement_id", id)
      .not("signed_at", "is", null)
      .is("invalidated_at", null),
    admin.from("settlement_signature_otps").delete().eq("settlement_id", id),
  ]);
  return delErr ?? invErr ?? otpErr ?? null;
}

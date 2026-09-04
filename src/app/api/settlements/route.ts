import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { logActivity } from "@/lib/activity-logs";
import {
  getProjectPermissions,
  getProjectPermissionsForMany,
  canViewModule,
  canEditModule,
} from "@/lib/project-roles";
import { sendEmail, buildSettlementPendingSignatureEmailHtml, isResendEnabled } from "@/lib/resend";

function siteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}${path}`;
}

const SETTLEMENT_TYPES = ["regalias", "merch", "otro"] as const;
type SettlementType = (typeof SETTLEMENT_TYPES)[number];

function mapSettlement(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any,
  signatures: { userId: string; signedAt: string; ipAddress: string | null; name: string | null }[],
  requiredSigners: { userId: string; name: string | null }[] = []
) {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type as SettlementType,
    periodMonth: row.period_month ?? null,
    periodYear: row.period_year ?? null,
    payerName: row.payer_name,
    payeeName: row.payee_name,
    sourceAmount: row.source_amount,
    // Paths crudos del bucket privado "finances" -- el cliente los resuelve
    // a URL firmada al vuelo con SignedFileLink/getFinanceSignedUrl, igual
    // que el resto de Finanzas (nunca se firma del lado del servidor acá).
    sourceProofPath: row.source_proof_path ?? null,
    sourceProofName: row.source_proof_name ?? null,
    percentage: Number(row.percentage),
    payoutAmount: row.payout_amount,
    payoutProofPath: row.payout_proof_path ?? null,
    payoutProofName: row.payout_proof_name ?? null,
    paid: row.paid ?? false,
    paidAt: row.paid_at ?? null,
    notes: row.notes ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    requiredSignerIds: row.required_signer_ids ?? [],
    requiredSigners,
    signatures,
  };
}

// GET /api/settlements?projectId=xxx -- liquidaciones de regalías/merch/etc,
// pagos recurrentes entre partes que NO están atados a un evento (a
// diferencia de shows.profit_split_*, que es el reparto de UN evento).
export async function GET(request: NextRequest) {
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (projectId && !allowedProjectIds.includes(projectId)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }
  if (!projectId && allowedProjectIds.length === 0) {
    return NextResponse.json([]);
  }

  let query = supabase
    .from("settlements")
    .select("*")
    .eq("organization_id", orgId!)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  query = projectId ? query.eq("project_id", projectId) : query.in("project_id", allowedProjectIds);

  const { data, error: dbError } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  const allRows = data ?? [];
  const permsByProject = await getProjectPermissionsForMany(supabase, user!.id, allRows.map((r) => r.project_id));
  const rows = allRows.filter((r) => canViewModule(permsByProject.get(r.project_id) ?? null, "finanzas"));

  // Firmas de todas las liquidaciones visibles, de una vez (evita N+1).
  const ids = rows.map((r) => r.id);
  const signaturesBySettlement = new Map<string, { userId: string; signedAt: string; ipAddress: string | null; name: string | null }[]>();
  if (ids.length > 0) {
    const { data: sigRows } = await supabase
      .from("settlement_signatures")
      .select("settlement_id, user_id, signed_at, ip_address, profiles ( full_name, email )")
      .in("settlement_id", ids);
    for (const s of (sigRows ?? []) as unknown as {
      settlement_id: string;
      user_id: string;
      signed_at: string;
      ip_address: string | null;
      profiles: { full_name: string | null; email: string | null } | null;
    }[]) {
      const list = signaturesBySettlement.get(s.settlement_id) ?? [];
      list.push({
        userId: s.user_id,
        signedAt: s.signed_at,
        ipAddress: s.ip_address ?? null,
        name: s.profiles?.full_name ?? s.profiles?.email ?? null,
      });
      signaturesBySettlement.set(s.settlement_id, list);
    }
  }

  // Nombres de los firmantes elegidos a mano (todas las filas de una vez).
  const allSignerIds = Array.from(new Set(rows.flatMap((r) => (r.required_signer_ids ?? []) as string[])));
  const profileById = new Map<string, { full_name: string | null; email: string | null }>();
  if (allSignerIds.length > 0) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", allSignerIds);
    for (const p of (profileRows ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
      profileById.set(p.id, p);
    }
  }

  return NextResponse.json(
    rows.map((row) => {
      const requiredSigners = ((row.required_signer_ids ?? []) as string[]).map((userId) => ({
        userId,
        name: profileById.get(userId)?.full_name ?? profileById.get(userId)?.email ?? "Alguien",
      }));
      return mapSettlement(row, signaturesBySettlement.get(row.id) ?? [], requiredSigners);
    })
  );
}

// POST /api/settlements -- crea una liquidación
export async function POST(request: NextRequest) {
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const {
    projectId,
    type,
    periodMonth,
    periodYear,
    payerName,
    payeeName,
    sourceAmount,
    sourceProofPath,
    sourceProofName,
    percentage,
    payoutAmount,
    payoutProofPath,
    payoutProofName,
    notes,
    requiredSignerIds,
  } = body as {
    projectId?: string;
    type?: string;
    periodMonth?: number | null;
    periodYear?: number | null;
    payerName?: string;
    payeeName?: string;
    sourceAmount?: number;
    sourceProofPath?: string | null;
    sourceProofName?: string | null;
    percentage?: number;
    payoutAmount?: number;
    payoutProofPath?: string | null;
    payoutProofName?: string | null;
    notes?: string | null;
    requiredSignerIds?: string[];
  };

  if (!projectId || !allowedProjectIds.includes(projectId)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }
  if (!type || !SETTLEMENT_TYPES.includes(type as SettlementType)) {
    return NextResponse.json({ error: `type debe ser uno de: ${SETTLEMENT_TYPES.join(", ")}` }, { status: 400 });
  }
  if (!payerName?.trim() || !payeeName?.trim()) {
    return NextResponse.json({ error: "payerName y payeeName son requeridos" }, { status: 400 });
  }

  const perm = await getProjectPermissions(supabase, user!.id, projectId);
  if (!canEditModule(perm, "finanzas")) {
    return NextResponse.json({ error: "Tu rol no puede crear liquidaciones en este proyecto" }, { status: 403 });
  }

  // Solo se puede elegir como firmante a alguien que de verdad tiene
  // acceso a este proyecto -- nunca un userId arbitrario que mande el
  // cliente.
  let validSignerIds: string[] = [];
  if (requiredSignerIds?.length) {
    const { data: memberRows } = await supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", projectId)
      .in("user_id", requiredSignerIds);
    validSignerIds = (memberRows ?? []).map((m: { user_id: string }) => m.user_id);
  }

  const { data, error: dbError } = await supabase
    .from("settlements")
    .insert({
      organization_id: orgId,
      project_id: projectId,
      type,
      period_month: periodMonth ?? null,
      period_year: periodYear ?? null,
      payer_name: payerName.trim(),
      payee_name: payeeName.trim(),
      source_amount: Math.round(Number(sourceAmount) || 0),
      source_proof_path: sourceProofPath ?? null,
      source_proof_name: sourceProofName ?? null,
      percentage: Number(percentage) || 0,
      payout_amount: Math.round(Number(payoutAmount) || 0),
      payout_proof_path: payoutProofPath ?? null,
      payout_proof_name: payoutProofName ?? null,
      notes: notes ?? null,
      created_by: user!.id,
      required_signer_ids: validSignerIds,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  await logActivity({
    supabase,
    userId: user!.id,
    userEmail: user!.email,
    action: "create",
    entityType: "settlement",
    entityId: data.id,
    entityName: `${data.type === "regalias" ? "Regalías" : data.type === "merch" ? "Merch" : "Liquidación"} ${data.payer_name} → ${data.payee_name}`,
    projectId: data.project_id,
  });

  // Fire-and-forget: avisar por correo a cada firmante elegido, con link
  // directo a la pantalla de firma. No bloquea la respuesta ni falla la
  // creación si el correo no está configurado o algún envío falla.
  if (validSignerIds.length > 0 && isResendEnabled()) {
    const { data: signerProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", validSignerIds);
    const signUrl = siteUrl(`/finances/comprobantes/${data.id}/firmar`);
    for (const p of (signerProfiles ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
      if (!p.email) continue;
      const html = buildSettlementPendingSignatureEmailHtml({
        signerName: p.full_name,
        type: data.type,
        payerName: data.payer_name,
        payeeName: data.payee_name,
        sourceAmount: data.source_amount,
        payoutAmount: data.payout_amount,
        percentage: Number(data.percentage),
        signUrl,
      });
      sendEmail({ to: p.email, subject: `Nueva liquidación pendiente de firmar -- ${data.payer_name} → ${data.payee_name}`, html }).catch(
        (err) => console.error("[settlements] fallo enviando aviso de firma a", p.email, err)
      );
    }
  }

  return NextResponse.json(mapSettlement(data, []), { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { dbErrorResponse } from "@/lib/api-errors";
import { logActivity } from "@/lib/activity-logs";
import { generateLinkToken } from "@/lib/external-signature";
import { encryptLinkToken } from "@/lib/link-token-crypto";
import { mapExternalSigner, EXTERNAL_SIGNER_SELECT } from "@/lib/external-signer-map";
import { loadSettlementForTeam, siteUrl, settlementPeriodLabel } from "@/lib/settlement-access";
import { sendEmail, isResendEnabled, buildSettlementExternalInviteEmailHtml } from "@/lib/resend";
import { formatSettlementAmount, isSettlementCurrency } from "@/lib/settlement-money";

const DEFAULT_EXPIRY_DAYS = 30;
const MAX_EXPIRY_DAYS = 180;

// GET /api/settlements/[id]/external-signers -- links de firma emitidos para
// la contraparte externa de esta liquidación (migración 109). Igual que en
// eventos: el token en claro nunca sale de acá, solo en el POST que lo crea.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadSettlementForTeam(id, "ver");
  if (ctx.error) return ctx.error;

  const { data, error: dbError } = await ctx.supabase
    .from("event_external_signers")
    .select(EXTERNAL_SIGNER_SELECT)
    .eq("settlement_id", id)
    .order("created_at", { ascending: true });

  if (dbError) return dbErrorResponse("settlement-external-signers:GET", dbError);

  return NextResponse.json({ canCreate: ctx.canEdit, signers: (data ?? []).map(mapExternalSigner) });
}

// POST /api/settlements/[id]/external-signers -- emite un link de firma para
// alguien sin cuenta (ej. la artista a la que se le liquidan sus
// regalías). Si viene el correo, el link sale por correo y el código de
// verificación solo puede ir a esa casilla.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadSettlementForTeam(id, "editar");
  if (ctx.error) return ctx.error;

  const body = await request.json().catch(() => ({}));
  const roleLabel = typeof body.roleLabel === "string" ? body.roleLabel.trim() : "";
  const invitedName = typeof body.invitedName === "string" ? body.invitedName.trim() : "";
  const invitedEmail = typeof body.invitedEmail === "string" ? body.invitedEmail.trim().toLowerCase() : "";
  const rawDays = Number(body.expiresInDays);
  const expiresInDays =
    Number.isFinite(rawDays) && rawDays >= 1 ? Math.min(Math.floor(rawDays), MAX_EXPIRY_DAYS) : DEFAULT_EXPIRY_DAYS;

  if (invitedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitedEmail)) {
    return NextResponse.json({ error: "El correo no tiene un formato válido" }, { status: 400 });
  }

  const { token, tokenHash } = generateLinkToken();
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error: insertError } = await ctx.supabase
    .from("event_external_signers")
    .insert({
      settlement_id: id,
      role_label: roleLabel || null,
      invited_name: invitedName || null,
      invited_email: invitedEmail || null,
      token_hash: tokenHash,
      token_encrypted: encryptLinkToken(token),
      expires_at: expiresAt,
      created_by: ctx.user.id,
    })
    .select(EXTERNAL_SIGNER_SELECT)
    .single();

  if (insertError) return dbErrorResponse("settlement-external-signers:POST", insertError);

  const s = ctx.settlement;
  let emailSent = false;
  if (invitedEmail && isResendEnabled()) {
    try {
      const { data: me } = await ctx.supabase.from("profiles").select("full_name, email").eq("id", ctx.user.id).single();
      await sendEmail({
        to: invitedEmail,
        subject: `Necesitamos tu firma -- liquidación ${s.payer_name} → ${s.payee_name}`,
        html: buildSettlementExternalInviteEmailHtml({
          invitedName: invitedName || null,
          roleLabel: roleLabel || null,
          title: `${s.payer_name} → ${s.payee_name}`,
          periodLabel: settlementPeriodLabel(s.period_month, s.period_year),
          payoutLabel: formatSettlementAmount(s.payout_amount, isSettlementCurrency(s.currency) ? s.currency : "CLP"),
          senderName: me?.full_name || me?.email || null,
          signUrl: siteUrl(`/firmar/${token}`),
          expiresAt,
        }),
      });
      emailSent = true;
    } catch (err) {
      console.error("[settlement-external-signers:POST] fallo enviando la invitación", err);
    }
  }

  void logActivity({
    supabase: ctx.supabase,
    userId: ctx.user.id,
    action: "create",
    entityType: "settlement_external_signer",
    entityId: data.id,
    entityName: `Link de firma externa -- ${s.payer_name} → ${s.payee_name}`,
    projectId: s.project_id,
  });

  return NextResponse.json({ ...mapExternalSigner(data), url: siteUrl(`/firmar/${token}`), emailSent }, { status: 201 });
}

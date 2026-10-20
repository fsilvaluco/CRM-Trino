import { NextRequest, NextResponse } from "next/server";
import { dbErrorResponse } from "@/lib/api-errors";
import { generateLinkToken } from "@/lib/external-signature";
import { encryptLinkToken } from "@/lib/link-token-crypto";
import { loadSettlementForTeam, siteUrl, settlementPeriodLabel } from "@/lib/settlement-access";
import { sendEmail, isResendEnabled, buildSettlementExternalInviteEmailHtml } from "@/lib/resend";
import { formatSettlementAmount, isSettlementCurrency } from "@/lib/settlement-money";

// POST /api/settlements/[id]/external-signers/[signerId]/reenviar -- igual
// que en eventos: no hay token en claro que reenviar, así que se emite uno
// nuevo con los mismos datos, se manda por correo y recién ahí se anula el
// anterior. También sirve para pedir la firma de nuevo cuando la anterior
// quedó invalidada porque se corrigió la liquidación.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; signerId: string }> }
) {
  const { id, signerId } = await params;
  const ctx = await loadSettlementForTeam(id, "editar");
  if (ctx.error) return ctx.error;

  const { data: old } = await ctx.supabase
    .from("event_external_signers")
    .select("id, role_label, invited_name, invited_email, expires_at, signed_at, revoked_at, invalidated_at")
    .eq("id", signerId)
    .eq("settlement_id", id)
    .maybeSingle();

  if (!old) return NextResponse.json({ error: "Link no encontrado" }, { status: 404 });
  if (old.signed_at && !old.invalidated_at) {
    return NextResponse.json({ error: "Ese link ya se firmó -- no hay nada que reenviar" }, { status: 409 });
  }
  if (!old.invited_email) {
    return NextResponse.json(
      { error: "Ese link no tiene un correo cargado. Anúlalo y crea uno nuevo con el correo." },
      { status: 400 }
    );
  }
  if (!isResendEnabled()) {
    return NextResponse.json({ error: "Envío de correos no configurado (falta RESEND_API_KEY)" }, { status: 503 });
  }

  const vigente = new Date(old.expires_at).getTime() > Date.now() && !old.signed_at;
  const expiresAt = vigente ? old.expires_at : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { token, tokenHash } = generateLinkToken();

  const { data: created, error: insertError } = await ctx.supabase
    .from("event_external_signers")
    .insert({
      settlement_id: id,
      role_label: old.role_label,
      invited_name: old.invited_name,
      invited_email: old.invited_email,
      token_hash: tokenHash,
      token_encrypted: encryptLinkToken(token),
      expires_at: expiresAt,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (insertError) return dbErrorResponse("settlement-external-signers:reenviar", insertError);

  const s = ctx.settlement;
  const { data: me } = await ctx.supabase.from("profiles").select("full_name, email").eq("id", ctx.user.id).single();

  try {
    await sendEmail({
      to: old.invited_email,
      subject: `Necesitamos tu firma -- liquidación ${s.payer_name} → ${s.payee_name}`,
      html: buildSettlementExternalInviteEmailHtml({
        invitedName: old.invited_name,
        roleLabel: old.role_label,
        title: `${s.payer_name} → ${s.payee_name}`,
        periodLabel: settlementPeriodLabel(s.period_month, s.period_year),
        payoutLabel: formatSettlementAmount(s.payout_amount, isSettlementCurrency(s.currency) ? s.currency : "CLP"),
        senderName: me?.full_name || me?.email || null,
        signUrl: siteUrl(`/firmar/${token}`),
        expiresAt,
      }),
    });
  } catch (err) {
    console.error("[settlement-external-signers:reenviar] fallo enviando", err);
    await ctx.supabase.from("event_external_signers").delete().eq("id", created.id);
    return NextResponse.json({ error: "No se pudo enviar el correo. El link anterior sigue vigente." }, { status: 502 });
  }

  if (!old.revoked_at && !old.signed_at) {
    await ctx.supabase
      .from("event_external_signers")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", old.id);
  }

  return NextResponse.json({ ok: true, sentTo: old.invited_email });
}

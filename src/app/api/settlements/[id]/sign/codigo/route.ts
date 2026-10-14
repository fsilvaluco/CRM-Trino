import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { dbErrorResponse } from "@/lib/api-errors";
import { loadSettlementForTeam } from "@/lib/settlement-access";
import { settlementOtpSalt } from "@/lib/settlement-signatures";
import { sendEmail, isResendEnabled, buildExternalSignatureOtpEmailHtml } from "@/lib/resend";
import {
  generateOtp,
  hashOtp,
  normalizeRut,
  maskEmail,
  OTP_TTL_MINUTES,
  OTP_RESEND_COOLDOWN_SECONDS,
} from "@/lib/external-signature";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/settlements/[id]/sign/codigo -- manda el código de 6 dígitos para
// que alguien del EQUIPO firme la liquidación (migración 109). Iguala la
// firma interna a la de eventos (migración 102): antes era un click.
//
// El código va SIEMPRE al correo de la cuenta: esa es la identidad
// verificada. El correo que se declare en el formulario queda como dato de
// contacto.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadSettlementForTeam(id, "ver");
  if (ctx.error) return ctx.error;

  const required = ctx.settlement.required_signer_ids ?? [];
  if (required.length > 0 && !required.includes(ctx.user.id)) {
    return NextResponse.json({ error: "No estás en la lista de firmantes de esta liquidación" }, { status: 403 });
  }

  const { data: already } = await ctx.supabase
    .from("settlement_signatures")
    .select("user_id")
    .eq("settlement_id", id)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (already) return NextResponse.json({ error: "Ya habías firmado esta liquidación" }, { status: 409 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const rut = typeof body.rut === "string" ? normalizeRut(body.rut) : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const saveToProfile = body.saveToProfile === true;

  if (name.length < 3) return NextResponse.json({ error: "Escribe tu nombre completo" }, { status: 400 });
  if (rut.length < 6) return NextResponse.json({ error: "Escribe tu RUT o número de identificación" }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "El correo no tiene un formato válido" }, { status: 400 });
  if (phone.replace(/\D/g, "").length < 8) {
    return NextResponse.json({ error: "Escribe un teléfono válido" }, { status: 400 });
  }

  const accountEmail = ctx.user.email;
  if (!accountEmail) return NextResponse.json({ error: "Tu cuenta no tiene un correo asociado" }, { status: 400 });

  const admin = createAdminClient();
  const { data: pending } = await admin
    .from("settlement_signature_otps")
    .select("sent_at")
    .eq("settlement_id", id)
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  if (pending?.sent_at) {
    const elapsed = (Date.now() - new Date(pending.sent_at).getTime()) / 1000;
    if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
      return NextResponse.json(
        { error: `Espera ${Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed)} segundos antes de pedir otro código` },
        { status: 429 }
      );
    }
  }

  if (!isResendEnabled()) {
    return NextResponse.json(
      { error: "El envío de correos no está configurado (falta RESEND_API_KEY) -- sin eso no se puede firmar." },
      { status: 503 }
    );
  }

  const code = generateOtp();
  const { error: upsertError } = await admin.from("settlement_signature_otps").upsert(
    {
      settlement_id: id,
      user_id: ctx.user.id,
      otp_hash: hashOtp(settlementOtpSalt(id, ctx.user.id), code),
      sent_to: accountEmail,
      sent_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString(),
      attempts: 0,
      signer_name: name,
      signer_rut: rut,
      signer_email: email,
      signer_phone: phone,
      save_to_profile: saveToProfile,
    },
    { onConflict: "settlement_id,user_id" }
  );
  if (upsertError) return dbErrorResponse("settlement-signatures:codigo", upsertError);

  const s = ctx.settlement;
  try {
    await sendEmail({
      to: accountEmail,
      subject: `Tu código para firmar -- liquidación ${s.payer_name} → ${s.payee_name}`,
      html: buildExternalSignatureOtpEmailHtml({
        code,
        eventName: `${s.payer_name} → ${s.payee_name}`,
        documentLabel: "la liquidación",
        signerName: name.split(" ")[0] || name,
        minutes: OTP_TTL_MINUTES,
      }),
    });
  } catch (err) {
    console.error("[settlement-signatures:codigo] fallo enviando el código", err);
    return NextResponse.json({ error: "No se pudo enviar el correo. Intenta de nuevo en un momento." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, sentToMasked: maskEmail(accountEmail), expiresInMinutes: OTP_TTL_MINUTES });
}

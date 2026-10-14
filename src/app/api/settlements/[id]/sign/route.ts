import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getClientIp } from "@/lib/client-ip";
import { dbErrorResponse } from "@/lib/api-errors";
import { otpMatches, OTP_MAX_ATTEMPTS } from "@/lib/external-signature";
import { loadSettlementForTeam } from "@/lib/settlement-access";
import { buildSettlementDocument, settlementDocumentHash } from "@/lib/settlement-document";
import { settlementOtpSalt } from "@/lib/settlement-signatures";

// POST /api/settlements/[id]/sign -- firma de alguien del EQUIPO.
//
// Desde la migración 109 es firma electrónica simple, igual que el cierre
// de caja de un evento (migración 102): primero se pide un código a
// /sign/codigo (que llega al correo de la cuenta) y acá se firma con ese
// código. Queda guardada la misma evidencia que en la firma externa: datos
// declarados, IP, dispositivo, huella y el documento completo tal cual
// estaba al firmar. Antes de esto firmar era un click.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadSettlementForTeam(id, "ver");
  if (ctx.error) return ctx.error;

  const required = ctx.settlement.required_signer_ids ?? [];
  if (required.length > 0 && !required.includes(ctx.user.id)) {
    return NextResponse.json({ error: "No estás en la lista de firmantes de esta liquidación" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";

  const admin = createAdminClient();
  const { data: otp } = await admin
    .from("settlement_signature_otps")
    .select("otp_hash, expires_at, attempts, signer_name, signer_rut, signer_email, signer_phone, save_to_profile")
    .eq("settlement_id", id)
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  if (!otp) return NextResponse.json({ error: "Primero pide el código de verificación" }, { status: 400 });
  if (new Date(otp.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "El código venció. Pide uno nuevo." }, { status: 410 });
  }
  const attempts = otp.attempts ?? 0;
  if (attempts >= OTP_MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Demasiados intentos con ese código. Pide uno nuevo." }, { status: 429 });
  }
  const salt = settlementOtpSalt(id, ctx.user.id);
  if (!otpMatches(salt, code, otp.otp_hash)) {
    await admin
      .from("settlement_signature_otps")
      .update({ attempts: attempts + 1 })
      .eq("settlement_id", id)
      .eq("user_id", ctx.user.id);
    const left = OTP_MAX_ATTEMPTS - (attempts + 1);
    return NextResponse.json(
      {
        error:
          left > 0
            ? `Código incorrecto. Te quedan ${left} ${left === 1 ? "intento" : "intentos"}.`
            : "Código incorrecto. Pide uno nuevo.",
        attemptsLeft: Math.max(0, left),
      },
      { status: 400 }
    );
  }

  const doc = await buildSettlementDocument(admin, id);
  if (!doc) return NextResponse.json({ error: "Liquidación no encontrada" }, { status: 404 });
  const signedAt = new Date().toISOString();

  const { error: insertError } = await ctx.supabase.from("settlement_signatures").insert({
    settlement_id: id,
    user_id: ctx.user.id,
    signed_at: signedAt,
    ip_address: getClientIp(request),
    user_agent: request.headers.get("user-agent"),
    otp_verified_at: signedAt,
    signer_name: otp.signer_name,
    signer_rut: otp.signer_rut,
    signer_email: otp.signer_email,
    signer_phone: otp.signer_phone,
    document_hash: settlementDocumentHash(doc),
    document_snapshot: doc,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "Ya habías firmado esta liquidación" }, { status: 409 });
    }
    return dbErrorResponse("settlement-signatures:POST", insertError);
  }

  // El código se quema al usarlo.
  await admin.from("settlement_signature_otps").delete().eq("settlement_id", id).eq("user_id", ctx.user.id);

  if (otp.save_to_profile) {
    await ctx.supabase.from("profiles").update({ rut: otp.signer_rut, phone: otp.signer_phone }).eq("id", ctx.user.id);
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

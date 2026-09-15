import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendEmail, isResendEnabled, buildExternalSignatureOtpEmailHtml } from "@/lib/resend";
import { dbErrorResponse } from "@/lib/api-errors";
import {
  hashToken,
  externalSignerStatus,
  generateOtp,
  hashOtp,
  normalizeRut,
  maskEmail,
  OTP_TTL_MINUTES,
  OTP_RESEND_COOLDOWN_SECONDS,
} from "@/lib/external-signature";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/public/firma/[token]/codigo -- el firmante externo declara
// quién es (nombre, RUT, correo, teléfono) y se le manda un código de 6
// dígitos a su correo. Ese código es la prueba de identidad: demuestra que
// quien firma controla la casilla que declaró.
//
// Los datos declarados se guardan ACÁ, junto con el código -- al firmar
// solo se manda el código, nunca los datos de nuevo. Así es imposible pedir
// el código con un correo y terminar firmando con otro: cambiar cualquier
// dato obliga a pedir un código nuevo, que se manda al correo nuevo.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const tokenHash = hashToken(token);

  const { data: signer } = await admin
    .from("event_external_signers")
    .select("id, show_id, invited_email, invited_name, expires_at, revoked_at, signed_at, otp_sent_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!signer) {
    return NextResponse.json({ error: "Este link no existe o ya fue anulado" }, { status: 404 });
  }

  const status = externalSignerStatus(signer);
  if (status === "firmado") return NextResponse.json({ error: "Este documento ya está firmado" }, { status: 409 });
  if (status === "revocado") return NextResponse.json({ error: "Este link fue anulado" }, { status: 410 });
  if (status === "vencido") return NextResponse.json({ error: "Este link venció. Pide uno nuevo." }, { status: 410 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const rut = typeof body.rut === "string" ? normalizeRut(body.rut) : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";

  if (name.length < 3) return NextResponse.json({ error: "Escribe tu nombre completo" }, { status: 400 });
  if (rut.length < 6) return NextResponse.json({ error: "Escribe tu RUT o número de identificación" }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "El correo no tiene un formato válido" }, { status: 400 });
  if (phone.replace(/\D/g, "").length < 8) {
    return NextResponse.json({ error: "Escribe un teléfono válido (con código de país si es de afuera)" }, { status: 400 });
  }

  // Si el equipo dejó fijado a quién va dirigido el link, el código solo
  // puede ir a esa casilla -- si no, cualquiera con el link podría mandarse
  // el código a sí mismo y firmar haciéndose pasar por el cliente.
  if (signer.invited_email && signer.invited_email.toLowerCase() !== email) {
    return NextResponse.json(
      { error: `Este link está dirigido a ${maskEmail(signer.invited_email)} -- el código solo se manda a ese correo.` },
      { status: 403 }
    );
  }

  if (signer.otp_sent_at) {
    const elapsed = (Date.now() - new Date(signer.otp_sent_at).getTime()) / 1000;
    if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
      return NextResponse.json(
        { error: `Espera ${Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed)} segundos antes de pedir otro código` },
        { status: 429 }
      );
    }
  }

  if (!isResendEnabled()) {
    return NextResponse.json(
      { error: "El envío de correos no está configurado. Avísale al equipo para que te manden el link de otra forma." },
      { status: 503 }
    );
  }

  const { data: show } = await admin.from("shows").select("name").eq("id", signer.show_id).single();

  const code = generateOtp();
  const nowIso = new Date().toISOString();

  const { error: updateError } = await admin
    .from("event_external_signers")
    .update({
      signer_name: name,
      signer_rut: rut,
      signer_email: email,
      signer_phone: phone,
      otp_hash: hashOtp(tokenHash, code),
      otp_sent_to: email,
      otp_sent_at: nowIso,
      otp_expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString(),
      // Cada código nuevo reinicia los intentos -- el límite es por código,
      // no un contador que deja el link inservible para siempre.
      otp_attempts: 0,
    })
    .eq("id", signer.id);

  if (updateError) return dbErrorResponse("firma-externa:codigo", updateError);

  try {
    await sendEmail({
      to: email,
      subject: `Tu código para firmar -- ${show?.name ?? "cierre de caja"}`,
      html: buildExternalSignatureOtpEmailHtml({
        code,
        eventName: show?.name ?? "el evento",
        signerName: name.split(" ")[0] || name,
        minutes: OTP_TTL_MINUTES,
      }),
    });
  } catch (err) {
    console.error("[firma-externa:codigo] fallo enviando el código", err);
    return NextResponse.json({ error: "No se pudo enviar el correo. Intenta de nuevo en un momento." }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    sentToMasked: maskEmail(email),
    expiresInMinutes: OTP_TTL_MINUTES,
  });
}

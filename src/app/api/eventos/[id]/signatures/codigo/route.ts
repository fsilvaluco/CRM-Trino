import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getRequiredSigners } from "@/lib/event-signatures";
import { dbErrorResponse } from "@/lib/api-errors";
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

// POST /api/eventos/[id]/signatures/codigo -- manda el código de 6 dígitos
// para que un firmante INTERNO apruebe el cierre (migración 102). Mismo
// mecanismo que la firma del cliente externo: hasta ahora firmar por dentro
// era un click, lo que prueba que había una sesión abierta, no que la
// persona quiso firmar ese documento.
//
// El código va SIEMPRE al correo de la cuenta, no al que declare en el
// formulario: ese correo es su identidad verificada en la app. El correo
// declarado es un dato de contacto más, y queda registrado como tal.
//
// La tabla de códigos la maneja el service role (no tiene policies): el
// hash del código no tiene por qué ser legible desde el cliente.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: show } = await supabase
    .from("shows")
    .select("id, name, project_id, cost_sheet_closed_at, required_signer_ids")
    .eq("id", id)
    .single();

  if (!show) return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  if (!show.project_id || !allowedProjectIds.includes(show.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este evento" }, { status: 403 });
  }
  if (!show.cost_sheet_closed_at) {
    return NextResponse.json({ error: "La caja todavía no está cerrada -- no hay nada que firmar" }, { status: 400 });
  }

  const requiredSigners = await getRequiredSigners(supabase, show.project_id, show.required_signer_ids);
  if (!requiredSigners.some((r) => r.userId === user!.id)) {
    return NextResponse.json({ error: "No estás en la lista de firmantes de este cierre" }, { status: 403 });
  }

  const { data: already } = await supabase
    .from("event_closing_signatures")
    .select("user_id")
    .eq("show_id", id)
    .eq("user_id", user!.id)
    .maybeSingle();
  if (already) {
    return NextResponse.json({ error: "Ya habías firmado este cierre" }, { status: 409 });
  }

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

  const accountEmail = user!.email;
  if (!accountEmail) {
    return NextResponse.json({ error: "Tu cuenta no tiene un correo asociado" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: pending } = await admin
    .from("event_signature_otps")
    .select("sent_at")
    .eq("show_id", id)
    .eq("user_id", user!.id)
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
  const { error: upsertError } = await admin.from("event_signature_otps").upsert(
    {
      show_id: id,
      user_id: user!.id,
      otp_hash: hashOtp(`${id}:${user!.id}`, code),
      sent_to: accountEmail,
      sent_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString(),
      // Cada código nuevo reinicia los intentos -- el límite es por código.
      attempts: 0,
      signer_name: name,
      signer_rut: rut,
      signer_email: email,
      signer_phone: phone,
      save_to_profile: saveToProfile,
    },
    { onConflict: "show_id,user_id" }
  );

  if (upsertError) return dbErrorResponse("event-signatures:codigo", upsertError);

  try {
    await sendEmail({
      to: accountEmail,
      subject: `Tu código para firmar -- ${show.name}`,
      html: buildExternalSignatureOtpEmailHtml({
        code,
        eventName: show.name,
        signerName: name.split(" ")[0] || name,
        minutes: OTP_TTL_MINUTES,
      }),
    });
  } catch (err) {
    console.error("[event-signatures:codigo] fallo enviando el código", err);
    return NextResponse.json({ error: "No se pudo enviar el correo. Intenta de nuevo en un momento." }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    sentToMasked: maskEmail(accountEmail),
    expiresInMinutes: OTP_TTL_MINUTES,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendClosingActa } from "@/lib/closing-acta";
import { getClientIp } from "@/lib/client-ip";
import { dbErrorResponse } from "@/lib/api-errors";
import { sendPushToUsers } from "@/lib/push";
import {
  sendEmail,
  isResendEnabled,
  buildExternalSignatureReceiptEmailHtml,
  buildSettlementSignatureReceiptEmailHtml,
} from "@/lib/resend";
import {
  hashToken,
  externalSignerStatus,
  otpMatches,
  buildClosingDocument,
  documentHash,
  buildReceiptPdf,
  OTP_MAX_ATTEMPTS,
} from "@/lib/external-signature";
import {
  buildSettlementDocument,
  settlementDocumentHash,
  buildSettlementReceiptPdf,
  settlementTitle,
  type SettlementDocument,
} from "@/lib/settlement-document";
import { formatSettlementAmount } from "@/lib/settlement-money";

function siteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}${path}`;
}

// POST /api/public/firma/[token]/firmar -- registra la firma del cliente
// externo. Solo recibe el código: el nombre, RUT, correo y teléfono son los
// que quedaron guardados cuando pidió el código (ver ../codigo), así que lo
// que se firma es siempre la identidad que recibió el correo.
//
// Irreversible, igual que las firmas internas: no hay endpoint de
// "des-firmar" y la base tampoco lo permite (trigger de la migración 099).
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const tokenHash = hashToken(token);

  const { data: signer } = await admin
    .from("event_external_signers")
    .select(
      "id, show_id, settlement_id, invited_name, role_label, created_at, first_viewed_at, expires_at, revoked_at, invalidated_at, signed_at, signer_name, signer_rut, signer_email, signer_phone, otp_hash, otp_sent_to, otp_expires_at, otp_attempts, created_by"
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!signer) {
    return NextResponse.json({ error: "Este link no existe o ya fue anulado" }, { status: 404 });
  }

  const status = externalSignerStatus(signer);
  if (status === "invalidado") {
    return NextResponse.json({ error: "Este documento cambió después de tu firma -- el equipo tiene que mandarte un link nuevo" }, { status: 410 });
  }
  if (status === "firmado") return NextResponse.json({ error: "Este documento ya está firmado" }, { status: 409 });
  if (status === "revocado") return NextResponse.json({ error: "Este link fue anulado" }, { status: 410 });
  if (status === "vencido") return NextResponse.json({ error: "Este link venció. Pide uno nuevo." }, { status: 410 });

  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";

  if (!signer.otp_hash || !signer.otp_expires_at || !signer.signer_email) {
    return NextResponse.json({ error: "Primero pide el código de verificación" }, { status: 400 });
  }
  if (new Date(signer.otp_expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "El código venció. Pide uno nuevo." }, { status: 410 });
  }

  const attempts = signer.otp_attempts ?? 0;
  if (attempts >= OTP_MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: "Demasiados intentos con ese código. Pide uno nuevo." },
      { status: 429 }
    );
  }

  if (!otpMatches(tokenHash, code, signer.otp_hash)) {
    await admin.from("event_external_signers").update({ otp_attempts: attempts + 1 }).eq("id", signer.id);
    const attemptsLeft = OTP_MAX_ATTEMPTS - (attempts + 1);
    return NextResponse.json(
      {
        error:
          attemptsLeft > 0
            ? `Código incorrecto. Te quedan ${attemptsLeft} ${attemptsLeft === 1 ? "intento" : "intentos"}.`
            : "Código incorrecto. Pide uno nuevo.",
        attemptsLeft: Math.max(0, attemptsLeft),
      },
      { status: 400 }
    );
  }

  // Link de una liquidación (migración 109): misma verificación de arriba,
  // otro documento y otro aviso.
  if (signer.settlement_id) {
    return signSettlement({ admin, request, signer, shownHash: body.documentHash });
  }

  const doc = await buildClosingDocument(admin, signer.show_id);
  if (!doc) return NextResponse.json({ error: "El evento de este link ya no existe" }, { status: 404 });

  // La huella se calcula sobre el cierre tal como está EN ESTE MOMENTO, y
  // el documento completo queda guardado junto a ella: si más adelante se
  // reabre la caja y cambia una cifra, se puede demostrar exactamente qué
  // fue lo que esta persona firmó.
  const hash = documentHash(doc);
  const signedAt = new Date().toISOString();
  const userAgent = request.headers.get("user-agent");

  const { data: updated, error: updateError } = await admin
    .from("event_external_signers")
    .update({
      signed_at: signedAt,
      otp_verified_at: signedAt,
      ip_address: getClientIp(request),
      user_agent: userAgent,
      document_hash: hash,
      document_snapshot: doc,
      // El código se quema al usarlo -- no sirve para nada más.
      otp_hash: null,
    })
    .eq("id", signer.id)
    // Guarda contra el doble submit (dos pestañas, doble tap): si otra
    // request ya escribió la firma, este update no toca ninguna fila y no
    // se manda un segundo comprobante.
    .is("signed_at", null)
    .select("id");

  if (updateError) return dbErrorResponse("firma-externa:firmar", updateError);
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: "Este documento ya está firmado" }, { status: 409 });
  }

  // El acta de todas las firmas, si esta fue la última que faltaba.
  void sendClosingActa({ admin, showId: signer.show_id }).then((r) => {
    if (!r.sent && r.reason && r.reason !== "faltan-firmas" && r.reason !== "ya-enviada") {
      console.warn("[acta-cierre] no se envió tras firma externa:", r.reason);
    }
  });

  void sendReceipts({
    admin,
    signerRow: signer,
    doc,
    hash,
    signedAt,
    userAgent,
    ipAddress: getClientIp(request),
  });

  return NextResponse.json({ ok: true, signedAt, documentHash: hash }, { status: 201 });
}

/** Comprobante por correo: al firmante (su respaldo) y al equipo (aviso +
 * respaldo). Fire-and-forget -- si Resend falla, la firma ya quedó
 * registrada igual y el PDF se puede volver a bajar desde el link. */
async function sendReceipts(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signerRow: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any;
  hash: string;
  signedAt: string;
  userAgent: string | null;
  ipAddress: string | null;
}) {
  const { admin, signerRow, doc, hash, signedAt, userAgent, ipAddress } = args;

  if (signerRow.created_by) {
    void sendPushToUsers([signerRow.created_by], {
      title: "Cierre firmado por el cliente",
      body: `${signerRow.signer_name} firmó la conformidad de ${doc.eventName}`,
      url: siteUrl(`/eventos/${doc.eventId}`),
    });
  }

  if (!isResendEnabled()) return;

  try {
    const pdf = await buildReceiptPdf(doc, {
      signerName: signerRow.signer_name,
      signerRut: signerRow.signer_rut,
      signerEmail: signerRow.signer_email,
      signerPhone: signerRow.signer_phone,
      roleLabel: signerRow.role_label ?? null,
      signedAt,
      otpVerifiedAt: signedAt,
      otpSentTo: signerRow.otp_sent_to ?? null,
      ipAddress,
      userAgent,
      linkCreatedAt: signerRow.created_at ?? null,
      firstViewedAt: signerRow.first_viewed_at ?? null,
      documentHash: hash,
    });

    const html = buildExternalSignatureReceiptEmailHtml({
      eventName: doc.eventName,
      eventDate: doc.date,
      venue: doc.venue,
      signerName: signerRow.signer_name,
      signerRut: signerRow.signer_rut,
      signerEmail: signerRow.signer_email,
      signerPhone: signerRow.signer_phone,
      roleLabel: signerRow.role_label ?? null,
      signedAt,
      ipAddress,
      documentHash: hash,
      utilidad: doc.utilidad,
    });

    const attachments = [
      {
        filename: `comprobante-firma-${doc.eventName.replace(/[^\w-]+/g, "-").toLowerCase()}.pdf`,
        content: Buffer.from(pdf).toString("base64"),
      },
    ];

    // Destinatarios: el firmante + quien emitió el link + quienes ya
    // aprobaron el cierre por dentro.
    const recipients = new Set<string>([signerRow.signer_email]);

    const { data: internal } = await admin
      .from("event_closing_signatures")
      .select("profiles ( email )")
      .eq("show_id", signerRow.show_id);
    for (const row of internal ?? []) {
      const email = row?.profiles?.email;
      if (email) recipients.add(email);
    }

    if (signerRow.created_by) {
      const { data: creator } = await admin
        .from("profiles")
        .select("email")
        .eq("id", signerRow.created_by)
        .single();
      if (creator?.email) recipients.add(creator.email);
    }

    const subject = `Conformidad firmada -- ${doc.eventName}`;
    for (const to of recipients) {
      try {
        await sendEmail({ to, subject, html, attachments });
      } catch (err) {
        console.error("[firma-externa:comprobante] fallo enviando a", to, err);
      }
    }

    await admin
      .from("event_external_signers")
      .update({ receipt_sent_at: new Date().toISOString() })
      .eq("id", signerRow.id);
  } catch (err) {
    console.error("[firma-externa:comprobante] no se pudo generar/enviar el comprobante", err);
  }
}

// ─── Firma de una liquidación ───────────────────────────────────────────────
async function signSettlement(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any;
  request: NextRequest;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signer: any;
  shownHash: unknown;
}) {
  const { admin, request, signer, shownHash } = args;

  const doc = await buildSettlementDocument(admin, signer.settlement_id);
  if (!doc) return NextResponse.json({ error: "La liquidación de este link ya no existe" }, { status: 404 });

  // Se firma lo que la persona VIO en pantalla: si el equipo corrigió la
  // liquidación mientras pedía el código, no firma la versión nueva a ciegas.
  const hash = settlementDocumentHash(doc);
  if (typeof shownHash !== "string" || shownHash !== hash) {
    return NextResponse.json(
      { error: "La liquidación cambió mientras firmabas. Recarga la página, revisa la versión actual y vuelve a firmar." },
      { status: 409 }
    );
  }
  const signedAt = new Date().toISOString();
  const userAgent = request.headers.get("user-agent");
  const ipAddress = getClientIp(request);

  const { data: updated, error: updateError } = await admin
    .from("event_external_signers")
    .update({
      signed_at: signedAt,
      otp_verified_at: signedAt,
      ip_address: ipAddress,
      user_agent: userAgent,
      document_hash: hash,
      document_snapshot: doc,
      otp_hash: null,
    })
    .eq("id", signer.id)
    .is("signed_at", null)
    .select("id");

  if (updateError) return dbErrorResponse("firma-externa-liquidacion:firmar", updateError);
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: "Este documento ya está firmado" }, { status: 409 });
  }

  void sendSettlementReceipts({ admin, signerRow: signer, doc, hash, signedAt, userAgent, ipAddress });

  return NextResponse.json({ ok: true, signedAt, documentHash: hash }, { status: 201 });
}

/** Comprobante PDF al firmante, a quien emitió el link y a quienes del
 * equipo ya firmaron la liquidación. Fire-and-forget. */
async function sendSettlementReceipts(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signerRow: any;
  doc: SettlementDocument;
  hash: string;
  signedAt: string;
  userAgent: string | null;
  ipAddress: string | null;
}) {
  const { admin, signerRow, doc, hash, signedAt, userAgent, ipAddress } = args;
  const title = settlementTitle(doc);

  if (signerRow.created_by) {
    void sendPushToUsers([signerRow.created_by], {
      title: "Liquidación firmada por la contraparte",
      body: `${signerRow.signer_name} firmó ${title}`,
      url: siteUrl(`/finances/comprobantes/${doc.settlementId}/firmar`),
    });
  }

  if (!isResendEnabled()) return;

  try {
    const pdf = await buildSettlementReceiptPdf(doc, {
      signerName: signerRow.signer_name,
      signerRut: signerRow.signer_rut,
      signerEmail: signerRow.signer_email,
      signerPhone: signerRow.signer_phone,
      roleLabel: signerRow.role_label ?? null,
      signedAt,
      otpVerifiedAt: signedAt,
      otpSentTo: signerRow.otp_sent_to ?? null,
      ipAddress,
      userAgent,
      linkCreatedAt: signerRow.created_at ?? null,
      firstViewedAt: signerRow.first_viewed_at ?? null,
      documentHash: hash,
    });

    const html = buildSettlementSignatureReceiptEmailHtml({
      title,
      periodLabel: doc.periodLabel,
      payoutLabel: formatSettlementAmount(doc.payoutAmount, doc.currency),
      signerName: signerRow.signer_name,
      signerRut: signerRow.signer_rut,
      signerEmail: signerRow.signer_email,
      signerPhone: signerRow.signer_phone,
      roleLabel: signerRow.role_label ?? null,
      signedAt,
      ipAddress,
      documentHash: hash,
    });

    const attachments = [
      {
        filename: `comprobante-liquidacion-${`${doc.payerName}-${doc.payeeName}`.replace(/[^\w-]+/g, "-").toLowerCase()}.pdf`,
        content: Buffer.from(pdf).toString("base64"),
      },
    ];

    const recipients = new Set<string>([signerRow.signer_email]);
    const { data: internal } = await admin
      .from("settlement_signatures")
      .select("profiles ( email )")
      .eq("settlement_id", doc.settlementId);
    for (const row of internal ?? []) {
      const email = row?.profiles?.email;
      if (email) recipients.add(email);
    }
    if (signerRow.created_by) {
      const { data: creator } = await admin.from("profiles").select("email").eq("id", signerRow.created_by).single();
      if (creator?.email) recipients.add(creator.email);
    }

    const subject = `Liquidación firmada -- ${doc.payerName} → ${doc.payeeName}`;
    for (const to of recipients) {
      try {
        await sendEmail({ to, subject, html, attachments });
      } catch (err) {
        console.error("[firma-externa-liquidacion:comprobante] fallo enviando a", to, err);
      }
    }

    await admin
      .from("event_external_signers")
      .update({ receipt_sent_at: new Date().toISOString() })
      .eq("id", signerRow.id);
  } catch (err) {
    console.error("[firma-externa-liquidacion:comprobante] no se pudo generar/enviar el comprobante", err);
  }
}

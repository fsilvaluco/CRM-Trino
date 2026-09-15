import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getSignaturesState } from "@/lib/event-signatures";
import {
  hashToken,
  externalSignerStatus,
  buildClosingDocument,
  documentHash,
  maskEmail,
  OTP_MAX_ATTEMPTS,
} from "@/lib/external-signature";

// GET /api/public/firma/[token] -- SIN autenticación: el control de acceso
// es el token del link (32 bytes aleatorios, del que en la base solo vive
// el SHA-256). Devuelve el cierre de caja completo, que es exactamente el
// documento que el firmante externo tiene que poder revisar antes de dar su
// conformidad -- a diferencia de /api/public/eventos/[id], que es un link
// para compartir con banda/staff y por eso no muestra ni un peso.
//
// Usa el service role a propósito (el firmante es anónimo, no hay
// auth.uid() contra el cual escribir una policy), así que cada campo que
// sale de acá está elegido a mano y acotado a ESE evento.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: signer } = await admin
    .from("event_external_signers")
    .select(
      "id, show_id, role_label, invited_name, invited_email, created_at, expires_at, revoked_at, first_viewed_at, signed_at, signer_name, signer_rut, signer_email, signer_phone, otp_sent_to, otp_sent_at, otp_expires_at, otp_attempts, otp_verified_at, ip_address, document_hash"
    )
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (!signer) {
    return NextResponse.json({ error: "Este link no existe o ya fue anulado" }, { status: 404 });
  }

  const status = externalSignerStatus(signer);

  // Primera vez que se abre: queda registrado como parte de la evidencia
  // (cuándo recibió el documento, no solo cuándo lo firmó). Los previews de
  // WhatsApp/Slack no pasan por acá -- solo leen el HTML de la página.
  if (status === "pendiente" && !signer.first_viewed_at) {
    await admin
      .from("event_external_signers")
      .update({ first_viewed_at: new Date().toISOString() })
      .eq("id", signer.id);
  }

  const doc = await buildClosingDocument(admin, signer.show_id);
  if (!doc) {
    return NextResponse.json({ error: "El evento de este link ya no existe" }, { status: 404 });
  }

  // Recuadro de Aprobación: el firmante externo ve quién más está firmando
  // el MISMO documento -- el equipo interno y los otros externos. Decisión
  // explícita de Francisco (15 sep 2026): le da peso al documento que el
  // cliente vea que no es el único firmando. Van nombres, correos y si
  // firmaron; las IP no, que son evidencia de cada firmante y no le
  // aportan nada a la contraparte.
  const { data: showRow } = await admin
    .from("shows")
    .select("project_id, required_signer_ids")
    .eq("id", signer.show_id)
    .single();

  const internal = showRow?.project_id
    ? await getSignaturesState(admin, signer.show_id, showRow.project_id, showRow.required_signer_ids)
    : null;

  const { data: otherExternals } = await admin
    .from("event_external_signers")
    .select("id, role_label, invited_name, signer_name, signed_at, revoked_at, expires_at")
    .eq("show_id", signer.show_id)
    .order("created_at");

  const currentHash = documentHash(doc);
  const now = Date.now();
  const otpPending =
    status === "pendiente" && signer.otp_expires_at && new Date(signer.otp_expires_at).getTime() > now;

  return NextResponse.json({
    status,
    expiresAt: signer.expires_at,
    invitation: {
      roleLabel: signer.role_label ?? null,
      invitedName: signer.invited_name ?? null,
      // Enmascarado: quien tenga el link sabe a qué casilla llega el código
      // sin que el correo quede expuesto si reenvían el link a un grupo.
      invitedEmailMasked: signer.invited_email ? maskEmail(signer.invited_email) : null,
      // Cuando el equipo dejó fijado el correo, el código SOLO puede ir ahí.
      emailLocked: Boolean(signer.invited_email),
    },
    // Un link vencido o anulado no muestra ni un peso: el documento solo
    // sale mientras el link sirve para firmar, o para que quien ya firmó
    // pueda releer lo que firmó.
    approval: internal
      ? {
          requiredSigners: internal.requiredSigners.map((r) => {
            const sig = internal.signatures.find((x) => x.userId === r.userId);
            return {
              name: r.fullName || r.email || "Integrante del equipo",
              email: r.email,
              signedAt: sig?.signedAt ?? null,
            };
          }),
          externalSigners: (otherExternals ?? [])
            .filter((r: { revoked_at: string | null }) => !r.revoked_at)
            .map((r: {
              id: string;
              role_label: string | null;
              invited_name: string | null;
              signer_name: string | null;
              signed_at: string | null;
              expires_at: string;
            }) => ({
              id: r.id,
              name: r.signer_name || r.invited_name || r.role_label || "Firmante externo",
              roleLabel: r.role_label,
              signedAt: r.signed_at,
              // Para que el firmante actual se reconozca en la lista.
              isMe: r.id === signer.id,
            })),
        }
      : null,
    document: status === "pendiente" || status === "firmado" ? doc : null,
    documentHash: status === "pendiente" || status === "firmado" ? currentHash : null,
    otp: otpPending
      ? {
          sentToMasked: signer.otp_sent_to ? maskEmail(signer.otp_sent_to) : null,
          sentAt: signer.otp_sent_at,
          expiresAt: signer.otp_expires_at,
          attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - (signer.otp_attempts ?? 0)),
        }
      : null,
    signature:
      status === "firmado"
        ? {
            name: signer.signer_name,
            rut: signer.signer_rut,
            email: signer.signer_email,
            phone: signer.signer_phone,
            signedAt: signer.signed_at,
            otpVerifiedAt: signer.otp_verified_at,
            ipAddress: signer.ip_address,
            documentHash: signer.document_hash,
            // Si alguien reabrió la caja y cambió cifras después de firmar,
            // el hash guardado deja de calzar con el del cierre actual.
            documentUnchanged: signer.document_hash === currentHash,
          }
        : null,
  });
}

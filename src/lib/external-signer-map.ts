// Fila de event_external_signers -> lo que ve el equipo en la ficha (del
// evento o de la liquidacion). Salio de /api/eventos/[id]/external-signers
// cuando las liquidaciones empezaron a usar la misma tabla (migracion 110).

import { externalSignerStatus } from "@/lib/external-signature";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapExternalSigner(row: any) {
  return {
    id: row.id,
    roleLabel: row.role_label ?? null,
    invitedName: row.invited_name ?? null,
    invitedEmail: row.invited_email ?? null,
    status: externalSignerStatus(row),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at ?? null,
    invalidatedAt: row.invalidated_at ?? null,
    invalidatedReason: row.invalidated_reason ?? null,
    firstViewedAt: row.first_viewed_at ?? null,
    signedAt: row.signed_at ?? null,
    signerName: row.signer_name ?? null,
    signerRut: row.signer_rut ?? null,
    signerEmail: row.signer_email ?? null,
    signerPhone: row.signer_phone ?? null,
    otpVerifiedAt: row.otp_verified_at ?? null,
    ipAddress: row.ip_address ?? null,
    documentHash: row.document_hash ?? null,
    // Los links emitidos antes de la migración 104 (o con el secreto sin
    // configurar) no se pueden copiar -- para esos queda "Reenviar", que
    // emite uno nuevo.
    canCopyLink: Boolean(row.token_encrypted),
  };
}

// Columnas que se devuelven al equipo. Nunca `token_hash` ni `otp_hash`:
// no le sirven a la UI y no tienen por qué salir de la base.
export const EXTERNAL_SIGNER_SELECT =
  "id, role_label, invited_name, invited_email, created_at, expires_at, revoked_at, invalidated_at, invalidated_reason, first_viewed_at, signed_at, token_encrypted, signer_name, signer_rut, signer_email, signer_phone, otp_verified_at, ip_address, document_hash";


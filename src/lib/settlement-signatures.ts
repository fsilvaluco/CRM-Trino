// ─── Firmas de una liquidacion: equipo + contraparte externa ───────────────
// Lo comparten la pagina de firma del equipo, la publica (/firmar/[token])
// y la lista de Comprobantes.
//
// Diferencia deliberada con el cierre de caja: en un evento la firma del
// cliente externo es un respaldo aparte y NO cuenta para el "X/Y firmaron".
// En una liquidacion la contraparte externa es justamente la otra parte del
// pago (ej. la artista a la que se le liquidan sus regalias), asi que su
// firma SI cuenta para darla por firmada. Decision de Francisco, 14 oct 2026.

import type { ExternalSignerRow } from "@/lib/external-signature";
import { externalSignerStatus } from "@/lib/external-signature";

export interface SettlementTeamSigner {
  userId: string;
  name: string;
  email: string | null;
  signedAt: string | null;
}

export interface SettlementApproval {
  team: SettlementTeamSigner[];
  /** Filas crudas de event_external_signers de esta liquidacion -- se
   * agrupan por persona con approvalExternalSigners(). */
  externalRows: ExternalSignerRow[];
  /** Firmaron todos los del equipo elegidos y todas las contrapartes con un
   * link vigente o ya firmado. */
  allSigned: boolean;
}

export async function getSettlementApproval(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  settlementId: string
): Promise<SettlementApproval> {
  const [{ data: settlement }, { data: sigRows }, { data: extRows }] = await Promise.all([
    admin.from("settlements").select("required_signer_ids").eq("id", settlementId).maybeSingle(),
    admin.from("settlement_signatures").select("user_id, signed_at").eq("settlement_id", settlementId),
    admin
      .from("event_external_signers")
      .select(
        "id, role_label, invited_name, invited_email, signer_name, signer_email, signed_at, invalidated_at, revoked_at, expires_at, created_at"
      )
      .eq("settlement_id", settlementId)
      .order("created_at"),
  ]);

  const signedAt = new Map<string, string>(
    ((sigRows ?? []) as { user_id: string; signed_at: string }[]).map((s) => [s.user_id, s.signed_at])
  );
  const required: string[] = settlement?.required_signer_ids ?? [];
  // Sin firmantes elegidos se muestra a quienes ya firmaron (mismo criterio
  // que la tarjeta de Comprobantes).
  const teamIds = required.length > 0 ? required : [...signedAt.keys()];

  const { data: profiles } = teamIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", teamIds)
    : { data: [] };
  const byId = new Map(
    ((profiles ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((p) => [p.id, p])
  );

  const team = teamIds.map((userId) => {
    const p = byId.get(userId);
    return {
      userId,
      name: p?.full_name || p?.email || "Integrante del equipo",
      email: p?.email ?? null,
      signedAt: signedAt.get(userId) ?? null,
    };
  });

  const externalRows = (extRows ?? []) as ExternalSignerRow[];
  const teamDone = required.length === 0 ? signedAt.size > 0 : team.every((t) => t.signedAt);
  const vigentes = externalRows.filter((r) => {
    const st = externalSignerStatus(r);
    return st === "pendiente" || st === "firmado";
  });
  const externalDone = vigentes.every((r) => externalSignerStatus(r) === "firmado");

  return { team, externalRows, allSigned: teamDone && externalDone };
}

/** Sal del hash del codigo de la firma INTERNA: liquidacion + usuario.
 * Mismo esquema que la firma interna de eventos (`${showId}:${userId}`). */
export function settlementOtpSalt(settlementId: string, userId: string) {
  return `settlement:${settlementId}:${userId}`;
}

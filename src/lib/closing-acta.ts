// ─── Acta del cierre de caja: se manda sola cuando firman todos ─────────────
//
// Pedido de Francisco (16 sep 2026): cuando termina de firmar todo el mundo,
// que salga un correo automatico con un PDF que junte TODAS las firmas --
// el comprobante individual (migracion 099) le sirve a cada firmante, pero
// faltaba el documento del evento completo.
//
// "Todos" = los firmantes internos marcados (migracion 101) Y todos los
// links externos vigentes. Un link externo anulado, vencido o invalidado por
// reapertura no cuenta: no hay a quien esperar. Un link externo PENDIENTE si
// bloquea el envio automatico -- por eso el boton "Informar cierre" sigue
// existiendo, que fuerza el envio igual (force: true).
//
// Se apoya en `cost_sheet_informed_at` para no mandarlo dos veces: es el
// mismo concepto que ya existia ("el cierre quedo informado"), y reabrir la
// caja lo limpia solo (ver costs/reopen/route.ts), asi que despues de un
// reabrir-volver-a-firmar el acta sale de nuevo.

import { getSignaturesState } from "@/lib/event-signatures";
import { buildClosingDocument, buildActaPdf, type ActaSigner } from "@/lib/external-signature";
import { profitSplitLabels } from "@/lib/profit-split";
import { sendEmail, isResendEnabled, buildCostSheetSummaryEmailHtml } from "@/lib/resend";

function siteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}${path}`;
}

export interface EnvioActaResult {
  sent: boolean;
  /** Por que no se mando -- para loguear, no para mostrarle al usuario tal cual. */
  reason?: "caja-abierta" | "faltan-firmas" | "ya-enviada" | "sin-correo" | "sin-evento" | "sin-firmas";
  recipients?: string[];
}

/**
 * Manda el acta si corresponde. Pensado para llamarse fire-and-forget
 * despues de CADA firma (interna o externa): si todavia falta alguien, no
 * hace nada y devuelve por que.
 *
 * `force` (el boton "Informar cierre") se salta el chequeo de externos
 * pendientes y el de "ya se envio" -- sirve para reenviar, y para cerrar el
 * tema cuando un cliente nunca firma.
 */
export async function sendClosingActa(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any;
  showId: string;
  force?: boolean;
}): Promise<EnvioActaResult> {
  const { admin, showId, force = false } = args;

  const { data: show } = await admin
    .from("shows")
    .select(
      "id, name, date, venue, project_id, cost_sheet_closed_at, cost_sheet_informed_at, required_signer_ids, fee, ticket_income, expenses, profit_split_note, profit_split_project_pct, profit_split_trino_pct, profit_split_project_label, profit_split_trino_label, projects ( name )"
    )
    .eq("id", showId)
    .single();

  if (!show || !show.project_id) return { sent: false, reason: "sin-evento" };
  if (!show.cost_sheet_closed_at) return { sent: false, reason: "caja-abierta" };
  if (show.cost_sheet_informed_at && !force) return { sent: false, reason: "ya-enviada" };

  const { requiredSigners, signatures, allSigned } = await getSignaturesState(
    admin,
    showId,
    show.project_id,
    show.required_signer_ids
  );

  const { data: externalRows } = await admin
    .from("event_external_signers")
    .select(
      "role_label, invited_name, signer_name, signer_rut, signer_email, signer_phone, signed_at, revoked_at, invalidated_at, expires_at, otp_verified_at, ip_address, document_hash"
    )
    .eq("show_id", showId)
    .order("created_at");

  // Un link anulado, vencido o invalidado por reapertura no cuenta como
  // firma pendiente -- no hay a quien esperar.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const externosVigentes = (externalRows ?? []).filter((r: any) => {
    if (r.revoked_at || r.invalidated_at) return false;
    if (!r.signed_at && new Date(r.expires_at).getTime() < Date.now()) return false;
    return true;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const externosFirmados = externosVigentes.filter((r: any) => r.signed_at);
  const faltanExternos = externosVigentes.length !== externosFirmados.length;

  const completo = requiredSigners.length > 0 && allSigned && !faltanExternos;
  if (!completo && !force) return { sent: false, reason: "faltan-firmas" };
  if (signatures.length === 0 && externosFirmados.length === 0) return { sent: false, reason: "sin-firmas" };

  if (!isResendEnabled()) return { sent: false, reason: "sin-correo" };

  const doc = await buildClosingDocument(admin, showId);
  if (!doc) return { sent: false, reason: "sin-evento" };

  const firmantes: ActaSigner[] = [
    ...signatures.map((s) => ({
      tipo: "equipo" as const,
      name: s.signerName || s.fullName || s.email || "Integrante del equipo",
      rut: s.signerRut,
      email: s.signerEmail || s.email,
      phone: s.signerPhone,
      roleLabel: null,
      signedAt: s.signedAt,
      otpVerifiedAt: s.otpVerifiedAt,
      ipAddress: s.ipAddress,
      documentHash: s.documentHash,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...externosFirmados.map((r: any) => ({
      tipo: "contraparte" as const,
      name: r.signer_name || r.invited_name || "Contraparte",
      rut: r.signer_rut ?? null,
      email: r.signer_email ?? null,
      phone: r.signer_phone ?? null,
      roleLabel: r.role_label ?? null,
      signedAt: r.signed_at,
      otpVerifiedAt: r.otp_verified_at ?? null,
      ipAddress: r.ip_address ?? null,
      documentHash: r.document_hash ?? null,
    })),
  ];

  const pdf = await buildActaPdf(doc, firmantes);

  const [{ data: costRows }, { data: tierRows }] = await Promise.all([
    admin.from("event_cost_items").select("label, responsable, amount").eq("show_id", showId).order("position"),
    admin.from("event_ticket_tiers").select("label, unit_price, quantity_sold").eq("show_id", showId).order("position"),
  ]);

  const labels = profitSplitLabels({
    profitSplitProjectLabel: show.profit_split_project_label,
    profitSplitTrinoLabel: show.profit_split_trino_label,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    projectName: (show as any).projects?.name ?? null,
  });

  const html = buildCostSheetSummaryEmailHtml({
    eventName: show.name,
    eventDate: show.date,
    venue: show.venue,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    projectName: (show as any).projects?.name ?? null,
    fee: show.fee,
    ticketIncome: show.ticket_income,
    expenses: show.expenses,
    ticketTiers: (tierRows ?? []).map((t: { label: string; unit_price: number; quantity_sold: number }) => ({
      label: t.label,
      unitPrice: t.unit_price,
      quantitySold: t.quantity_sold,
    })),
    costItems: (costRows ?? []).map((c: { label: string; responsable: string | null; amount: number }) => ({
      label: c.label,
      responsable: c.responsable,
      amount: c.amount,
    })),
    profitSplitNote: show.profit_split_note,
    profitSplitProjectPct: show.profit_split_project_pct,
    profitSplitTrinoPct: show.profit_split_trino_pct,
    profitSplitProjectLabel: labels.project,
    profitSplitTrinoLabel: labels.trino,
    signers: firmantes.map((f) => ({
      name: f.roleLabel ? `${f.name} (${f.roleLabel})` : f.name,
      signedAt: f.signedAt,
    })),
    conActaAdjunta: true,
    detailUrl: siteUrl(`/eventos/${showId}/firmar`),
  });

  // Destinatarios: todos los que firmaron, equipo y contraparte por igual.
  const recipients = new Set<string>();
  for (const f of firmantes) if (f.email) recipients.add(f.email);
  if (recipients.size === 0) return { sent: false, reason: "sin-firmas" };

  const attachments = [
    {
      filename: `acta-cierre-${show.name.replace(/[^\w-]+/g, "-").toLowerCase()}.pdf`,
      content: Buffer.from(pdf).toString("base64"),
    },
  ];

  const subject = `Cierre de caja firmado por todos -- ${show.name}`;
  const sentTo: string[] = [];
  for (const to of recipients) {
    try {
      await sendEmail({ to, subject, html, attachments });
      sentTo.push(to);
    } catch (err) {
      console.error("[acta-cierre] fallo enviando a", to, err);
    }
  }

  await admin.from("shows").update({ cost_sheet_informed_at: new Date().toISOString() }).eq("id", showId);

  return { sent: true, recipients: sentTo };
}

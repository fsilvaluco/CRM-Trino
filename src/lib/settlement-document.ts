// ─── El documento que se firma en una liquidacion ──────────────────────────
// Equivalente de buildClosingDocument (external-signature.ts) para las
// liquidaciones de regalias/merch/otro (migracion 109). Lo firman igual el
// equipo (/finances/comprobantes/[id]/firmar) y la contraparte externa
// (/firmar/[token]): mismo documento, misma huella, mismo PDF.

import { hashStable } from "@/lib/external-signature";
import { nuevoPdf } from "@/lib/pdf-writer";
import { formatSettlementAmount, isSettlementCurrency, type SettlementCurrency } from "@/lib/settlement-money";
import type { SettlementDocumentView } from "@/types/external-signature";

export type SettlementDocument = SettlementDocumentView;

const TYPE_LABELS: Record<string, string> = {
  regalias: "Regalías",
  merch: "Merchandising",
  otro: "Liquidación",
};

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "Regalías: Katarsis → Dani Abarza". Con `ascii` usa "->", para el PDF:
 * las fuentes estándar de pdf-lib no tienen la flecha (ver pdf-writer). */
export function settlementTitle(
  doc: { payerName: string; payeeName: string; typeLabel: string },
  opts: { ascii?: boolean } = {}
): string {
  return `${doc.typeLabel}: ${doc.payerName} ${opts.ascii ? "->" : "→"} ${doc.payeeName}`;
}

/** La liquidacion tal cual esta en este momento. */
export async function buildSettlementDocument(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  settlementId: string
): Promise<SettlementDocument | null> {
  const { data: row } = await admin
    .from("settlements")
    .select(
      "id, project_id, type, period_month, period_year, payer_name, payee_name, currency, source_amount, source_proof_path, source_proof_name, percentage, payout_amount, payout_proof_path, payout_proof_name, notes, deleted_at"
    )
    .eq("id", settlementId)
    .maybeSingle();

  if (!row || row.deleted_at) return null;

  const { data: project } = row.project_id
    ? await admin.from("projects").select("name").eq("id", row.project_id).maybeSingle()
    : { data: null };

  const currency: SettlementCurrency = isSettlementCurrency(row.currency) ? row.currency : "CLP";

  return {
    kind: "liquidacion",
    settlementId: row.id,
    projectName: project?.name ?? null,
    type: row.type,
    typeLabel: TYPE_LABELS[row.type] ?? "Liquidación",
    periodLabel:
      row.period_month && row.period_year
        ? `${MONTHS[row.period_month - 1]} ${row.period_year}`
        : row.period_year
          ? String(row.period_year)
          : null,
    payerName: row.payer_name,
    payeeName: row.payee_name,
    currency,
    sourceAmount: row.source_amount,
    percentage: Number(row.percentage),
    payoutAmount: row.payout_amount,
    notes: row.notes ?? null,
    sourceProofPath: row.source_proof_path ?? null,
    sourceProofName: row.source_proof_name ?? null,
    payoutProofPath: row.payout_proof_path ?? null,
    payoutProofName: row.payout_proof_name ?? null,
  };
}

/** Huella de la liquidacion. Los comprobantes adjuntos quedan FUERA, igual
 * que las boletas de un cierre de caja: subir el comprobante de la
 * transferencia DESPUES de que la contraparte firmo no cambia lo que
 * aprobo (cuanto, a quien, por que) y no tiene por que invalidar su firma. */
export function settlementDocumentHash(doc: SettlementDocument): string {
  const {
    sourceProofPath: _sp,
    sourceProofName: _sn,
    payoutProofPath: _pp,
    payoutProofName: _pn,
    ...forHash
  } = doc;
  void _sp; void _sn; void _pp; void _pn;
  return hashStable(forHash);
}

/** Los campos de `settlements` que forman el documento firmado. Si un PUT
 * cambia alguno, las firmas existentes dejan de calzar (ver
 * /api/settlements/[id]). */
export const SETTLEMENT_DOCUMENT_COLUMNS = [
  "type",
  "period_month",
  "period_year",
  "payer_name",
  "payee_name",
  "currency",
  "source_amount",
  "percentage",
  "payout_amount",
  "notes",
] as const;

// ─── Comprobante en PDF ─────────────────────────────────────────────────────

const NOTA_LEY =
  "Este comprobante da cuenta de una firma electronica simple en los terminos de la Ley 19.799. " +
  "El firmante se identifico con los datos declarados mas arriba y acredito el control de su correo " +
  "mediante un codigo de un solo uso enviado a esa casilla. La huella SHA-256 corresponde al " +
  "contenido exacto de la liquidacion tal como se le mostro al momento de firmar: cualquier modificacion " +
  "posterior de montos, partes o condiciones produce una huella distinta.";

function formatDateTime(iso: string | null): string {
  if (!iso) return "--";
  try {
    return new Date(iso).toLocaleString("es-CL", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      timeZone: "America/Santiago",
    });
  } catch {
    return iso;
  }
}

export interface SettlementReceiptEvidence {
  signerName: string;
  signerRut: string;
  signerEmail: string;
  signerPhone: string;
  roleLabel: string | null;
  signedAt: string;
  otpVerifiedAt: string | null;
  otpSentTo: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  linkCreatedAt: string | null;
  firstViewedAt: string | null;
  documentHash: string;
}

export async function buildSettlementReceiptPdf(
  doc: SettlementDocument,
  ev: SettlementReceiptEvidence
): Promise<Uint8Array> {
  const w = await nuevoPdf();
  const money = (n: number) => formatSettlementAmount(n, doc.currency);

  w.text("COMPROBANTE DE FIRMA ELECTRONICA SIMPLE", { size: 14, bold: true });
  w.text("Conformidad de liquidacion", { size: 10, gray: true });
  w.rule();

  w.heading("DOCUMENTO FIRMADO");
  w.text(settlementTitle(doc, { ascii: true }), { size: 12, bold: true });
  const sub = [doc.periodLabel ? `Periodo: ${doc.periodLabel}` : null, doc.projectName].filter(Boolean).join(" - ");
  if (sub) w.text(sub, { size: 9, gray: true });
  w.space(4);
  w.row("Paga", doc.payerName);
  w.row("Recibe", doc.payeeName);
  w.row("Moneda", doc.currency);
  w.row("Monto de origen", money(doc.sourceAmount));
  w.row("Porcentaje", `${doc.percentage}%`);
  w.row("Monto a pagar", money(doc.payoutAmount), { bold: true });
  if (doc.notes) {
    w.space(4);
    w.text("Condiciones y notas", { size: 9 });
    w.paragraph(doc.notes, 9);
  }
  w.rule();

  w.heading("FIRMANTE");
  w.row("Nombre", ev.signerName, { bold: true });
  w.row("RUT / identificacion", ev.signerRut);
  w.row("Correo", ev.signerEmail);
  w.row("Telefono", ev.signerPhone);
  if (ev.roleLabel) w.row("Calidad en que firma", ev.roleLabel);

  w.heading("EVIDENCIA DE LA FIRMA");
  w.row("Fecha y hora de la firma", formatDateTime(ev.signedAt), { size: 9 });
  w.row("Codigo enviado a", ev.otpSentTo ?? "--", { size: 9 });
  w.row("Codigo verificado", formatDateTime(ev.otpVerifiedAt), { size: 9 });
  w.row("Direccion IP", ev.ipAddress ?? "--", { size: 9 });
  if (ev.linkCreatedAt) w.row("Link emitido", formatDateTime(ev.linkCreatedAt), { size: 9 });
  if (ev.firstViewedAt) w.row("Primera apertura del link", formatDateTime(ev.firstViewedAt), { size: 9 });
  if (ev.userAgent) {
    w.space(2);
    w.text("Dispositivo / navegador", { size: 9 });
    w.paragraph(ev.userAgent, 8);
  }
  w.space(4);
  w.text("Huella (SHA-256) del documento firmado", { size: 9 });
  w.paragraph(ev.documentHash, 8);

  w.rule();
  w.paragraph(NOTA_LEY, 8);
  w.paragraph("Generado por Artist Pro - artistpro.app", 8);

  return w.save();
}

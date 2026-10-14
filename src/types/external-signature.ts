// Tipos de la firma externa del cierre de caja (cliente sin cuenta en la
// app). Viven acá y no en src/lib/external-signature.ts porque ese módulo
// es server-only (crypto, pdf-lib) y estos los usan también los componentes
// del cliente. Ver scripts/migrations/099_event_external_signers.sql.

export type ExternalSignerStatus = "pendiente" | "firmado" | "invalidado" | "vencido" | "revocado";

export interface ClosingDocumentView {
  eventId: string;
  eventName: string;
  date: string;
  venue: string;
  city: string | null;
  projectName: string | null;
  costSheetClosedAt: string | null;
  fee: number | null;
  ticketIncome: number | null;
  expenses: number | null;
  ingresos: number;
  utilidad: number;
  ticketTiers: { label: string; unitPrice: number; quantitySold: number }[];
  costItems: { label: string; responsable: string | null; amount: number; comprobanteUrl: string | null }[];
  profitSplitProjectPct: number | null;
  profitSplitTrinoPct: number | null;
  /** Nombres ya resueltos de cada lado del reparto (migración 100). */
  profitSplitProjectLabel: string;
  profitSplitTrinoLabel: string;
  profitSplitNote: string | null;
}

/** Una liquidación de regalías/merch/otro tal como se firma (migración
 * 109). Los montos van en la unidad mínima de `currency` -- ver
 * src/lib/settlement-money.ts. */
export interface SettlementDocumentView {
  kind: "liquidacion";
  settlementId: string;
  projectName: string | null;
  type: string;
  typeLabel: string;
  periodLabel: string | null;
  payerName: string;
  payeeName: string;
  currency: "CLP" | "USD";
  sourceAmount: number;
  percentage: number;
  payoutAmount: number;
  notes: string | null;
  /** Adjuntos: se pueden abrir desde la pantalla de firma pero quedan FUERA
   * de la huella (ver settlementDocumentHash). */
  sourceProofPath: string | null;
  sourceProofName: string | null;
  payoutProofPath: string | null;
  payoutProofName: string | null;
}

/** Lo que ve el firmante externo en /firmar/[token]. */
export interface ExternalSignatureView {
  /** Qué se firma con este link: el cierre de caja de un evento, o una
   * liquidación (migración 109). */
  kind: "evento" | "liquidacion";
  /** Título corto del documento, para el encabezado de la pantalla. */
  title: string;
  status: ExternalSignerStatus;
  expiresAt: string;
  invitation: {
    roleLabel: string | null;
    invitedName: string | null;
    invitedEmailMasked: string | null;
    emailLocked: boolean;
  };
  /** Cierre de caja (kind "evento"). null cuando el link está vencido o
   * anulado, o cuando es una liquidación. */
  document: ClosingDocumentView | null;
  /** Liquidación (kind "liquidacion"). Mismas reglas que `document`. */
  settlement: SettlementDocumentView | null;
  documentHash: string | null;
  invalidatedAt: string | null;
  otp: {
    sentToMasked: string | null;
    sentAt: string;
    expiresAt: string;
    attemptsLeft: number;
  } | null;
  /** Quiénes más están firmando este mismo cierre -- el equipo y las otras
   * contrapartes. Se le muestra al firmante externo a propósito: le da peso
   * al documento saber que no es el único. */
  approval: {
    requiredSigners: { name: string; email: string | null; signedAt: string | null }[];
    externalSigners: { id: string; name: string; roleLabel: string | null; signedAt: string | null; isMe: boolean }[];
  } | null;
  signature: {
    name: string;
    rut: string;
    email: string;
    phone: string;
    signedAt: string;
    otpVerifiedAt: string | null;
    ipAddress: string | null;
    documentHash: string;
    documentUnchanged: boolean;
  } | null;
}

/** Lo que ve el equipo en la ficha del evento. */
export interface ExternalSigner {
  id: string;
  roleLabel: string | null;
  invitedName: string | null;
  invitedEmail: string | null;
  status: ExternalSignerStatus;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  /** Firmó, pero después se reabrió el cierre: la firma se conserva con
   * toda su evidencia y deja de contar (migración 103). */
  invalidatedAt: string | null;
  invalidatedReason: string | null;
  firstViewedAt: string | null;
  signedAt: string | null;
  signerName: string | null;
  signerRut: string | null;
  signerEmail: string | null;
  signerPhone: string | null;
  otpVerifiedAt: string | null;
  ipAddress: string | null;
  documentHash: string | null;
  /** Si el token quedó guardado cifrado (migración 104) se puede volver a
   * copiar el link. Los emitidos antes, no. */
  canCopyLink: boolean;
  /** Solo viene en la respuesta del POST que lo crea. */
  url?: string;
}

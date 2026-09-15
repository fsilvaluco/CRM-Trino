// Tipos de la firma externa del cierre de caja (cliente sin cuenta en la
// app). Viven acá y no en src/lib/external-signature.ts porque ese módulo
// es server-only (crypto, pdf-lib) y estos los usan también los componentes
// del cliente. Ver scripts/migrations/099_event_external_signers.sql.

export type ExternalSignerStatus = "pendiente" | "firmado" | "vencido" | "revocado";

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
  costItems: { label: string; responsable: string | null; amount: number }[];
  profitSplitProjectPct: number | null;
  profitSplitTrinoPct: number | null;
  profitSplitNote: string | null;
}

/** Lo que ve el firmante externo en /firmar/[token]. */
export interface ExternalSignatureView {
  status: ExternalSignerStatus;
  expiresAt: string;
  invitation: {
    roleLabel: string | null;
    invitedName: string | null;
    invitedEmailMasked: string | null;
    emailLocked: boolean;
  };
  /** null cuando el link está vencido o anulado. */
  document: ClosingDocumentView | null;
  documentHash: string | null;
  otp: {
    sentToMasked: string | null;
    sentAt: string;
    expiresAt: string;
    attemptsLeft: number;
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
  firstViewedAt: string | null;
  signedAt: string | null;
  signerName: string | null;
  signerRut: string | null;
  signerEmail: string | null;
  signerPhone: string | null;
  otpVerifiedAt: string | null;
  ipAddress: string | null;
  documentHash: string | null;
  /** Solo viene en la respuesta del POST que lo crea -- después nunca más. */
  url?: string;
}

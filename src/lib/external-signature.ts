// ─── Firma externa del cierre de caja ───────────────────────────────────────
// Todo lo compartido entre las rutas de admin (/api/eventos/[id]/external-signers)
// y las publicas (/api/public/firma/[token]): el secreto del link, el codigo
// de verificacion que se manda al correo, el "documento" exacto que se firma
// y su hash, y el PDF del comprobante.
//
// Contexto (15 sep 2026): hay eventos que Trino produce para un cliente que
// NO es un proyecto de la cartera -- solo se le hizo el booking, la gestion
// de ticketera, etc. Ese cliente tiene que poder dar conformidad del cierre
// de caja sin cuenta en la app, sin project_members y sin matriz de
// permisos. Ver scripts/migrations/099_event_external_signers.sql.

import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// ─── Token del link ─────────────────────────────────────────────────────────

/** Genera el secreto del link. El token en claro se le muestra UNA vez a
 * quien lo crea (para copiarlo y mandarlo por WhatsApp) -- en la base solo
 * queda el hash, igual que una contraseña. */
export function generateLinkToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Estado de un link de firma, derivado de la fila (no hay columna
 * `status` -- se calcula para que no pueda quedar desincronizada). */
export type ExternalSignerStatus = "firmado" | "revocado" | "vencido" | "pendiente";

export function externalSignerStatus(row: {
  signed_at: string | null;
  revoked_at: string | null;
  expires_at: string;
}): ExternalSignerStatus {
  if (row.signed_at) return "firmado";
  if (row.revoked_at) return "revocado";
  if (new Date(row.expires_at).getTime() < Date.now()) return "vencido";
  return "pendiente";
}

// ─── Codigo de verificacion al correo (OTP) ─────────────────────────────────

export const OTP_TTL_MINUTES = 15;
export const OTP_MAX_ATTEMPTS = 5;
/** Espera minima entre dos envios de codigo al mismo link -- evita usar el
 * endpoint publico como maquina de spam hacia el correo del firmante. */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** El hash del codigo va salteado con el token_hash del link: un codigo de
 * 6 digitos suelto se revienta por fuerza bruta en un segundo, pero el
 * token (32 bytes) hace que el hash guardado no sirva de nada sin el link. */
export function hashOtp(tokenHash: string, code: string): string {
  return createHash("sha256").update(`${tokenHash}:${code}`).digest("hex");
}

export function otpMatches(tokenHash: string, code: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const candidate = Buffer.from(hashOtp(tokenHash, code), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

/** "ennio@correo.cl" -> "en***@correo.cl". Para mostrarle al firmante a
 * qué casilla va a llegar el código sin exponer el correo completo a
 * cualquiera a quien le reenvíen el link. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  const visible = user.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(1, user.length - visible.length))}@${domain}`;
}

// ─── RUT ────────────────────────────────────────────────────────────────────

/** Normaliza a "12345678-5" (sin puntos, DV en mayuscula). A proposito NO
 * valida el digito verificador -- hay clientes extranjeros que firman con
 * pasaporte o RUT de empresa y el objetivo es que el dato quede registrado
 * tal como la persona lo declara, no rechazarlo. */
export function normalizeRut(input: string): string {
  const clean = input.replace(/[.\s]/g, "").toUpperCase();
  const match = clean.match(/^(\d+)-?([\dK])$/);
  if (!match) return input.trim();
  return `${match[1]}-${match[2]}`;
}

// ─── El documento que se firma ──────────────────────────────────────────────

export interface ClosingDocumentLineItem {
  label: string;
  responsable: string | null;
  amount: number;
}

export interface ClosingDocumentTicketTier {
  label: string;
  unitPrice: number;
  quantitySold: number;
}

export interface ClosingDocument {
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
  ticketTiers: ClosingDocumentTicketTier[];
  costItems: ClosingDocumentLineItem[];
  profitSplitProjectPct: number | null;
  profitSplitTrinoPct: number | null;
  profitSplitNote: string | null;
}

/** Arma el cierre de caja tal cual esta en este momento. Es EXACTAMENTE lo
 * mismo que aprueban los firmantes internos en /eventos/[id]/firmar -- el
 * cliente externo firma el mismo documento, no un resumen distinto. */
export async function buildClosingDocument(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  showId: string
): Promise<ClosingDocument | null> {
  const { data: show } = await admin
    .from("shows")
    .select(
      "id, name, date, venue, city, project_id, cost_sheet_closed_at, fee, ticket_income, expenses, profit_split_note, profit_split_project_pct, profit_split_trino_pct"
    )
    .eq("id", showId)
    .single();

  if (!show) return null;

  const [{ data: project }, { data: costRows }, { data: tierRows }] = await Promise.all([
    show.project_id
      ? admin.from("projects").select("name").eq("id", show.project_id).single()
      : Promise.resolve({ data: null }),
    admin.from("event_cost_items").select("label, responsable, amount").eq("show_id", showId).order("position"),
    admin.from("event_ticket_tiers").select("label, unit_price, quantity_sold").eq("show_id", showId).order("position"),
  ]);

  const fee = show.fee ?? null;
  const ticketIncome = show.ticket_income ?? null;
  const expenses = show.expenses ?? null;
  const ingresos = (fee ?? 0) + (ticketIncome ?? 0);

  return {
    eventId: show.id,
    eventName: show.name,
    date: show.date,
    venue: show.venue,
    city: show.city ?? null,
    projectName: project?.name ?? null,
    costSheetClosedAt: show.cost_sheet_closed_at ?? null,
    fee,
    ticketIncome,
    expenses,
    ingresos,
    utilidad: ingresos - (expenses ?? 0),
    ticketTiers: (tierRows ?? []).map((t: { label: string; unit_price: number; quantity_sold: number }) => ({
      label: t.label,
      unitPrice: t.unit_price,
      quantitySold: t.quantity_sold,
    })),
    costItems: (costRows ?? []).map((c: { label: string; responsable: string | null; amount: number }) => ({
      label: c.label,
      responsable: c.responsable ?? null,
      amount: c.amount,
    })),
    profitSplitProjectPct: show.profit_split_project_pct ?? null,
    profitSplitTrinoPct: show.profit_split_trino_pct ?? null,
    profitSplitNote: show.profit_split_note ?? null,
  };
}

/** JSON con las llaves siempre en el mismo orden -- sin esto el hash
 * cambiaria segun el orden en que Postgres devolvio las columnas, y dos
 * documentos identicos darian hashes distintos. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** Huella del documento firmado. Se calcula al mostrarlo y otra vez al
 * firmar (por si algo cambio entremedio), y queda guardada con la firma:
 * si mas adelante alguien reabre la caja y toca un monto, el hash del
 * cierre deja de calzar con el que se firmo y la diferencia es
 * demostrable. */
export function documentHash(doc: ClosingDocument): string {
  return createHash("sha256").update(stableStringify(doc)).digest("hex");
}

/** Los 8 primeros caracteres, para mostrarlo en pantalla sin que sea un
 * muro de 64 digitos. */
export function shortHash(hash: string): string {
  return hash.slice(0, 8).toUpperCase();
}

// ─── Comprobante en PDF ─────────────────────────────────────────────────────

const CLP = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "--";
  return CLP.format(cents / 100);
}

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

/** pdf-lib con las fuentes estandar solo sabe escribir WinAnsi (Latin-1):
 * cualquier caracter fuera de ese set revienta el documento entero. Las
 * comillas curvas y las rayas largas que salen de los textos pegados por
 * el usuario son el caso tipico. */
function sanitize(text: string): string {
  return text
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "");
}

export interface ReceiptEvidence {
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

/** Comprobante de la firma: el documento que se firmo + toda la evidencia
 * de quien lo firmo y como se verifico. Se manda adjunto por correo al
 * firmante y al equipo, y se puede volver a descargar desde el link. */
export async function buildReceiptPdf(doc: ClosingDocument, ev: ReceiptEvidence): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const WIDTH = 595.28;
  const HEIGHT = 841.89;
  const MARGIN = 50;
  const RIGHT = WIDTH - MARGIN;

  let page = pdf.addPage([WIDTH, HEIGHT]);
  let y = HEIGHT - MARGIN;

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) {
      page = pdf.addPage([WIDTH, HEIGHT]);
      y = HEIGHT - MARGIN;
    }
  }

  function text(value: string, opts: { size?: number; bold?: boolean; gray?: boolean; gap?: number } = {}) {
    const size = opts.size ?? 10;
    ensureSpace(size + 6);
    y -= size + 2;
    page.drawText(sanitize(value), {
      x: MARGIN,
      y,
      size,
      font: opts.bold ? bold : regular,
      color: opts.gray ? rgb(0.45, 0.45, 0.5) : rgb(0.08, 0.09, 0.17),
    });
    y -= opts.gap ?? 2;
  }

  /** Fila etiqueta-izquierda / valor-derecha, como una linea de planilla. */
  function row(label: string, value: string, opts: { bold?: boolean; size?: number } = {}) {
    const size = opts.size ?? 10;
    ensureSpace(size + 6);
    y -= size + 2;
    const font = opts.bold ? bold : regular;
    const clean = sanitize(value);
    page.drawText(sanitize(label), { x: MARGIN, y, size, font, color: rgb(0.08, 0.09, 0.17) });
    page.drawText(clean, {
      x: RIGHT - font.widthOfTextAtSize(clean, size),
      y,
      size,
      font,
      color: rgb(0.08, 0.09, 0.17),
    });
    y -= 2;
  }

  function rule(gap = 8) {
    ensureSpace(gap + 2);
    y -= gap;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: RIGHT, y },
      thickness: 0.5,
      color: rgb(0.85, 0.86, 0.9),
    });
    y -= gap;
  }

  function heading(value: string) {
    ensureSpace(24);
    y -= 12;
    text(value, { size: 9, bold: true, gray: true });
  }

  /** Parrafo con corte de linea a lo ancho de la pagina. */
  function paragraph(value: string, size = 8.5) {
    const words = sanitize(value).split(/\s+/);
    const maxWidth = RIGHT - MARGIN;
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (regular.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        text(line, { size, gray: true, gap: 0 });
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) text(line, { size, gray: true, gap: 0 });
  }

  // ── Encabezado
  text("COMPROBANTE DE FIRMA ELECTRONICA SIMPLE", { size: 14, bold: true });
  text("Conformidad de cierre de caja de evento", { size: 10, gray: true });
  rule();

  // ── Documento firmado
  heading("DOCUMENTO FIRMADO");
  text(doc.eventName, { size: 12, bold: true });
  text(
    [doc.date, doc.venue, doc.city].filter(Boolean).join(" - ") +
      (doc.projectName ? ` (${doc.projectName})` : ""),
    { size: 9, gray: true }
  );
  y -= 4;
  row("Fee / cache", formatCents(doc.fee));
  row("Venta de entradas", formatCents(doc.ticketIncome));
  row("Total ingresos", formatCents(doc.ingresos), { bold: true });
  row("Total egresos", formatCents(doc.expenses));
  row("Utilidad", formatCents(doc.utilidad), { bold: true });

  if (doc.ticketTiers.length > 0) {
    heading("VENTA DE ENTRADAS");
    for (const t of doc.ticketTiers) {
      row(`${t.label} (${t.quantitySold} x ${formatCents(t.unitPrice)})`, formatCents(t.unitPrice * t.quantitySold), { size: 9 });
    }
  }

  if (doc.costItems.length > 0) {
    heading("COSTOS");
    for (const c of doc.costItems) {
      row(c.responsable ? `${c.label} - ${c.responsable}` : c.label, formatCents(c.amount), { size: 9 });
    }
  }

  if (doc.profitSplitProjectPct != null || doc.profitSplitTrinoPct != null || doc.profitSplitNote) {
    heading("REPARTO DE UTILIDAD");
    if (doc.profitSplitProjectPct != null) {
      row(
        `${doc.profitSplitProjectPct}% ${doc.projectName || "Proyecto"}`,
        formatCents(Math.round((doc.utilidad * doc.profitSplitProjectPct) / 100)),
        { size: 9 }
      );
    }
    if (doc.profitSplitTrinoPct != null) {
      row(`${doc.profitSplitTrinoPct}% Sello`, formatCents(Math.round((doc.utilidad * doc.profitSplitTrinoPct) / 100)), { size: 9 });
    }
    if (doc.profitSplitNote) {
      y -= 4;
      paragraph(doc.profitSplitNote, 9);
    }
  }

  rule();

  // ── Quien firmo
  heading("FIRMANTE");
  row("Nombre", ev.signerName, { bold: true });
  row("RUT / identificacion", ev.signerRut);
  row("Correo", ev.signerEmail);
  row("Telefono", ev.signerPhone);
  if (ev.roleLabel) row("Calidad en que firma", ev.roleLabel);

  // ── Evidencia
  heading("EVIDENCIA DE LA FIRMA");
  row("Fecha y hora de la firma", formatDateTime(ev.signedAt), { size: 9 });
  row("Codigo enviado a", ev.otpSentTo ?? "--", { size: 9 });
  row("Codigo verificado", formatDateTime(ev.otpVerifiedAt), { size: 9 });
  row("Direccion IP", ev.ipAddress ?? "--", { size: 9 });
  row("Link emitido", formatDateTime(ev.linkCreatedAt), { size: 9 });
  row("Primera apertura del link", formatDateTime(ev.firstViewedAt), { size: 9 });
  if (ev.userAgent) {
    y -= 2;
    text("Dispositivo / navegador", { size: 9 });
    paragraph(ev.userAgent, 8);
  }
  y -= 4;
  text("Huella (SHA-256) del documento firmado", { size: 9 });
  paragraph(ev.documentHash, 8);

  rule();
  paragraph(
    "Este comprobante da cuenta de una firma electronica simple en los terminos de la Ley 19.799. " +
      "El firmante se identifico con los datos declarados mas arriba y acredito el control del correo " +
      "indicado mediante un codigo de un solo uso enviado a esa casilla. La huella SHA-256 corresponde al " +
      "contenido exacto del cierre de caja tal como se le mostro al momento de firmar: cualquier modificacion " +
      "posterior de esas cifras produce una huella distinta.",
    8
  );
  paragraph("Generado por Artist Pro - artistpro.app", 8);

  return pdf.save();
}

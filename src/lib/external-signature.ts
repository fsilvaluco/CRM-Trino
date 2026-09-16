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
import { nuevoPdf, type EscritorPdf } from "@/lib/pdf-writer";
import { profitSplitLabels } from "@/lib/profit-split";

/** Resuelve los nombres del reparto al armar el documento, para que el hash
 * y el PDF queden con el nombre que realmente se le mostro al firmante --
 * no con uno calculado despues. */
function profitSplitLabelsForDoc(event: {
  profitSplitProjectLabel: string | null;
  profitSplitTrinoLabel: string | null;
  projectName: string | null;
}): { profitSplitProjectLabel: string; profitSplitTrinoLabel: string } {
  const labels = profitSplitLabels(event);
  return { profitSplitProjectLabel: labels.project, profitSplitTrinoLabel: labels.trino };
}

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
export type ExternalSignerStatus = "firmado" | "invalidado" | "revocado" | "vencido" | "pendiente";

export function externalSignerStatus(row: {
  signed_at: string | null;
  revoked_at: string | null;
  expires_at: string;
  invalidated_at?: string | null;
}): ExternalSignerStatus {
  // "invalidado" gana sobre "firmado": la firma existe y su evidencia se
  // conserva entera, pero aprobaba un cierre que se reabrio y ya no es el
  // vigente (migracion 103). No cuenta como firma y su link no sirve mas.
  if (row.invalidated_at) return "invalidado";
  if (row.signed_at) return "firmado";
  if (row.revoked_at) return "revocado";
  if (new Date(row.expires_at).getTime() < Date.now()) return "vencido";
  return "pendiente";
}

/** Fila de event_external_signers, como la necesita el recuadro de
 * Aprobacion. */
export interface ExternalSignerRow {
  id: string;
  role_label: string | null;
  invited_name: string | null;
  invited_email?: string | null;
  signer_name: string | null;
  signer_email?: string | null;
  signed_at: string | null;
  invalidated_at?: string | null;
  revoked_at: string | null;
  expires_at: string;
  created_at?: string | null;
}

export interface ApprovalExternalSigner {
  id: string;
  name: string;
  roleLabel: string | null;
  signedAt: string | null;
}

/**
 * Los firmantes externos tal como van en el recuadro de Aprobacion: UNA
 * fila por persona, no una por link emitido.
 *
 * Hace falta porque una misma persona puede tener varias filas: cada vez
 * que se le reemplaza el link (se perdio el correo, se reabrio el cierre)
 * se emite uno nuevo y el anterior queda de historia. Sin agrupar, el
 * recuadro mostraba al mismo cliente dos veces, las dos "Pendiente"
 * -- reportado por Francisco el 16 sep 2026.
 *
 * Se agrupa por correo (o por nombre si no hay) y de cada persona se
 * elige su fila mas representativa: una firma vigente gana sobre un link
 * en pie, y este sobre uno muerto (invalidado o vencido). Una fila muerta
 * igual se muestra, como pendiente: que el cliente no haya firmado tiene
 * que verse, aunque todavia no le hayan mandado el link nuevo.
 *
 * Los links ANULADOS a mano no aparecen -- se cancelaron a proposito.
 */
export function approvalExternalSigners(rows: ExternalSignerRow[]): ApprovalExternalSigner[] {
  const vivo = (r: ExternalSignerRow) => new Date(r.expires_at).getTime() >= Date.now();
  // 3 = firmo y su firma sigue valiendo, 2 = link en pie, 1 = link muerto
  const rango = (r: ExternalSignerRow): number => {
    if (r.signed_at && !r.invalidated_at) return 3;
    if (!r.signed_at && !r.invalidated_at && vivo(r)) return 2;
    return 1;
  };

  const porPersona = new Map<string, ExternalSignerRow>();
  for (const r of rows) {
    if (r.revoked_at) continue;
    const clave = (r.signer_email || r.invited_email || r.signer_name || r.invited_name || r.id)
      .toString()
      .trim()
      .toLowerCase();
    const previa = porPersona.get(clave);
    if (!previa) {
      porPersona.set(clave, r);
      continue;
    }
    const mejor =
      rango(r) > rango(previa) ||
      (rango(r) === rango(previa) &&
        new Date(r.created_at ?? 0).getTime() > new Date(previa.created_at ?? 0).getTime());
    if (mejor) porPersona.set(clave, r);
  }

  return [...porPersona.values()].map((r) => ({
    id: r.id,
    name: r.signer_name || r.invited_name || r.role_label || "Firmante externo",
    roleLabel: r.role_label,
    // Una firma invalidada por reapertura cuenta como pendiente: su
    // conformidad era sobre cifras que ya no son las vigentes.
    signedAt: r.invalidated_at ? null : r.signed_at,
  }));
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
  /** Path del comprobante en el bucket privado "finances". Va en el
   * documento para poder abrirlo desde la pantalla de firma, pero queda
   * FUERA del hash -- ver documentHash(). */
  comprobanteUrl: string | null;
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
  // Como se llama cada lado del reparto (migracion 100). Ya resueltos: en
  // un evento externo dicen el cliente y "Trino", no el proyecto y "Sello".
  profitSplitProjectLabel: string;
  profitSplitTrinoLabel: string;
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
      "id, name, date, venue, city, project_id, cost_sheet_closed_at, fee, ticket_income, expenses, profit_split_note, profit_split_project_pct, profit_split_trino_pct, profit_split_project_label, profit_split_trino_label"
    )
    .eq("id", showId)
    .single();

  if (!show) return null;

  const [{ data: project }, { data: costRows }, { data: tierRows }] = await Promise.all([
    show.project_id
      ? admin.from("projects").select("name").eq("id", show.project_id).single()
      : Promise.resolve({ data: null }),
    admin
      .from("event_cost_items")
      .select("label, responsable, amount, comprobante_url")
      .eq("show_id", showId)
      .order("position"),
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
    costItems: (costRows ?? []).map(
      (c: { label: string; responsable: string | null; amount: number; comprobante_url: string | null }) => ({
        label: c.label,
        responsable: c.responsable ?? null,
        amount: c.amount,
        comprobanteUrl: c.comprobante_url ?? null,
      })
    ),
    profitSplitProjectPct: show.profit_split_project_pct ?? null,
    profitSplitTrinoPct: show.profit_split_trino_pct ?? null,
    ...profitSplitLabelsForDoc({
      profitSplitProjectLabel: show.profit_split_project_label ?? null,
      profitSplitTrinoLabel: show.profit_split_trino_label ?? null,
      projectName: project?.name ?? null,
    }),
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
  // El path del comprobante queda fuera: volver a subir la MISMA boleta
  // genera un path nuevo sin que cambie ni un peso del cierre, y eso no
  // tiene por qué invalidar una firma. Lo que se firma son las cifras.
  const forHash = {
    ...doc,
    costItems: doc.costItems.map(({ label, responsable, amount }) => ({ label, responsable, amount })),
  };
  return createHash("sha256").update(stableStringify(forHash)).digest("hex");
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

/** El cierre de caja en si: el bloque que es identico en el comprobante de
 * una firma y en el acta de todas. */
function escribirDocumento(w: EscritorPdf, doc: ClosingDocument) {
  w.heading("DOCUMENTO FIRMADO");
  w.text(doc.eventName, { size: 12, bold: true });
  w.text(
    [doc.date, doc.venue, doc.city].filter(Boolean).join(" - ") +
      (doc.projectName ? ` (${doc.projectName})` : ""),
    { size: 9, gray: true }
  );
  w.space(4);
  w.row("Fee / cache", formatCents(doc.fee));
  w.row("Venta de entradas", formatCents(doc.ticketIncome));
  w.row("Total ingresos", formatCents(doc.ingresos), { bold: true });
  w.row("Total egresos", formatCents(doc.expenses));
  w.row("Utilidad", formatCents(doc.utilidad), { bold: true });

  if (doc.ticketTiers.length > 0) {
    w.heading("VENTA DE ENTRADAS");
    for (const t of doc.ticketTiers) {
      w.row(
        `${t.label} (${t.quantitySold} x ${formatCents(t.unitPrice)})`,
        formatCents(t.unitPrice * t.quantitySold),
        { size: 9 }
      );
    }
  }

  if (doc.costItems.length > 0) {
    w.heading("COSTOS");
    for (const c of doc.costItems) {
      w.row(c.responsable ? `${c.label} - ${c.responsable}` : c.label, formatCents(c.amount), { size: 9 });
    }
  }

  if (doc.profitSplitProjectPct != null || doc.profitSplitTrinoPct != null || doc.profitSplitNote) {
    w.heading("REPARTO DE UTILIDAD");
    if (doc.profitSplitProjectPct != null) {
      w.row(
        `${doc.profitSplitProjectPct}% ${doc.profitSplitProjectLabel}`,
        formatCents(Math.round((doc.utilidad * doc.profitSplitProjectPct) / 100)),
        { size: 9 }
      );
    }
    if (doc.profitSplitTrinoPct != null) {
      w.row(
        `${doc.profitSplitTrinoPct}% ${doc.profitSplitTrinoLabel}`,
        formatCents(Math.round((doc.utilidad * doc.profitSplitTrinoPct) / 100)),
        { size: 9 }
      );
    }
    if (doc.profitSplitNote) {
      w.space(4);
      w.paragraph(doc.profitSplitNote, 9);
    }
  }
}

const NOTA_LEY =
  "Este comprobante da cuenta de una firma electronica simple en los terminos de la Ley 19.799. " +
  "Cada firmante se identifico con los datos declarados mas arriba y acredito el control de su correo " +
  "mediante un codigo de un solo uso enviado a esa casilla. La huella SHA-256 corresponde al " +
  "contenido exacto del cierre de caja tal como se le mostro al momento de firmar: cualquier modificacion " +
  "posterior de esas cifras produce una huella distinta.";

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

/** Comprobante de UNA firma: el documento que se firmo + toda la evidencia
 * de quien lo firmo y como se verifico. Se manda adjunto por correo al
 * firmante y al equipo, y se puede volver a descargar desde el link. */
export async function buildReceiptPdf(doc: ClosingDocument, ev: ReceiptEvidence): Promise<Uint8Array> {
  const w = await nuevoPdf();

  w.text("COMPROBANTE DE FIRMA ELECTRONICA SIMPLE", { size: 14, bold: true });
  w.text("Conformidad de cierre de caja de evento", { size: 10, gray: true });
  w.rule();

  escribirDocumento(w, doc);
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
  w.row("Link emitido", formatDateTime(ev.linkCreatedAt), { size: 9 });
  w.row("Primera apertura del link", formatDateTime(ev.firstViewedAt), { size: 9 });
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

// ─── Acta de cierre firmado (todas las firmas juntas) ───────────────────────

export interface ActaSigner {
  /** "equipo" = firmante interno con cuenta; "contraparte" = cliente externo. */
  tipo: "equipo" | "contraparte";
  name: string;
  rut: string | null;
  email: string | null;
  phone: string | null;
  roleLabel: string | null;
  signedAt: string;
  otpVerifiedAt: string | null;
  ipAddress: string | null;
  documentHash: string | null;
}

/**
 * El acta del cierre: el mismo documento, con TODAS las firmas juntas y la
 * evidencia de cada una. Se manda cuando termina de firmar todo el mundo --
 * el comprobante individual le sirve a cada firmante, esto le sirve al
 * evento.
 *
 * Si alguna huella no calza con la del documento actual se dice
 * explicitamente: significa que esa persona firmo una version distinta de
 * las cifras, y es justo lo que un acta tiene que dejar en evidencia en vez
 * de esconder.
 */
export async function buildActaPdf(
  doc: ClosingDocument,
  firmantes: ActaSigner[],
  opts: { generadoEl?: string } = {}
): Promise<Uint8Array> {
  const w = await nuevoPdf();
  const hashActual = documentHash(doc);

  w.text("ACTA DE CIERRE DE CAJA FIRMADO", { size: 14, bold: true });
  w.text(`${firmantes.length} ${firmantes.length === 1 ? "firma registrada" : "firmas registradas"}`, {
    size: 10,
    gray: true,
  });
  w.rule();

  escribirDocumento(w, doc);
  w.rule();

  const equipo = firmantes.filter((f) => f.tipo === "equipo");
  const contraparte = firmantes.filter((f) => f.tipo === "contraparte");

  function escribirFirmante(f: ActaSigner) {
    w.space(6);
    w.text(f.roleLabel ? `${f.name} (${f.roleLabel})` : f.name, { size: 10, bold: true });
    w.row("RUT / identificacion", f.rut ?? "--", { size: 9 });
    w.row("Correo", f.email ?? "--", { size: 9 });
    w.row("Telefono", f.phone ?? "--", { size: 9 });
    w.row("Firmo el", formatDateTime(f.signedAt), { size: 9 });
    w.row("Codigo verificado", formatDateTime(f.otpVerifiedAt), { size: 9 });
    w.row("Direccion IP", f.ipAddress ?? "--", { size: 9 });
    if (!f.documentHash) {
      // Firmas anteriores a las migraciones 099/102, cuando firmar era un
      // click sin huella. Se dice, no se disimula.
      w.paragraph("Firma registrada antes de que se guardara la huella del documento.", 8);
    } else if (f.documentHash !== hashActual) {
      w.paragraph(
        `ATENCION: firmo una version distinta del cierre (huella ${f.documentHash.slice(0, 16)}...).`,
        8
      );
    }
  }

  if (equipo.length > 0) {
    w.heading("FIRMAS DEL EQUIPO");
    equipo.forEach(escribirFirmante);
  }
  if (contraparte.length > 0) {
    w.heading("FIRMAS DE LA CONTRAPARTE");
    contraparte.forEach(escribirFirmante);
  }

  w.rule();
  w.text("Huella (SHA-256) del cierre al generarse esta acta", { size: 9 });
  w.paragraph(hashActual, 8);
  w.space(4);
  w.row("Acta generada el", formatDateTime(opts.generadoEl ?? new Date().toISOString()), { size: 9 });

  w.rule();
  w.paragraph(NOTA_LEY, 8);
  w.paragraph("Generado por Artist Pro - artistpro.app", 8);

  return w.save();
}

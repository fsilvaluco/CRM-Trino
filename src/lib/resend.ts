const RESEND_API_KEY = process.env.RESEND_API_KEY;
// onboarding@resend.dev funciona sin verificar ningun dominio -- sirve para
// probar de inmediato. Una vez que artistpro.app este verificado en Resend,
// cambiar RESEND_FROM_ADDRESS a algo como "Artist Pro <notificaciones@artistpro.app>".
const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS || "Artist Pro <onboarding@resend.dev>";

export function isResendEnabled(): boolean {
  return !!RESEND_API_KEY;
}

/** Envia un correo via Resend. Si no hay API key configurada, no hace
 * nada -- el invite en si (via Supabase) ya funciona igual, solo que sin
 * el correo lindo hasta que se configure Resend. */
export async function sendEmail(params: { to: string; subject: string; html: string }): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn("[resend] RESEND_API_KEY no configurado -- correo no enviado", { to: params.to, subject: params.subject });
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[resend] fallo al enviar correo", { status: res.status, body });
    throw new Error(`No se pudo enviar el correo (status ${res.status})`);
  }
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: "Vas a poder gestionar el equipo y tener acceso total a tratos y tareas de este proyecto.",
  member: "Vas a poder crear y gestionar tratos, contactos, empresas y tareas de este proyecto.",
  artist: "Vas a poder ver tus tratos y gestionar tus propias tareas dentro de este proyecto.",
  staff: "Vas a poder ver tus tareas y los eventos de este proyecto.",
};

export function buildInviteEmailHtml(params: {
  inviterName: string;
  inviteeName?: string | null;
  projectName: string | null;
  role: string;
  actionLink: string;
}): string {
  const { inviterName, inviteeName, projectName, role, actionLink } = params;
  const projectLine = projectName
    ? `<strong>${inviterName}</strong> te invitó a unirte al proyecto <strong>${projectName}</strong> en Artist Pro.`
    : `<strong>${inviterName}</strong> te invitó a unirte a Artist Pro.`;
  const roleLine = ROLE_DESCRIPTIONS[role] ?? "";
  const greeting = inviteeName
    ? `<p style="font-size: 16px; color: #14162B; margin-bottom: 4px;">Hola ${inviteeName},</p>`
    : "";

  return `
    <div style="font-family: -apple-system, Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
      <img src="https://artistpro.app/logo-black.png" alt="Artist Pro" style="width: 120px; height: auto; margin-bottom: 20px;" />
      ${greeting}
      <p style="font-size: 16px; color: #14162B; line-height: 1.5;">${projectLine}</p>
      ${roleLine ? `<p style="font-size: 14px; color: #14162B99; line-height: 1.5;">${roleLine}</p>` : ""}
      <a href="${actionLink}" target="_blank" rel="noopener noreferrer"
        style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #4338CA; color: white; text-decoration: none; border-radius: 100px; font-size: 14px; font-weight: 600;">
        Aceptar invitación
      </a>
      <p style="font-size: 12px; color: #14162B66; margin-top: 32px;">
        Si no esperabas esta invitación, puedes ignorar este correo.
      </p>
    </div>
  `;
}

const CLP_FMT = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

function formatCentsForEmail(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return CLP_FMT.format(cents / 100);
}

function formatDateForEmail(iso: string): string {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

function formatDateTimeForEmail(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-CL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

/**
 * Correo de "Informar cierre" -- se manda a todos los que firmaron (ver
 * costs/inform/route.ts) una vez que el cierre de caja de un evento quedó
 * aprobado por todos los firmantes requeridos. Resumen completo: venta de
 * entradas, costos, utilidad y quién aprobó.
 */
export function buildCostSheetSummaryEmailHtml(params: {
  eventName: string;
  eventDate: string;
  venue: string;
  projectName: string | null;
  fee: number | null;
  ticketIncome: number | null;
  expenses: number | null;
  ticketTiers: { label: string; unitPrice: number; quantitySold: number }[];
  costItems: { label: string; responsable: string | null; amount: number }[];
  profitSplitNote: string | null;
  profitSplitProjectPct: number | null;
  profitSplitTrinoPct: number | null;
  signers: { name: string; signedAt: string }[];
  detailUrl: string;
}): string {
  const {
    eventName, eventDate, venue, projectName, fee, ticketIncome, expenses, ticketTiers, costItems,
    profitSplitNote, profitSplitProjectPct, profitSplitTrinoPct, signers, detailUrl,
  } = params;
  const ingresos = (fee ?? 0) + (ticketIncome ?? 0);
  const utilidad = ingresos - (expenses ?? 0);
  const projectPct = profitSplitProjectPct ?? 70;
  const trinoPct = profitSplitTrinoPct ?? 30;
  const projectSplit = Math.round((utilidad * projectPct) / 100);
  const trinoSplit = Math.round((utilidad * trinoPct) / 100);
  const ticketTotal = ticketTiers.reduce((sum, t) => sum + t.unitPrice * t.quantitySold, 0);

  const row = (label: string, right: string) =>
    `<tr><td style="padding:4px 0;color:#14162B;">${label}</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#14162B;white-space:nowrap;">${right}</td></tr>`;

  const ticketRows = ticketTiers
    .map((t) => row(`${t.label} (${t.quantitySold})`, formatCentsForEmail(t.unitPrice * t.quantitySold)))
    .join("");

  const costRows = costItems
    .map((c) => row(c.responsable ? `${c.label} -- ${c.responsable}` : c.label, formatCentsForEmail(c.amount)))
    .join("");

  const signerRows = signers
    .map((s) => `<li style="margin-bottom:4px;">${s.name} -- <span style="color:#14162B99;">${formatDateTimeForEmail(s.signedAt)}</span></li>`)
    .join("");

  return `
    <div style="font-family: -apple-system, Inter, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
      <img src="https://artistpro.app/logo-black.png" alt="Artist Pro" style="width: 120px; height: auto; margin-bottom: 20px;" />
      <p style="font-size: 18px; font-weight: 700; color: #14162B; margin-bottom: 4px;">Cierre de caja aprobado</p>
      <p style="font-size: 15px; color: #14162B; margin-bottom: 2px;"><strong>${eventName}</strong>${projectName ? ` -- ${projectName}` : ""}</p>
      <p style="font-size: 13px; color: #14162B99; margin-bottom: 20px; text-transform: capitalize;">${formatDateForEmail(eventDate)} · ${venue}</p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px;">
        ${row("Ingresos", formatCentsForEmail(ingresos))}
        ${row("Egresos", formatCentsForEmail(expenses))}
      </table>
      <p style="font-size:16px;font-weight:700;color:${utilidad >= 0 ? "#15803d" : "#b91c1c"};margin:8px 0 20px;">
        Utilidad: ${formatCentsForEmail(utilidad)}
      </p>

      ${ticketTiers.length > 0 ? `
      <p style="font-size:13px;font-weight:600;color:#14162B;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;border-top:1px solid #E5E7EB;padding-top:16px;">Venta de entradas</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px;">
        ${ticketRows}
      </table>
      <p style="font-size:14px;font-weight:700;color:#14162B;margin-bottom:20px;">Total ingresos entradas: ${formatCentsForEmail(ticketTotal)}</p>
      ` : ""}

      ${costItems.length > 0 ? `
      <p style="font-size:13px;font-weight:600;color:#14162B;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;border-top:1px solid #E5E7EB;padding-top:16px;">Costos</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
        ${costRows}
      </table>
      ` : ""}

      <p style="font-size:13px;font-weight:600;color:#14162B;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;border-top:1px solid #E5E7EB;padding-top:16px;">Reparto de utilidad</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:${profitSplitNote ? "8px" : "20px"};">
        ${row(`${projectPct}% ${projectName || "Proyecto"}`, formatCentsForEmail(projectSplit))}
        ${row(`${trinoPct}% Sello`, formatCentsForEmail(trinoSplit))}
      </table>
      ${profitSplitNote ? `
      <p style="font-size:13px;color:#14162B;line-height:1.5;margin-bottom:20px;">
        <strong>Nota:</strong> ${profitSplitNote.replace(/\n/g, "<br/>")}
      </p>
      ` : ""}

      <p style="font-size:13px;font-weight:600;color:#14162B;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;border-top:1px solid #E5E7EB;padding-top:16px;">Aprobado por</p>
      <ul style="font-size:13px;color:#14162B;padding-left:18px;margin-bottom:24px;">
        ${signerRows}
      </ul>

      <a href="${detailUrl}" target="_blank" rel="noopener noreferrer"
        style="display: inline-block; padding: 12px 24px; background: #4338CA; color: white; text-decoration: none; border-radius: 100px; font-size: 14px; font-weight: 600;">
        Ver detalle completo
      </a>
    </div>
  `;
}

function settlementTypeLabelForEmail(type: string): string {
  if (type === "regalias") return "Regalías";
  if (type === "merch") return "Merchandising";
  return "Liquidación";
}

/**
 * Correo de "Pendiente de firma" -- se manda a cada firmante elegido a
 * mano al crear una liquidación (regalías/merch, ver
 * scripts/migrations/088_settlement_required_signers.sql), con un botón
 * directo a la pantalla donde puede firmarla.
 */
export function buildSettlementPendingSignatureEmailHtml(params: {
  signerName: string | null;
  type: string;
  payerName: string;
  payeeName: string;
  sourceAmount: number;
  payoutAmount: number;
  percentage: number;
  signUrl: string;
}): string {
  const { signerName, type, payerName, payeeName, sourceAmount, payoutAmount, percentage, signUrl } = params;
  const greeting = signerName ? `<p style="font-size: 16px; color: #14162B; margin-bottom: 4px;">Hola ${signerName},</p>` : "";

  return `
    <div style="font-family: -apple-system, Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
      <img src="https://artistpro.app/logo-black.png" alt="Artist Pro" style="width: 120px; height: auto; margin-bottom: 20px;" />
      ${greeting}
      <p style="font-size: 16px; color: #14162B; line-height: 1.5;">
        Hay una nueva liquidación de <strong>${settlementTypeLabelForEmail(type)}</strong> pendiente de tu firma:
      </p>
      <p style="font-size: 14px; color: #14162B; line-height: 1.6; background:#F4F4F8; border-radius:12px; padding:14px 16px; margin: 16px 0;">
        <strong>${payerName} → ${payeeName}</strong><br/>
        Origen: ${CLP_FMT.format(sourceAmount)}<br/>
        A pagar (${percentage}%): ${CLP_FMT.format(payoutAmount)}
      </p>
      <a href="${signUrl}" target="_blank" rel="noopener noreferrer"
        style="display: inline-block; margin-top: 4px; padding: 12px 24px; background: #4338CA; color: white; text-decoration: none; border-radius: 100px; font-size: 14px; font-weight: 600;">
        Revisar y firmar
      </a>
    </div>
  `;
}

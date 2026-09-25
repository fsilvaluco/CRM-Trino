import { escapeHtml } from "@/lib/link-redirect";

// Correos del flujo de testimonios. Todo lo que escribio la persona pasa
// por escapeHtml (incluida la comilla simple) antes de ir al HTML.

function esc(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

const WRAP_OPEN = `<div style="font-family: -apple-system, Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">`;

function brandHeader(brandName: string): string {
  return `<p style="font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #14162B; margin: 0 0 20px;">${esc(brandName)}</p>`;
}

function stars(rating: number): string {
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return "★".repeat(r) + "☆".repeat(5 - r);
}

export function buildTestimonialCodeEmailHtml(params: {
  brandName: string;
  name: string;
  code: string;
  minutes: number;
}): string {
  const { brandName, name, code, minutes } = params;
  return `
    ${WRAP_OPEN}
      ${brandHeader(brandName)}
      <p style="font-size: 16px; color: #14162B; margin-bottom: 4px;">Hola ${esc(name.split(" ")[0])},</p>
      <p style="font-size: 15px; color: #14162B; line-height: 1.5;">
        Gracias por dejarnos tu testimonio. Para publicarlo necesitamos confirmar tu correo. Tu código es:
      </p>
      <p style="font-size: 34px; font-weight: 700; letter-spacing: 10px; color: #14162B; background: #F4F4F8; border-radius: 12px; padding: 18px; text-align: center; margin: 20px 0;">
        ${esc(code)}
      </p>
      <p style="font-size: 13px; color: #14162B99; line-height: 1.5;">
        Vence en ${minutes} minutos y sirve una sola vez. Después de confirmarlo, el equipo de ${esc(brandName)} lo revisa antes de publicarlo.
      </p>
      <p style="font-size: 12px; color: #14162B66; margin-top: 28px;">
        Si no dejaste ningún testimonio, ignora este correo: sin el código no se publica nada.
      </p>
    </div>
  `;
}

export function buildTestimonialModerationEmailHtml(params: {
  brandName: string;
  name: string;
  email: string;
  rating: number;
  body: string;
  relation: string | null;
  approveUrl: string;
  rejectUrl: string;
  expiresDays: number;
  /** Seccion Testimonios de Artist Pro, para moderar sin depender de los links. */
  appUrl?: string;
}): string {
  const { brandName, name, email, rating, body, relation, approveUrl, rejectUrl, expiresDays, appUrl } = params;
  const button = (href: string, label: string, color: string) =>
    `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer"
      style="display: inline-block; margin: 4px 8px 4px 0; padding: 12px 24px; background: ${color}; color: white; text-decoration: none; border-radius: 100px; font-size: 14px; font-weight: 600;">${label}</a>`;

  return `
    ${WRAP_OPEN}
      ${brandHeader(brandName)}
      <p style="font-size: 18px; font-weight: 700; color: #14162B; margin-bottom: 4px;">Nuevo testimonio verificado</p>
      <p style="font-size: 13px; color: #14162B99; margin-bottom: 16px;">La persona confirmó su correo con el código. Falta tu aprobación para publicarlo.</p>
      <div style="background:#F4F4F8; border-radius:12px; padding:16px; margin-bottom: 16px;">
        <p style="font-size: 20px; color: #D97706; margin: 0 0 8px; letter-spacing: 2px;">${stars(rating)}</p>
        <p style="font-size: 15px; color: #14162B; line-height: 1.6; margin: 0 0 12px; white-space: pre-wrap;">${esc(body)}</p>
        <p style="font-size: 14px; color: #14162B; margin: 0;"><strong>${esc(name)}</strong>${relation ? ` · ${esc(relation)}` : ""}</p>
        <p style="font-size: 12px; color: #14162B99; margin: 4px 0 0;">${esc(email)}</p>
      </div>
      ${button(approveUrl, "Aprobar", "#15803d")}
      ${button(rejectUrl, "Rechazar", "#b91c1c")}
      ${appUrl ? `<p style="font-size: 13px; color: #14162B; margin-top: 16px; line-height: 1.5;">
        También puedes revisarlo en Artist Pro: <a href="${esc(appUrl)}" target="_blank" rel="noopener noreferrer" style="color: #4338ca;">${esc(appUrl)}</a>
      </p>` : ""}
      <p style="font-size: 12px; color: #14162B66; margin-top: 24px; line-height: 1.5;">
        Cada link abre una página de confirmación. Los links vencen en ${expiresDays} días; puedes cambiar la decisión mientras estén vigentes.
        No reenvíes este correo: quien tenga los links puede moderar el testimonio.
      </p>
    </div>
  `;
}

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
};

export function buildInviteEmailHtml(params: {
  inviterName: string;
  projectName: string | null;
  role: string;
  actionLink: string;
}): string {
  const { inviterName, projectName, role, actionLink } = params;
  const projectLine = projectName
    ? `<strong>${inviterName}</strong> te invitó a unirte al proyecto <strong>${projectName}</strong> en Artist Pro.`
    : `<strong>${inviterName}</strong> te invitó a unirte a Artist Pro.`;
  const roleLine = ROLE_DESCRIPTIONS[role] ?? "";

  return `
    <div style="font-family: -apple-system, Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
      <div style="width: 40px; height: 40px; border-radius: 10px; background: #4338CA; display: flex; align-items: center; justify-content: center; margin-bottom: 24px;">
        <span style="color: white; font-weight: 700; font-size: 14px; line-height: 40px; text-align: center; display: block;">AP</span>
      </div>
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

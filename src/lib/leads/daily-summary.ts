// Resumen diario de los tratos de SiSoy a Telegram, con el proximo paso
// sugerido para cada uno. Reglas deterministas (sin IA, sin costo) sobre la
// vista sisoy_deals_daily: etapa + horas sin contacto + fecha del evento +
// capacidad (max. 3 eventos por fin de semana) + fechas Fundador restantes.
import { createAdminClient } from "@/lib/supabase-admin";
import { sendTelegram, esc } from "@/lib/meta-ads/telegram";

const FUNDADOR_CUPOS = 5;
const FUNDADOR_DESDE = "2026-10-01";
const FUNDADOR_HASTA = "2027-03-31";
const CAPACIDAD_FINDE = 3;

interface DealRow {
  id: string;
  title: string;
  etapa: string;
  etapa_orden: number;
  contacto: string | null;
  phone: string | null;
  fecha_evento: string | null;
  lugar: string | null;
  comuna: string | null;
  invitados: string | null;
  promo_fundador: boolean;
  horas_sin_contacto: number;
  horas_desde_creacion: number;
  eventos_mismo_finde: number;
  next_step: string | null;
}

type Stage = "nuevo" | "contactado" | "propuesta" | "negociacion" | "ganado" | "perdido";

function stageOf(name: string): Stage {
  const n = name.toLowerCase();
  if (n.includes("perdido")) return "perdido";
  if (n.includes("ganado")) return "ganado";
  if (n.startsWith("negoci")) return "negociacion";
  if (n.includes("propuesta")) return "propuesta";
  if (n.includes("contactado")) return "contactado";
  return "nuevo";
}

function todaySantiago(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000);
}

const ago = (h: number) => (h >= 48 ? `${Math.floor(h / 24)} días` : `${h} h`);

export interface Suggestion {
  deal: DealRow;
  priority: number; // menor = mas urgente
  text: string;
}

/** Proximo paso sugerido para un trato abierto (null si no hay nada que hacer hoy). */
export function suggestNextStep(d: DealRow, today: string, fundadorRestantes: number): Suggestion | null {
  const stage = stageOf(d.etapa);
  if (stage === "ganado" || stage === "perdido") return null;
  const h = Number(d.horas_sin_contacto) || 0;
  const diasEvento = d.fecha_evento ? daysBetween(today, d.fecha_evento) : null;

  if (diasEvento !== null && diasEvento < 0) {
    return { deal: d, priority: 5, text: "La fecha del evento ya pasó: márcalo como perdido." };
  }
  if (Number(d.eventos_mismo_finde) >= CAPACIDAD_FINDE) {
    return { deal: d, priority: 1, text: `Ese fin de semana ya tiene ${d.eventos_mismo_finde} eventos comprometidos: avisar que no hay cupo u ofrecer otra fecha.` };
  }

  switch (stage) {
    case "nuevo":
      if (h >= 1) return { deal: d, priority: 0, text: `Lead sin respuesta hace ${ago(h)}: escribirle por WhatsApp hoy y proponer la reunión.` };
      return { deal: d, priority: 3, text: "Lead recién llegado: responder dentro de la hora." };
    case "contactado":
      if (h >= 48) return { deal: d, priority: 1, text: `Sin contacto hace ${ago(h)}: seguimiento y link para agendar la reunión.` };
      break;
    case "propuesta":
      if (h >= 72) {
        const escasez = fundadorRestantes > 0 ? ` Recordar que quedan ${fundadorRestantes} fechas con Precio Fundador.` : "";
        return { deal: d, priority: 1, text: `Propuesta enviada hace ${ago(h)} sin respuesta: hacer seguimiento.${escasez}` };
      }
      break;
    case "negociacion":
      if (h >= 48) return { deal: d, priority: 0, text: `En negociación hace ${ago(h)}: pedir la firma y el abono de $200.000 para bloquear la fecha.` };
      break;
  }
  if (diasEvento !== null && diasEvento <= 21) {
    return { deal: d, priority: 1, text: `El evento es en ${diasEvento} días: cerrar esta semana o descartar.` };
  }
  return null;
}

export async function buildSisoyDailySummary(): Promise<string> {
  const db = createAdminClient();
  const { data, error } = await db.from("sisoy_deals_daily").select("*");
  if (error) throw new Error(`sisoy_deals_daily: ${error.message}`);
  const rows = (data ?? []) as DealRow[];
  // La vista ya viene filtrada por el proyecto SiSoy.

  const today = todaySantiago();
  const byStage = new Map<Stage, number>();
  for (const r of rows) byStage.set(stageOf(r.etapa), (byStage.get(stageOf(r.etapa)) ?? 0) + 1);

  const fundadorVendidas = rows.filter(
    (r) => stageOf(r.etapa) === "ganado" && r.promo_fundador && r.fecha_evento &&
      r.fecha_evento >= FUNDADOR_DESDE && r.fecha_evento <= FUNDADOR_HASTA
  ).length;
  const fundadorRestantes = Math.max(0, FUNDADOR_CUPOS - fundadorVendidas);
  const nuevos24h = rows.filter((r) => Number(r.horas_desde_creacion) < 24).length;

  const suggestions = rows
    .map((r) => suggestNextStep(r, today, fundadorRestantes))
    .filter((s): s is Suggestion => s !== null)
    .sort((a, b) => a.priority - b.priority);

  const n = (s: Stage) => byStage.get(s) ?? 0;
  const lines = [
    `<b>🎙️ SiSoy · tratos del ${today}</b>`,
    `Nuevos 24 h: <b>${nuevos24h}</b> · Nuevo ${n("nuevo")} · Contactado ${n("contactado")} · Propuesta ${n("propuesta")} · Negociación ${n("negociacion")} · Ganados ${n("ganado")}`,
    `Precio Fundador: <b>${fundadorRestantes}</b> de ${FUNDADOR_CUPOS} fechas disponibles`,
    "",
  ];

  if (suggestions.length === 0) {
    lines.push("Sin pendientes para hoy ✅");
  } else {
    lines.push(`<b>Qué hacer hoy (${suggestions.length})</b>`);
    for (const s of suggestions.slice(0, 15)) {
      const d = s.deal;
      const meta = [d.fecha_evento, d.comuna || d.lugar, d.invitados && `${d.invitados} inv.`].filter(Boolean).join(" · ");
      lines.push(`• <b>${esc(d.contacto ?? d.title)}</b>${meta ? ` (${esc(meta)})` : ""} — ${esc(d.etapa)}`);
      lines.push(`  ${esc(s.text)}`);
    }
    if (suggestions.length > 15) lines.push(`…y ${suggestions.length - 15} más en el CRM.`);
  }
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://artistpro.app";
  lines.push("", `<a href="${site}/crm">Abrir CRM</a>`);
  return lines.join("\n");
}

/** Envia el resumen. Usa SISOY_TELEGRAM_CHAT_ID si existe; si no, el chat del bot por defecto. */
export async function runSisoyDailySummary(): Promise<{ ok: boolean; chars: number }> {
  const text = await buildSisoyDailySummary();
  await sendTelegram(text, process.env.SISOY_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID || "");
  return { ok: true, chars: text.length };
}

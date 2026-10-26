import type {
  AlertSeverity,
  BudgetCategory,
  PaceStatus,
  SponsorshipCategory,
  SponsorshipStatus,
} from "@/types/tours";

export const SPONSORSHIP_STATUS_LABEL: Record<SponsorshipStatus, string> = {
  identificada: "Identificada",
  dossier_en_preparacion: "Dossier en preparación",
  dossier_listo: "Dossier listo",
  enviada: "Enviada",
  en_conversacion: "En conversación",
  confirmada: "Confirmada",
  contraprestacion_entregada: "Contraprestación entregada",
  rechazada: "Rechazada",
  sin_respuesta: "Sin respuesta (cerrada)",
};

/** Columnas del tablero de auspicios (los cierres van juntos al final). */
export const SPONSORSHIP_COLUMNS: { key: string; label: string; statuses: SponsorshipStatus[] }[] = [
  { key: "prep", label: "Por enviar", statuses: ["identificada", "dossier_en_preparacion", "dossier_listo"] },
  { key: "enviada", label: "Enviadas", statuses: ["enviada"] },
  { key: "conversacion", label: "En conversación", statuses: ["en_conversacion"] },
  { key: "confirmada", label: "Confirmadas", statuses: ["confirmada", "contraprestacion_entregada"] },
  { key: "cerrada", label: "Descartadas", statuses: ["rechazada", "sin_respuesta"] },
];

export const SPONSORSHIP_STATUS_CLASS: Record<SponsorshipStatus, string> = {
  identificada: "bg-muted text-muted-foreground",
  dossier_en_preparacion: "bg-muted text-muted-foreground",
  dossier_listo: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  enviada: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  en_conversacion: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  confirmada: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  contraprestacion_entregada: "bg-emerald-600/20 text-emerald-800 dark:text-emerald-200",
  rechazada: "bg-red-500/10 text-red-700 dark:text-red-300",
  sin_respuesta: "bg-red-500/10 text-red-700 dark:text-red-300",
};

export const SPONSORSHIP_CATEGORY_LABEL: Record<SponsorshipCategory, string> = {
  alojamiento: "Alojamiento",
  comida: "Comida y bebida",
  transporte: "Transporte",
  afines: "Marcas afines",
  medios: "Medios",
  otro: "Otro",
};

export const BUDGET_CATEGORY_LABEL: Record<BudgetCategory, string> = {
  transporte: "Transporte",
  alojamiento: "Alojamiento",
  comida: "Comida",
  tecnica: "Técnica",
  difusion: "Difusión",
  imprevistos: "Imprevistos",
  otros: "Otros",
};

export const PACE_LABEL: Record<PaceStatus, string> = {
  en_ritmo: "En ritmo",
  bajo_meta: "Bajo la meta",
  bajo_equilibrio: "Bajo el equilibrio",
  no_iniciada: "Venta no iniciada",
  sin_datos: "Sin datos",
  realizada: "Realizada",
  caida: "Caída",
};

export const PACE_CLASS: Record<PaceStatus, string> = {
  en_ritmo: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  bajo_meta: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  bajo_equilibrio: "bg-red-500/15 text-red-700 dark:text-red-300",
  no_iniciada: "bg-muted text-muted-foreground",
  sin_datos: "bg-muted text-muted-foreground",
  realizada: "bg-secondary text-secondary-foreground",
  caida: "bg-muted text-muted-foreground line-through",
};

export const SHOW_STATUS_LABEL: Record<string, string> = {
  confirmado: "Confirmada",
  cotizando: "En conversación",
  cancelado: "Caída",
  realizado: "Realizada",
};

export const SEVERITY_CLASS: Record<AlertSeverity, string> = {
  alta: "border-l-red-500",
  media: "border-l-amber-500",
  baja: "border-l-muted-foreground/40",
};

export const SEVERITY_LABEL: Record<AlertSeverity, string> = { alta: "Urgente", media: "Revisar", baja: "Ojo" };

/** "2026-12-11" -> "11 dic" (sin desfase de zona horaria). */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const sameYear = y === new Date().getFullYear();
  return `${d} ${months[m - 1]}${sameYear ? "" : ` ${String(y).slice(2)}`}`;
}

export function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

import type { Temperature, LeadSource } from "@/types";

// Version mostrada en el pie de la barra lateral (Sidebar.tsx). Convención
// (pedida por Francisco, 18 ago 2026): subir el número después del punto
// cada vez que se actualiza BITACORA.md (cualquier sesión de trabajo);
// subir el número antes del punto (y volver el de después a 0) solo para
// cambios grandes -- módulos nuevos, no ajustes/fixes puntuales.
export const APP_VERSION = "5.1";

export const TEMPERATURE_CONFIG: Record<
  Temperature,
  { label: string; color: string; bgColor: string }
> = {
  cold: { label: "Frio", color: "#64748b", bgColor: "#f1f5f9" },
  warm: { label: "Tibio", color: "#ea580c", bgColor: "#fff7ed" },
  hot: { label: "Caliente", color: "#dc2626", bgColor: "#fef2f2" },
};

export const SOURCE_LABELS: Record<LeadSource, string> = {
  website: "Sitio web",
  whatsapp: "WhatsApp",
  referido: "Referido",
  redes_sociales: "Redes sociales",
  llamada_fria: "Llamada fria",
  email: "Email",
  formulario: "Formulario",
  evento: "Evento",
  import: "Importado",
  webhook: "Webhook",
  otro: "Otro",
};

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(cents / 100);
}

export function cleanPhoneForWhatsApp(phone: string): string {
  // "+52 55 1234 5678" → "525512345678"
  return phone.replace(/[\s\-\(\)]/g, "").replace(/^\+/, "");
}

// Fecha "pura" (sin hora, ej. "2026-09-02" -- lo que devuelve una columna
// `date` de Postgres) o guardada como medianoche UTC (típico de
// <input type="date"> en tareas/deals/subproyectos/campañas, que no
// tienen una hora real que importe -- solo un día calendario).
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.\d+)?(?:Z|[+-]00:?00)?)?$/;

// Exportada para que otras pantallas con el mismo problema (listas de
// finanzas, eventos, etc. que hacían `new Date(dateString)` directo) usen
// el mismo parseo seguro en vez de duplicar la lógica.
export function parseFlexibleDate(date: Date | string | number): Date {
  if (date instanceof Date) return date;
  if (typeof date === "string") {
    // Se interpreta como el mismo día calendario en la zona horaria local,
    // no como un instante UTC -- si no, en timezones detrás de UTC (ej.
    // Chile) el día se corre uno hacia atrás al mostrarlo (bug reportado:
    // "siempre se pone como un día antes", en tareas, deals y finanzas).
    const match = date.match(DATE_ONLY_RE);
    if (match) {
      const [, y, m, d] = match;
      return new Date(Number(y), Number(m) - 1, Number(d));
    }
    return new Date(date);
  }
  // If number is less than 1e12, it's in seconds; otherwise milliseconds
  return new Date(date < 1e12 ? date * 1000 : date);
}

export function formatDate(date: Date | string | number | null): string {
  if (!date) return "-";
  const d = parseFlexibleDate(date);
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatRelativeDate(date: Date | string | number): string {
  const d = parseFlexibleDate(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) return `Hace ${diffDays} dias`;
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`;
  return formatDate(date);
}

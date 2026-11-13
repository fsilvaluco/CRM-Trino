// Formateo compartido entre la pagina publica y el modulo interno de
// Preescuchas. Sin dependencias de servidor: se importa desde componentes
// cliente.

/** Segundos -> "3:07" (o "1:02:45" si pasa de una hora). Vacio/0 -> "0:00"; null -> "--:--". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "--:--";
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Dias completos que faltan para una fecha (minimo 0). "Vence hoy" = 0. */
export function daysUntil(iso: string, now: Date = new Date()): number {
  const ms = new Date(iso).getTime() - now.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

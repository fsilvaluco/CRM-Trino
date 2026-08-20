import { subMonths, startOfDay, startOfYear, endOfYear, endOfDay } from "date-fns";

/**
 * Período compartido por las tarjetas y gráficos de Métricas > Resumen.
 * Dos modos: "últimos N meses" (ventana móvil que termina hoy) o "año
 * calendario" (desde el 1 de enero hasta el 31 de diciembre de ese año).
 */
export interface AnalyticsPeriod {
  key: string;
  label: string;
  start: Date;
  /** Exclusivo -- fechas < end cuentan como dentro del período. */
  end: Date;
}

const MONTH_OPTIONS = [
  { key: "1m", label: "1 mes", months: 1 },
  { key: "3m", label: "3 meses", months: 3 },
  { key: "6m", label: "6 meses", months: 6 },
  { key: "12m", label: "12 meses", months: 12 },
];

/**
 * Arma la lista de períodos seleccionables: los 4 de meses fijos + un botón
 * por cada año que efectivamente tiene datos (`years`) -- así nunca se
 * hardcodean años que no existen en la base ni faltan años viejos si hay
 * historial de antes.
 */
export function buildAnalyticsPeriods(years: number[]): AnalyticsPeriod[] {
  const now = new Date();
  const monthPeriods: AnalyticsPeriod[] = MONTH_OPTIONS.map((o) => ({
    key: o.key,
    label: o.label,
    start: startOfDay(subMonths(now, o.months)),
    end: endOfDay(now),
  }));

  const yearPeriods: AnalyticsPeriod[] = [...years]
    .sort((a, b) => b - a)
    .map((year) => ({
      key: `y${year}`,
      label: String(year),
      start: startOfYear(new Date(year, 0, 1)),
      end: endOfYear(new Date(year, 0, 1)),
    }));

  return [...monthPeriods, ...yearPeriods];
}

/** Años distintos presentes en una lista de fechas (ISO string o "YYYY-MM-DD"). */
export function distinctYears(dates: string[]): number[] {
  const years = new Set<number>();
  for (const d of dates) {
    const year = new Date(d).getFullYear();
    if (!Number.isNaN(year)) years.add(year);
  }
  return [...years];
}

export function isWithinPeriod(dateStr: string, period: AnalyticsPeriod): boolean {
  const d = new Date(dateStr);
  return d >= period.start && d <= period.end;
}

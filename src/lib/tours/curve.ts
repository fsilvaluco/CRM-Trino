// Curva de venta esperada: misma fórmula que v_tour_show_sales. Una parte
// (lateShare) de la venta ocurre en los últimos lateDays días; el resto se
// reparte lineal desde el inicio de venta.
export function expectedFraction(daysElapsed: number, daysTotal: number, lateShare: number, lateDays: number): number {
  const total = Math.max(daysTotal, 1);
  const elapsed = Math.min(Math.max(daysElapsed, 0), total);
  if (total <= lateDays) return elapsed / total;
  const early = total - lateDays;
  if (elapsed <= early) return ((1 - lateShare) * elapsed) / early;
  return 1 - lateShare + (lateShare * (elapsed - early)) / lateDays;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso.slice(0, 10)}T00:00:00`).getTime();
  const b = new Date(`${toIso.slice(0, 10)}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

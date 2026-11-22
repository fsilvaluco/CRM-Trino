import type { SalesPoint, TourDate } from "@/types/tours";

// Cálculos del panel "Ventas en vivo" de la gira. Los totales salen de la
// vista (event_ticket_tiers, que sync-tickets mantiene al día); los deltas de
// "hoy" y "24 h" salen de la serie de ticket_sales_snapshots.

/** Entradas vendidas desde `since` en una fecha, según sus snapshots (se
 *  compara snapshot con snapshot para no mezclar criterios con la vista). */
function soldSince(points: SalesPoint[], since: number): number {
  if (points.length === 0) return 0;
  // Línea base: último snapshot anterior al corte. Si la serie empieza
  // después del corte, el primer snapshot (no sabemos qué hubo antes).
  let base = points[0].sold;
  for (const p of points) {
    if (new Date(p.capturedAt).getTime() <= since) base = p.sold;
    else break;
  }
  return Math.max(0, points[points.length - 1].sold - base);
}

export interface CityLive {
  date: TourDate;
  sold: number;
  capacity: number | null;
  pct: number | null;
  visits: number | null;
  conversion: number | null;
  today: number;
  last24h: number;
}

export interface TourLive {
  sold: number;
  capacity: number;
  gross: number | null;
  today: number;
  last24h: number;
  updatedAt: string | null;
  cities: CityLive[];
}

export function computeTourLive(dates: TourDate[], points: SalesPoint[], now = new Date()): TourLive {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const dayAgo = now.getTime() - 86_400_000;

  const byShow = new Map<string, SalesPoint[]>();
  for (const p of points) {
    const list = byShow.get(p.showId) ?? [];
    list.push(p);
    byShow.set(p.showId, list);
  }
  for (const list of byShow.values()) list.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

  const active = dates.filter((d) => d.showStatus !== "cancelado");
  const cities: CityLive[] = active.map((d) => {
    const series = byShow.get(d.showId) ?? [];
    return {
      date: d,
      sold: d.sold,
      capacity: d.capacity,
      pct: d.capacity ? Math.round((d.sold * 1000) / d.capacity) / 10 : null,
      visits: d.ticketVisits,
      conversion: d.ticketVisits ? Math.round((d.sold * 1000) / d.ticketVisits) / 10 : null,
      today: soldSince(series, midnight.getTime()),
      last24h: soldSince(series, dayAgo),
    };
  });

  const withGross = active.filter((d) => d.grossAmount !== null);
  const updatedAt = active.reduce<string | null>(
    (max, d) => (d.ticketsUpdatedAt && (!max || d.ticketsUpdatedAt > max) ? d.ticketsUpdatedAt : max),
    null
  );

  return {
    sold: cities.reduce((a, c) => a + c.sold, 0),
    capacity: cities.reduce((a, c) => a + (c.capacity ?? 0), 0),
    // gross_amount viene en centavos (tramos en centavos): formatCurrency lo
    // muestra como gross_amount / 100 pesos.
    gross: withGross.length ? withGross.reduce((a, d) => a + (d.grossAmount ?? 0), 0) : null,
    today: cities.reduce((a, c) => a + c.today, 0),
    last24h: cities.reduce((a, c) => a + c.last24h, 0),
    updatedAt,
    cities,
  };
}

/** "Actualizado hace X min" a partir de shows.tickets_updated_at. */
export function updatedAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "Sin sincronizar";
  const min = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "Actualizado hace menos de 1 min";
  if (min < 60) return `Actualizado hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Actualizado hace ${h} h`;
  return `Actualizado hace ${Math.floor(h / 24)} d`;
}

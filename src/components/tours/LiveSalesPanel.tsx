"use client";

import { AlertTriangle, Radio } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import { shortDate } from "@/components/tours/labels";
import { computeTourLive, updatedAgo, type CityLive } from "@/lib/tours/live";
import type { SalesPoint, TourDate } from "@/types/tours";

const fmt = (n: number) => n.toLocaleString("es-CL");

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function CityCard({ c }: { c: CityLive }) {
  const pct = c.pct ?? 0;
  const bar = pct >= 75 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-primary";
  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-sm font-medium">{c.date.city}</p>
        <span className="shrink-0 text-xs text-muted-foreground">{shortDate(c.date.date)}</span>
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums">
        {fmt(c.sold)}
        <span className="text-sm font-normal text-muted-foreground"> / {c.capacity !== null ? fmt(c.capacity) : "—"}</span>
      </p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-1 text-xs">
        <div>
          <dt className="text-muted-foreground">Ocupación</dt>
          <dd className="tabular-nums">{c.pct !== null ? `${c.pct}%` : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Visitas</dt>
          <dd className="tabular-nums">{c.visits !== null ? fmt(c.visits) : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Conversión</dt>
          <dd className="tabular-nums">{c.conversion !== null ? `${c.conversion}%` : "—"}</dd>
        </div>
      </dl>
      {c.today > 0 && <p className="mt-1.5 text-xs text-emerald-600">+{fmt(c.today)} hoy</p>}
      {c.date.ticketsSyncError && (
        <p className="mt-1.5 flex items-start gap-1 text-xs text-red-600" title={c.date.ticketsSyncError}>
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span className="line-clamp-2">Error de sync: {c.date.ticketsSyncError}</span>
        </p>
      )}
    </li>
  );
}

export function LiveSalesPanel({ dates, points }: { dates: TourDate[]; points: SalesPoint[] }) {
  const { formatCurrency } = useLocale();
  const live = computeTourLive(dates, points);
  const pct = live.capacity > 0 ? Math.round((live.sold * 1000) / live.capacity) / 10 : null;

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Radio className="h-4 w-4 text-emerald-600" /> Ventas en vivo
        </h2>
        <span className="text-xs text-muted-foreground">{updatedAgo(live.updatedAt)}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Vendidas / cupos" value={`${fmt(live.sold)} / ${fmt(live.capacity)}`} hint={pct !== null ? `${pct}% de ocupación` : undefined} />
        {/* gross_amount está en centavos; formatCurrency lo muestra como gross_amount / 100. */}
        <Stat label="Recaudación" value={live.gross !== null ? formatCurrency(live.gross) : "—"} hint={live.gross === null ? "Sin permiso para ver montos" : "Bruto, sin cortesías"} />
        <Stat label="Vendidas hoy" value={fmt(live.today)} />
        <Stat label="Últimas 24 h" value={fmt(live.last24h)} />
      </div>

      {live.cities.length > 0 && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {live.cities.map((c) => (
            <CityCard key={c.date.showId} c={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

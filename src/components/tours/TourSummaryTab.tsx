"use client";

import { useLocale } from "@/lib/locale-context";
import { AlertsList } from "@/components/tours/AlertsList";
import { PACE_CLASS, PACE_LABEL, shortDate } from "@/components/tours/labels";
import type { TourDetail } from "@/types/tours";

type Tab = "resumen" | "fechas" | "venta" | "auspicios" | "presupuesto" | "tareas";

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "bad" | "warn" | "good" }) {
  const toneClass = tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-600" : tone === "good" ? "text-emerald-600" : "";
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function TourSummaryTab({ data, onNavigate }: { data: TourDetail; onNavigate: (t: Tab) => void }) {
  const { formatCurrency } = useLocale();
  const { tour, dates, sponsorships, budget } = data;
  const active = dates.filter((d) => d.showStatus !== "cancelado");

  const capacity = active.reduce((a, d) => a + (d.capacity ?? 0), 0);
  const sold = active.reduce((a, d) => a + d.sold, 0);
  const target = active.reduce((a, d) => a + (d.target ?? 0), 0);
  const projected = active.reduce((a, d) => a + (d.projectedSold ?? d.sold), 0);
  const projectedPct = capacity > 0 ? Math.round((projected * 1000) / capacity) / 10 : null;
  const salesStarted = active.some((d) => !["no_iniciada", "sin_datos"].includes(d.paceStatus));

  const confirmed = sponsorships.filter((s) => ["confirmada", "contraprestacion_entregada"].includes(s.status));
  const open = sponsorships.filter((s) => !["confirmada", "contraprestacion_entregada", "rechazada", "sin_respuesta"].includes(s.status));
  const canjeValue = confirmed.reduce((a, s) => a + (s.confirmedValue ?? s.estimatedValue ?? 0), 0);
  const daysToDeadline = tour.sponsorshipDeadline
    ? Math.ceil((new Date(`${tour.sponsorshipDeadline}T23:59:59`).getTime() - Date.now()) / 86_400_000)
    : null;

  const totalBudget = budget?.categories.reduce((a, c) => a + c.budgeted, 0) ?? 0;
  const totalNet = budget?.categories.reduce((a, c) => a + c.netBudget, 0) ?? 0;
  const totalReal = budget?.categories.reduce((a, c) => a + c.realAmount, 0) ?? 0;

  const weak = active
    .filter((d) => ["bajo_equilibrio", "bajo_meta"].includes(d.paceStatus))
    .sort((a, b) => (a.projectedPct ?? 0) - (b.projectedPct ?? 0));

  const occTone =
    projectedPct === null || !salesStarted
      ? undefined
      : tour.breakevenPct !== null && projectedPct < tour.breakevenPct
        ? "bad"
        : projectedPct < tour.targetOccupancyPct
          ? "warn"
          : "good";

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Entradas vendidas" value={`${sold} / ${target}`} hint={`Meta ${tour.targetOccupancyPct}% de ${capacity} de aforo`} />
        <Kpi
          label="Ocupación proyectada"
          value={salesStarted && projectedPct !== null ? `${projectedPct}%` : "—"}
          hint={`Meta ${tour.targetOccupancyPct}%${tour.breakevenPct !== null ? ` · equilibrio ${tour.breakevenPct}%` : ""}`}
          tone={occTone}
        />
        <Kpi
          label="Auspicios"
          value={`${confirmed.length} confirmados`}
          hint={`${open.length} abiertos${daysToDeadline !== null ? ` · cierre en ${daysToDeadline} días (${shortDate(tour.sponsorshipDeadline)})` : ""}`}
          tone={daysToDeadline !== null && daysToDeadline <= 21 && confirmed.length === 0 ? "warn" : undefined}
        />
        {budget ? (
          <Kpi
            label="Presupuesto neto de canjes"
            value={formatCurrency(totalNet)}
            hint={`De ${formatCurrency(totalBudget)} · canjes ${formatCurrency(canjeValue)} · real ${formatCurrency(totalReal)}`}
          />
        ) : (
          <Kpi label="Canjes confirmados" value={formatCurrency(canjeValue)} />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Para revisar hoy</h2>
          <AlertsList alerts={data.alerts} onNavigate={onNavigate} />
        </section>

        <aside className="space-y-4">
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Dónde vamos flaqueando</h2>
            {weak.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {salesStarted ? "Todas las fechas van en ritmo." : "La venta aún no parte o falta actualizarla."}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {weak.map((d) => (
                  <li key={d.showId} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {d.city} <span className="text-muted-foreground">· {shortDate(d.date)}</span>
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-xs ${PACE_CLASS[d.paceStatus]}`}>{d.projectedPct ?? "?"}% proy.</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Tramos</h2>
            <ul className="space-y-2">
              {data.legs.map((leg) => {
                const legDates = dates.filter((d) => d.tourLegId === leg.id);
                return (
                  <li key={leg.id} className="rounded-lg border p-2.5">
                    <p className="text-sm font-medium">
                      {leg.name} <span className="font-normal text-muted-foreground">· {shortDate(leg.startDate)} – {shortDate(leg.endDate)}</span>
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {legDates.map((d) => (
                        <span key={d.showId} className={`rounded px-1.5 py-0.5 text-[11px] ${PACE_CLASS[d.paceStatus]}`} title={PACE_LABEL[d.paceStatus]}>
                          {d.city}
                        </span>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

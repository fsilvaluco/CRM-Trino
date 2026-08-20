"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Music, Users } from "lucide-react";
import { AnalyticsPageHeader } from "@/components/analytics/AnalyticsPageHeader";
import { ResumenTab } from "@/components/analytics/ResumenTab";
import { EventsPerMonthChart } from "@/components/analytics/EventsPerMonthChart";
import { IncomeExpensesChart } from "@/components/analytics/IncomeExpensesChart";
import { VibeTrendChart } from "@/components/analytics/VibeTrendChart";
import { MerchSalesChart } from "@/components/analytics/MerchSalesChart";
import { useAnalyticsData } from "@/lib/use-analytics-data";
import { buildAnalyticsPeriods, distinctYears, isWithinPeriod } from "@/lib/analytics-period";
import { cn } from "@/lib/utils";

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export default function AnalyticsResumenPage() {
  const { shows, social, shopifySales, loading, refresh } = useAnalyticsData();

  // Los botones de período son dinámicos: 1/3/6/12 meses fijos + un botón
  // por cada año que efectivamente tiene eventos o métricas registradas
  // (no se hardcodean años -- si el historial parte en 2024, aparece 2024).
  const periods = useMemo(
    () => buildAnalyticsPeriods(distinctYears([...shows.map((s) => s.date), ...social.map((m) => m.recordedAt)])),
    [shows, social]
  );
  const [periodKey, setPeriodKey] = useState("3m"); // default: 3 meses
  const period = periods.find((p) => p.key === periodKey) ?? periods[1] ?? periods[0];

  const showsInPeriod = useMemo(
    () => (period ? shows.filter((s) => isWithinPeriod(s.date, period)) : shows),
    [shows, period]
  );
  const socialInPeriod = useMemo(
    () => (period ? social.filter((m) => isWithinPeriod(m.recordedAt, period)) : social),
    [social, period]
  );
  const shopifySalesInPeriod = useMemo(
    () => (period ? shopifySales.filter((s) => isWithinPeriod(s.month, period)) : shopifySales),
    [shopifySales, period]
  );

  const totalShows = showsInPeriod.length;

  const ingresosTotales = showsInPeriod.reduce((sum, s) => sum + (s.fee ?? 0) + (s.ticketIncome ?? 0), 0);

  const vibesWithValue = showsInPeriod.filter((s) => s.avgVibe != null);
  const vibePromedio =
    vibesWithValue.length > 0
      ? vibesWithValue.reduce((sum, s) => sum + (s.avgVibe ?? 0), 0) / vibesWithValue.length
      : null;

  const instagramMetrics = socialInPeriod
    .filter((m) => m.platform === "instagram")
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  const latestInstagram = instagramMetrics[0]?.followers ?? null;

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader
        icon={ClipboardList}
        title="Resumen"
        description="Vistazo general de shows, redes sociales y merch"
      />

      <div className="flex items-center gap-1 rounded-lg border p-1 w-fit flex-wrap">
        {periods.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriodKey(p.key)}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer",
              period?.key === p.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl border bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Music className="h-3 w-3" /> Total shows
            </p>
            <p className="text-lg font-bold">{totalShows}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Ingresos totales</p>
            <p className="text-lg font-bold text-green-700 dark:text-green-400">
              {CLP.format(ingresosTotales / 100)}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Vibe promedio</p>
            <p className="text-lg font-bold">
              {vibePromedio != null ? vibePromedio.toFixed(1) : "—"}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Users className="h-3 w-3" /> Seguidores Instagram
            </p>
            <p className="text-lg font-bold">
              {latestInstagram != null
                ? new Intl.NumberFormat("es-CL").format(latestInstagram)
                : "—"}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="h-64 rounded-lg bg-muted animate-pulse" />
      ) : (
        <>
          <EventsPerMonthChart shows={showsInPeriod} />
          <IncomeExpensesChart shows={showsInPeriod} />
          <VibeTrendChart shows={showsInPeriod} />
          <MerchSalesChart sales={shopifySalesInPeriod} />
          <ResumenTab metrics={social} onRefresh={refresh} />
        </>
      )}
    </div>
  );
}

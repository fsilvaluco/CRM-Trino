"use client";

import { ClipboardList, Music, Users } from "lucide-react";
import { AnalyticsPageHeader } from "@/components/analytics/AnalyticsPageHeader";
import { ResumenTab } from "@/components/analytics/ResumenTab";
import { useAnalyticsData } from "@/lib/use-analytics-data";

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export default function AnalyticsResumenPage() {
  const { shows, social, loading, refresh } = useAnalyticsData();

  const totalShows = shows.length;

  const utilidadAcumulada = shows.reduce((sum, s) => {
    return sum + (s.fee ?? 0) + (s.ticketIncome ?? 0) - (s.expenses ?? 0);
  }, 0);

  const vibesWithValue = shows.filter((s) => s.avgVibe != null);
  const vibePromedio =
    vibesWithValue.length > 0
      ? vibesWithValue.reduce((sum, s) => sum + (s.avgVibe ?? 0), 0) / vibesWithValue.length
      : null;

  const instagramMetrics = social
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
            <p className="text-xs text-muted-foreground mb-1">Utilidad acumulada</p>
            <p
              className={`text-lg font-bold ${
                utilidadAcumulada >= 0
                  ? "text-green-700 dark:text-green-400"
                  : "text-red-700 dark:text-red-400"
              }`}
            >
              {CLP.format(utilidadAcumulada / 100)}
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
        <ResumenTab metrics={social} onRefresh={refresh} />
      )}
    </div>
  );
}

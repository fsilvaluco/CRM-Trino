"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { SpotifyStatsSnapshot } from "@/types/analytics";

const NUM = new Intl.NumberFormat("es-CL");

type MetricKey = "listeners" | "monthlyActiveListeners" | "streams" | "saves" | "playlistAdds";

const METRICS: { key: MetricKey; label: string; color: string }[] = [
  { key: "listeners", label: "Oyentes mensuales", color: "#22c55e" },
  { key: "monthlyActiveListeners", label: "Oyentes activos", color: "#3b82f6" },
  { key: "streams", label: "Reproducciones", color: "#a855f7" },
  { key: "saves", label: "Guardados", color: "#f59e0b" },
  { key: "playlistAdds", label: "Agregados a playlist", color: "#ec4899" },
];

interface SpotifyStatsChartsProps {
  snapshots: SpotifyStatsSnapshot[];
}

export function SpotifyStatsCharts({ snapshots }: SpotifyStatsChartsProps) {
  const [metric, setMetric] = useState<MetricKey>("listeners");

  // Un punto por período, ordenado del más antiguo al más reciente — al
  // revés que la tabla (que muestra lo más nuevo arriba).
  const chartData = useMemo(
    () =>
      [...snapshots]
        .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd))
        .map((s) => ({
          label: format(new Date(`${s.periodEnd}T00:00:00`), "MMM yy", { locale: es }),
          value: s[metric],
        })),
    [snapshots, metric]
  );

  const hasData = chartData.some((d) => d.value != null);
  const activeMetric = METRICS.find((m) => m.key === metric)!;

  if (snapshots.length < 2) {
    return null; // con 0 o 1 registro no hay tendencia que mostrar todavía
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex items-center gap-1 flex-wrap">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              m.key === metric ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {hasData ? (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => NUM.format(v)} width={70} />
            <Tooltip formatter={(v) => [v != null ? NUM.format(Number(v)) : "—", activeMetric.label]} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={activeMetric.color}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-16">Sin datos de &quot;{activeMetric.label}&quot; todavía</p>
      )}
    </div>
  );
}

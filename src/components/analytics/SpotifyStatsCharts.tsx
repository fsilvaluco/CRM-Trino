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
import { format, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SpotifyStatsSnapshot, SocialMetric } from "@/types/analytics";

const NUM = new Intl.NumberFormat("es-CL");

type MetricKey = "followers" | "listeners" | "monthlyActiveListeners" | "streams" | "saves" | "playlistAdds";

const METRICS: { key: MetricKey; label: string; color: string }[] = [
  { key: "followers", label: "Seguidores", color: "#16a34a" },
  { key: "listeners", label: "Oyentes mensuales", color: "#22c55e" },
  { key: "monthlyActiveListeners", label: "Oyentes activos", color: "#3b82f6" },
  { key: "streams", label: "Reproducciones", color: "#a855f7" },
  { key: "saves", label: "Guardados", color: "#f59e0b" },
  { key: "playlistAdds", label: "Agregados a playlist", color: "#ec4899" },
];

const RANGES = [
  { key: "6", label: "Últimos 6 meses", months: 6 },
  { key: "12", label: "Últimos 12 meses", months: 12 },
  { key: "24", label: "Últimos 24 meses", months: 24 },
  { key: "all", label: "Todo", months: null as number | null },
];

interface SpotifyStatsChartsProps {
  snapshots: SpotifyStatsSnapshot[];
  /** Seguidores: se toman de social_metrics (no de los snapshots) porque
   * ahí vive el histórico completo, incluido lo importado antes de que
   * existiera esta pantalla de estadísticas detalladas. */
  followerMetrics: SocialMetric[];
}

export function SpotifyStatsCharts({ snapshots, followerMetrics }: SpotifyStatsChartsProps) {
  const [metric, setMetric] = useState<MetricKey>("followers");
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[1]);

  const spotifyFollowers = useMemo(() => followerMetrics.filter((m) => m.platform === "spotify"), [followerMetrics]);

  const rawSeries = useMemo(() => {
    if (metric === "followers") {
      return spotifyFollowers
        .map((m) => ({ date: m.recordedAt, value: m.followers as number | null }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }
    return snapshots
      .map((s) => ({ date: s.periodEnd, value: s[metric] }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [metric, snapshots, spotifyFollowers]);

  const chartData = useMemo(() => {
    const months = range.months;
    const filtered =
      months == null ? rawSeries : rawSeries.filter((d) => new Date(`${d.date}T00:00:00`) >= subMonths(new Date(), months));
    return filtered.map((d) => ({
      label: format(new Date(`${d.date}T00:00:00`), "MMM yy", { locale: es }),
      value: d.value,
    }));
  }, [rawSeries, range]);

  const hasData = chartData.some((d) => d.value != null);
  const activeMetric = METRICS.find((m) => m.key === metric)!;

  if (snapshots.length < 2 && spotifyFollowers.length < 2) {
    return null; // sin al menos 2 puntos no hay tendencia que mostrar todavía
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={metric} onValueChange={(v) => setMetric(v as MetricKey)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METRICS.map((m) => (
              <SelectItem key={m.key} value={m.key}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={range.key} onValueChange={(v) => setRange(RANGES.find((r) => r.key === v) ?? RANGES[1])}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r.key} value={r.key}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasData ? (
        <ResponsiveContainer width="100%" height={280}>
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
        <p className="text-sm text-muted-foreground text-center py-16">Sin datos de &quot;{activeMetric.label}&quot; en este rango</p>
      )}
    </div>
  );
}

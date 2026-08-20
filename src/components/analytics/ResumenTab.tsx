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
  Legend,
} from "recharts";
import { Plus, BarChart2 } from "lucide-react";
import { format, subDays, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SocialMetric } from "@/types/analytics";
import { RegisterSnapshotSheet } from "@/components/analytics/RegisterSnapshotSheet";

interface ResumenTabProps {
  metrics: SocialMetric[];
  onRefresh: () => void;
}

interface Period {
  key: string;
  label: string;
  days: number | null; // null = todo el historial
}

// Mismo patrón de selector de período que PlatformTab -- pero acá el
// default es 3 meses (no 30 días): este gráfico junta TODAS las
// plataformas desde siempre y con historiales de más de un año (desde
// 2024) se veía amontonado y poco útil por defecto.
const PERIODS: Period[] = [
  { key: "1m", label: "1 mes", days: 30 },
  { key: "3m", label: "3 meses", days: 90 },
  { key: "6m", label: "6 meses", days: 180 },
  { key: "12m", label: "12 meses", days: 365 },
  { key: "all", label: "Todo", days: null },
];

function buildChartData(metrics: SocialMetric[]) {
  const byDate: Record<string, Record<string, number>> = {};
  const sorted = [...metrics].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  for (const m of sorted) {
    if (!byDate[m.recordedAt]) byDate[m.recordedAt] = {};
    byDate[m.recordedAt][m.platform] = m.followers;
  }
  return Object.entries(byDate).map(([date, platforms]) => ({
    date,
    // Con año -- el historial de una plataforma puede abarcar mas de un
    // año, y sin el año un punto de "27 jul 2024" y otro de "27 jul 2026"
    // se ven idénticos en el eje/tooltip, prestándose a pensar que hay un
    // punto "mal ubicado" cuando en realidad son fechas distintas.
    label: format(new Date(date), "d MMM yyyy", { locale: es }),
    ...platforms,
  }));
}

export function ResumenTab({ metrics, onRefresh }: ResumenTabProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [period, setPeriod] = useState<Period>(PERIODS[1]); // default: 3 meses

  const metricsInPeriod = useMemo(() => {
    if (period.days == null) return metrics;
    const cutoff = startOfDay(subDays(new Date(), period.days - 1));
    return metrics.filter((m) => new Date(m.recordedAt) >= cutoff);
  }, [metrics, period]);

  const chartData = useMemo(() => buildChartData(metricsInPeriod), [metricsInPeriod]);
  const hasInstagram = metricsInPeriod.some((m) => m.platform === "instagram");
  const hasTiktok = metricsInPeriod.some((m) => m.platform === "tiktok");
  const hasYoutube = metricsInPeriod.some((m) => m.platform === "youtube");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1 rounded-lg border p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                period.key === p.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {metricsInPeriod.length} registro{metricsInPeriod.length !== 1 ? "s" : ""} · {period.label}
          </p>
          <Button size="sm" onClick={() => setSheetOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Registrar snapshot
          </Button>
        </div>
      </div>

      {chartData.length > 0 ? (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground mb-4">Seguidores por plataforma</p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => new Intl.NumberFormat("es-CL").format(v)}
                width={70}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8 }}
                labelStyle={{ color: "#0f172a", fontWeight: 600, marginBottom: 4 }}
                itemStyle={{ color: "#0f172a" }}
                formatter={(v, name) => [
                  new Intl.NumberFormat("es-CL").format(Number(v ?? 0)),
                  String(name),
                ]}
              />
              <Legend />
              {hasInstagram && (
                <Line type="monotone" dataKey="instagram" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Instagram" />
              )}
              {hasTiktok && (
                <Line type="monotone" dataKey="tiktok" stroke="#ec4899" strokeWidth={2} dot={{ r: 3 }} name="TikTok" />
              )}
              {hasYoutube && (
                <Line type="monotone" dataKey="youtube" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="YouTube" />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Sin datos de redes sociales</p>
        </div>
      )}

      <RegisterSnapshotSheet open={sheetOpen} onOpenChange={setSheetOpen} onRegistered={onRefresh} />
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Plus, BarChart2, Clock, TrendingUp, TrendingDown, Users } from "lucide-react";
import { format, subDays, isAfter, differenceInCalendarDays } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SocialMetric } from "@/types/analytics";
import { RegisterSnapshotSheet } from "@/components/analytics/RegisterSnapshotSheet";
import { MetaIntegrationCard } from "@/components/analytics/MetaIntegrationCard";
import { useProject } from "@/lib/project-context";

type Platform = "instagram" | "tiktok" | "youtube";

interface MetaIntegration {
  connected: boolean;
  accountName?: string;
  lastSyncAt?: string;
  tokenExpiresAt?: string;
}

interface PlatformTabProps {
  platform: Platform;
  metrics: SocialMetric[];
  onRefresh: () => void;
  /** Solo Instagram tiene conexión automática hoy. */
  integration?: MetaIntegration;
  comingSoon?: boolean;
}

const PLATFORM_COLOR: Record<Platform, string> = {
  instagram: "#3b82f6",
  tiktok: "#ec4899",
  youtube: "#ef4444",
};

const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

interface Period {
  key: string;
  label: string;
  days: number | null; // null = todo el historial
}

const PERIODS: Period[] = [
  { key: "7d", label: "7 días", days: 7 },
  { key: "30d", label: "30 días", days: 30 },
  { key: "3m", label: "3 meses", days: 90 },
  { key: "6m", label: "6 meses", days: 180 },
  { key: "12m", label: "12 meses", days: 365 },
  { key: "all", label: "Todo", days: null },
];

const NUM = new Intl.NumberFormat("es-CL");

export function PlatformTab({ platform, metrics, onRefresh, integration, comingSoon }: PlatformTabProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [period, setPeriod] = useState<Period>(PERIODS[1]); // default: 30 días
  const { activeProject } = useProject();

  const platformMetrics = useMemo(
    () =>
      metrics
        .filter((m) => m.platform === platform)
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)),
    [metrics, platform]
  );

  const filteredMetrics = useMemo(() => {
    if (period.days == null) return platformMetrics;
    const cutoff = subDays(new Date(), period.days);
    return platformMetrics.filter((m) => isAfter(new Date(m.recordedAt), cutoff));
  }, [platformMetrics, period]);

  const chartData = filteredMetrics.map((m) => ({
    label: format(new Date(m.recordedAt), "d MMM", { locale: es }),
    followers: m.followers,
  }));

  // Seguidores actuales: siempre el último dato conocido, sin importar el
  // período seleccionado (el período solo recorta el gráfico y la variación).
  const currentFollowers = platformMetrics.length > 0 ? platformMetrics[platformMetrics.length - 1].followers : null;

  const stats = useMemo(() => {
    if (filteredMetrics.length < 2 || currentFollowers == null) return null;
    const first = filteredMetrics[0];
    const delta = currentFollowers - first.followers;
    const elapsedDays = Math.max(
      1,
      differenceInCalendarDays(new Date(), new Date(first.recordedAt))
    );
    const dailyAvg = delta / elapsedDays;
    const pct = first.followers > 0 ? (delta / first.followers) * 100 : null;
    return { delta, dailyAvg, pct };
  }, [filteredMetrics, currentFollowers]);

  return (
    <div className="space-y-6">
      {comingSoon && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/40 p-3 text-sm text-muted-foreground">
          <Clock className="h-4 w-4 shrink-0" />
          Conexión automática de {PLATFORM_LABEL[platform]} próximamente. Por ahora puedes registrar los
          seguidores a mano para ir siguiendo la evolución.
        </div>
      )}

      {integration && (
        <MetaIntegrationCard integration={integration} onRefresh={onRefresh} projectId={activeProject?.id} />
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Users className="h-3 w-3" /> Seguidores actuales
          </p>
          <p className="text-lg font-bold">{currentFollowers != null ? NUM.format(currentFollowers) : "—"}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Variación · {period.label}</p>
          {stats ? (
            <p
              className={cn(
                "text-lg font-bold flex items-center gap-1",
                stats.delta >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
              )}
            >
              {stats.delta >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {stats.delta >= 0 ? "+" : ""}
              {NUM.format(stats.delta)}
              {stats.pct != null && (
                <span className="text-xs font-normal text-muted-foreground">
                  ({stats.pct >= 0 ? "+" : ""}
                  {stats.pct.toFixed(1)}%)
                </span>
              )}
            </p>
          ) : (
            <p className="text-lg font-bold text-muted-foreground">—</p>
          )}
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Promedio diario</p>
          <p className="text-lg font-bold">
            {stats ? `${stats.dailyAvg >= 0 ? "+" : ""}${stats.dailyAvg.toFixed(1)}` : "—"}
          </p>
        </div>
      </div>

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
            {platformMetrics.length} registro{platformMetrics.length !== 1 ? "s" : ""} en total
          </p>
          <Button size="sm" variant="outline" onClick={() => setSheetOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Registrar snapshot
          </Button>
        </div>
      </div>

      {chartData.length > 0 ? (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground mb-4">Seguidores — {PLATFORM_LABEL[platform]}</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => NUM.format(v)}
                width={70}
                domain={["auto", "auto"]}
              />
              <Tooltip formatter={(v) => [NUM.format(Number(v ?? 0)), "Seguidores"]} />
              <Line
                type="monotone"
                dataKey="followers"
                stroke={PLATFORM_COLOR[platform]}
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Seguidores"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            Sin datos de {PLATFORM_LABEL[platform]} en este período
          </p>
        </div>
      )}

      <RegisterSnapshotSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onRegistered={onRefresh}
        lockedPlatform={platform}
      />
    </div>
  );
}

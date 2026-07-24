"use client";

import { useState, useMemo } from "react";
import { LineChart, Line, BarChart, Bar, Cell, ReferenceLine, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Plus, BarChart2, Clock, TrendingUp, TrendingDown, Users } from "lucide-react";
import { format, subDays, startOfDay, eachDayOfInterval } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SocialMetric } from "@/types/analytics";
import { RegisterSnapshotSheet } from "@/components/analytics/RegisterSnapshotSheet";
import { MetaIntegrationCard } from "@/components/analytics/MetaIntegrationCard";
import { FacebookIntegrationCard } from "@/components/analytics/FacebookIntegrationCard";
import { useProject } from "@/lib/project-context";

type Platform = "instagram" | "tiktok" | "youtube" | "spotify" | "facebook";

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
  /** Instagram y Facebook se conectan vía Meta; el resto es manual. */
  integration?: MetaIntegration;
  comingSoon?: boolean;
}

const PLATFORM_COLOR: Record<Platform, string> = {
  instagram: "#3b82f6",
  tiktok: "#ec4899",
  youtube: "#ef4444",
  spotify: "#22c55e",
  facebook: "#1d4ed8",
};

const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  spotify: "Spotify",
  facebook: "Facebook",
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

/** Clave de día (YYYY-MM-DD) a partir de recordedAt, que puede venir como
 * fecha simple o como timestamp completo. */
function dayKey(recordedAt: string): string {
  return recordedAt.slice(0, 10);
}

/** Cuántos ticks mostrar en el eje X según la cantidad de días, para que no
 * se amontonen las etiquetas. */
function tickInterval(dayCount: number): number {
  if (dayCount <= 7) return 0; // todos los días
  if (dayCount <= 31) return 2; // uno de cada 3
  if (dayCount <= 92) return 6; // ~semanal
  if (dayCount <= 183) return 14;
  return 29; // ~mensual
}

export function PlatformTab({ platform, metrics, onRefresh, integration, comingSoon }: PlatformTabProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [period, setPeriod] = useState<Period>(PERIODS[1]); // default: 30 días
  const { activeProject } = useProject();

  /** Un valor por día: si hay varios registros del mismo día (ej. varios syncs
   * manuales), nos quedamos SOLO con el último (mayor createdAt). */
  const followersByDay = useMemo(() => {
    const map = new Map<string, { followers: number; createdAt: string }>();
    for (const m of metrics) {
      if (m.platform !== platform) continue;
      const key = dayKey(m.recordedAt);
      const prev = map.get(key);
      if (!prev || m.createdAt > prev.createdAt) {
        map.set(key, { followers: m.followers, createdAt: m.createdAt });
      }
    }
    return map;
  }, [metrics, platform]);

  const sortedDays = useMemo(() => Array.from(followersByDay.keys()).sort(), [followersByDay]);

  /**
   * El eje X es un rango CONTINUO de días definido por el período elegido —
   * no la lista de registros. Los días sin dato quedan como null y el gráfico
   * los salta (connectNulls), pero el eje mantiene su escala temporal real.
   */
  const chartData = useMemo(() => {
    const today = startOfDay(new Date());
    let start: Date;

    if (period.days == null) {
      // "Todo": desde el primer registro (o hoy si no hay ninguno).
      start = sortedDays.length > 0 ? startOfDay(new Date(`${sortedDays[0]}T00:00:00`)) : today;
    } else {
      start = subDays(today, period.days - 1);
    }

    if (start > today) start = today;

    return eachDayOfInterval({ start, end: today }).map((date) => {
      const key = format(date, "yyyy-MM-dd");
      const entry = followersByDay.get(key);
      return {
        key,
        label: format(date, "d MMM", { locale: es }),
        followers: entry ? entry.followers : null,
      };
    });
  }, [period, sortedDays, followersByDay]);

  const currentFollowers = useMemo(() => {
    if (sortedDays.length === 0) return null;
    return followersByDay.get(sortedDays[sortedDays.length - 1])?.followers ?? null;
  }, [sortedDays, followersByDay]);

  /** Variación dentro del período visible: primer vs último día CON dato. */
  const stats = useMemo(() => {
    const withData = chartData.filter((d) => d.followers != null);
    if (withData.length < 2) return null;

    const first = withData[0];
    const last = withData[withData.length - 1];
    const delta = (last.followers as number) - (first.followers as number);

    const firstDate = new Date(`${first.key}T00:00:00`);
    const lastDate = new Date(`${last.key}T00:00:00`);
    const elapsedDays = Math.max(
      1,
      Math.round((lastDate.getTime() - firstDate.getTime()) / 86_400_000)
    );

    const dailyAvg = delta / elapsedDays;
    const base = first.followers as number;
    const pct = base > 0 ? (delta / base) * 100 : null;
    return { delta, dailyAvg, pct };
  }, [chartData]);

  const hasAnyDataInPeriod = chartData.some((d) => d.followers != null);

  /** Crecimiento diario = delta contra el día calendario anterior. Solo se
   * calcula cuando AMBOS días tienen dato — si hay un hueco (sync que
   * falló, o historial recién empezando), la barra queda vacía en vez de
   * mostrar un salto que en realidad ocurrió a lo largo de varios días. */
  const growthData = useMemo(() => {
    return chartData.map((d, i) => {
      if (i === 0 || d.followers == null) return { label: d.label, delta: null as number | null };
      const prev = chartData[i - 1].followers;
      if (prev == null) return { label: d.label, delta: null };
      return { label: d.label, delta: d.followers - prev };
    });
  }, [chartData]);

  const hasGrowthData = growthData.some((d) => d.delta != null);

  return (
    <div className="space-y-6">
      {comingSoon && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/40 p-3 text-sm text-muted-foreground">
          <Clock className="h-4 w-4 shrink-0" />
          Conexión automática de {PLATFORM_LABEL[platform]} próximamente. Por ahora puedes registrar los
          seguidores a mano para ir siguiendo la evolución.
        </div>
      )}

      {integration &&
        (platform === "facebook" ? (
          <FacebookIntegrationCard integration={integration} onRefresh={onRefresh} projectId={activeProject?.id} />
        ) : (
          <MetaIntegrationCard integration={integration} onRefresh={onRefresh} projectId={activeProject?.id} />
        ))}

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
            {sortedDays.length} día{sortedDays.length !== 1 ? "s" : ""} con datos
          </p>
          <Button size="sm" variant="outline" onClick={() => setSheetOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Registrar snapshot
          </Button>
        </div>
      </div>

      {hasAnyDataInPeriod ? (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground mb-4">Seguidores — {PLATFORM_LABEL[platform]}</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                interval={tickInterval(chartData.length)}
                minTickGap={8}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => NUM.format(v)}
                width={70}
                domain={["auto", "auto"]}
                allowDecimals={false}
              />
              <Tooltip formatter={(v) => [NUM.format(Number(v ?? 0)), "Seguidores"]} />
              <Line
                type="monotone"
                dataKey="followers"
                stroke={PLATFORM_COLOR[platform]}
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Seguidores"
                connectNulls
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

      {hasGrowthData && (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground mb-4">
            Crecimiento diario — {PLATFORM_LABEL[platform]}
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={growthData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                interval={tickInterval(growthData.length)}
                minTickGap={8}
              />
              <YAxis tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
              <ReferenceLine y={0} className="stroke-border" />
              <Tooltip
                formatter={(v) => {
                  const n = Number(v ?? 0);
                  return [`${n >= 0 ? "+" : ""}${NUM.format(n)}`, "Variación"];
                }}
              />
              <Bar dataKey="delta" radius={[3, 3, 3, 3]}>
                {growthData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={
                      d.delta == null
                        ? "transparent"
                        : d.delta >= 0
                        ? "#16a34a"
                        : "#dc2626"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
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

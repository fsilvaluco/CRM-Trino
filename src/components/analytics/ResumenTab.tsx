"use client";

import { useState } from "react";
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
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import type { SocialMetric } from "@/types/analytics";
import { RegisterSnapshotSheet } from "@/components/analytics/RegisterSnapshotSheet";

interface ResumenTabProps {
  metrics: SocialMetric[];
  onRefresh: () => void;
}

function buildChartData(metrics: SocialMetric[]) {
  const byDate: Record<string, Record<string, number>> = {};
  const sorted = [...metrics].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  for (const m of sorted) {
    if (!byDate[m.recordedAt]) byDate[m.recordedAt] = {};
    byDate[m.recordedAt][m.platform] = m.followers;
  }
  return Object.entries(byDate).map(([date, platforms]) => ({
    date,
    label: format(new Date(date), "d MMM", { locale: es }),
    ...platforms,
  }));
}

export function ResumenTab({ metrics, onRefresh }: ResumenTabProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const chartData = buildChartData(metrics);
  const hasInstagram = metrics.some((m) => m.platform === "instagram");
  const hasTiktok = metrics.some((m) => m.platform === "tiktok");
  const hasYoutube = metrics.some((m) => m.platform === "youtube");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {metrics.length} registro{metrics.length !== 1 ? "s" : ""} de redes sociales — todas las plataformas
        </p>
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Registrar snapshot
        </Button>
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

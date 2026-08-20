"use client";

import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ThumbsUp } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { Show } from "@/types/analytics";

interface VibeTrendChartProps {
  shows: Show[];
}

function buildChartData(shows: Show[]) {
  const byMonth = new Map<string, { label: string; total: number; count: number; sortKey: string }>();
  for (const s of shows) {
    if (s.avgVibe == null) continue;
    const d = new Date(`${s.date}T00:00:00`);
    const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = format(d, "MMM yyyy", { locale: es });
    const existing = byMonth.get(sortKey);
    if (existing) {
      existing.total += s.avgVibe;
      existing.count += 1;
    } else {
      byMonth.set(sortKey, { label, total: s.avgVibe, count: 1, sortKey });
    }
  }
  return [...byMonth.values()]
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map((m) => ({ label: m.label, vibe: Number((m.total / m.count).toFixed(1)) }));
}

export function VibeTrendChart({ shows }: VibeTrendChartProps) {
  const chartData = useMemo(() => buildChartData(shows), [shows]);

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ThumbsUp className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Sin calificaciones de vibe en este período</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground mb-4">Vibe promedio por mes</p>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} domain={[0, 10]} width={30} />
          <Tooltip
            contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8 }}
            labelStyle={{ color: "#0f172a", fontWeight: 600 }}
            itemStyle={{ color: "#0f172a" }}
            formatter={(v) => [v, "Vibe"]}
          />
          <Line type="monotone" dataKey="vibe" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="Vibe" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

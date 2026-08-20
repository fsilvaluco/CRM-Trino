"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Calendar } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { Show } from "@/types/analytics";

interface EventsPerMonthChartProps {
  shows: Show[];
}

function buildChartData(shows: Show[]) {
  const byMonth = new Map<string, { label: string; count: number; sortKey: string }>();
  for (const s of shows) {
    const d = new Date(`${s.date}T00:00:00`);
    const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = format(d, "MMM yyyy", { locale: es });
    const existing = byMonth.get(sortKey);
    if (existing) existing.count += 1;
    else byMonth.set(sortKey, { label, count: 1, sortKey });
  }
  return [...byMonth.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

export function EventsPerMonthChart({ shows }: EventsPerMonthChartProps) {
  const chartData = useMemo(() => buildChartData(shows), [shows]);

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Calendar className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Sin eventos en este período</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground mb-4">Eventos por mes</p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={30} />
          <Tooltip
            contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8 }}
            labelStyle={{ color: "#0f172a", fontWeight: 600 }}
            itemStyle={{ color: "#0f172a" }}
            formatter={(v) => [`${v}`, "Eventos"]}
          />
          <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

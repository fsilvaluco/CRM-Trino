"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { PRESS_SOURCE_LABELS, type PressMention } from "@/types/press";

const SOURCE_COLORS: Record<string, string> = {
  earned: "#3b82f6",
  own: "#94a3b8",
  partner: "#f59e0b",
};

interface PressMonthlyChartProps {
  mentions: PressMention[];
}

export function PressMonthlyChart({ mentions }: PressMonthlyChartProps) {
  const chartData = useMemo(() => {
    const withDate = mentions.filter((m) => m.mentionDate);
    if (withDate.length === 0) return [];

    const byMonth = new Map<string, { earned: number; own: number; partner: number }>();
    withDate.forEach((m) => {
      const key = m.mentionDate!.slice(0, 7); // YYYY-MM
      const bucket = byMonth.get(key) ?? { earned: 0, own: 0, partner: 0 };
      bucket[m.source] += 1;
      byMonth.set(key, bucket);
    });

    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, counts]) => ({
        label: format(new Date(`${key}-01T00:00:00`), "MMM yy", { locale: es }),
        ...counts,
      }));
  }, [mentions]);

  if (chartData.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground mb-4">Menciones por mes</p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={30} />
          <Tooltip contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8 }} labelStyle={{ color: "#0f172a", fontWeight: 600 }}
                itemStyle={{ color: "#0f172a" }} />
          <Legend
            formatter={(value) => PRESS_SOURCE_LABELS[value as keyof typeof PRESS_SOURCE_LABELS] ?? value}
            wrapperStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="earned" stackId="a" name="earned" fill={SOURCE_COLORS.earned} radius={[0, 0, 0, 0]} />
          <Bar dataKey="own" stackId="a" name="own" fill={SOURCE_COLORS.own} />
          <Bar dataKey="partner" stackId="a" name="partner" fill={SOURCE_COLORS.partner} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

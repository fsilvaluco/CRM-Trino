"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Wallet } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { Show } from "@/types/analytics";

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

interface IncomeExpensesChartProps {
  shows: Show[];
}

function buildChartData(shows: Show[]) {
  const byMonth = new Map<string, { label: string; ingresos: number; egresos: number; sortKey: string }>();
  for (const s of shows) {
    const d = new Date(`${s.date}T00:00:00`);
    const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = format(d, "MMM yyyy", { locale: es });
    const ingresos = ((s.fee ?? 0) + (s.ticketIncome ?? 0)) / 100;
    const egresos = (s.expenses ?? 0) / 100;
    const existing = byMonth.get(sortKey);
    if (existing) {
      existing.ingresos += ingresos;
      existing.egresos += egresos;
    } else {
      byMonth.set(sortKey, { label, ingresos, egresos, sortKey });
    }
  }
  return [...byMonth.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

export function IncomeExpensesChart({ shows }: IncomeExpensesChartProps) {
  const chartData = useMemo(() => buildChartData(shows), [shows]);

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Wallet className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Sin ingresos/egresos en este período</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground mb-4">Ingresos vs. egresos por mes (CLP)</p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => CLP.format(v)} width={90} />
          <Tooltip
            contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8 }}
            labelStyle={{ color: "#0f172a", fontWeight: 600 }}
            itemStyle={{ color: "#0f172a" }}
            formatter={(v, name) => [CLP.format(Number(v ?? 0)), name === "ingresos" ? "Ingresos" : "Egresos"]}
          />
          <Legend formatter={(v) => (v === "ingresos" ? "Ingresos" : "Egresos")} />
          <Bar dataKey="ingresos" fill="#22c55e" radius={[4, 4, 0, 0]} />
          <Bar dataKey="egresos" fill="#ef4444" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ShoppingBag } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { ShopifySalesMonth } from "@/types/analytics";

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

interface MerchSalesChartProps {
  sales: ShopifySalesMonth[];
}

function buildChartData(sales: ShopifySalesMonth[]) {
  return [...sales]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((s) => ({
      label: format(new Date(`${s.month}T00:00:00`), "MMM yyyy", { locale: es }),
      total: s.totalSales / 100,
    }));
}

export function MerchSalesChart({ sales }: MerchSalesChartProps) {
  const chartData = useMemo(() => buildChartData(sales), [sales]);

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ShoppingBag className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Sin ventas de merch en este período</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground mb-4">Ventas de merch por mes (CLP)</p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => CLP.format(v)} width={90} />
          <Tooltip
            contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8 }}
            labelStyle={{ color: "#0f172a", fontWeight: 600 }}
            itemStyle={{ color: "#0f172a" }}
            formatter={(v) => [CLP.format(Number(v ?? 0)), "Ventas"]}
          />
          <Bar dataKey="total" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

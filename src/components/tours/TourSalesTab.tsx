"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { expectedFraction, daysBetween } from "@/lib/tours/curve";
import { shortDate } from "@/components/tours/labels";
import type { SalesPoint, TourDetail } from "@/types/tours";

const TOOLTIP = {
  contentStyle: { backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8 },
  labelStyle: { color: "#0f172a", fontWeight: 600 },
  itemStyle: { color: "#0f172a" },
};

const BAR_COLOR: Record<string, string> = {
  bajo_equilibrio: "#dc2626",
  bajo_meta: "#d97706",
  en_ritmo: "#059669",
};

export function TourSalesTab({ data }: { data: TourDetail }) {
  const { tour } = data;
  const dates = data.dates.filter((d) => d.showStatus !== "cancelado");
  const [points, setPoints] = useState<SalesPoint[]>([]);
  const [showId, setShowId] = useState<string>(() => {
    const weakest = [...dates].sort((a, b) => (a.projectedPct ?? 999) - (b.projectedPct ?? 999))[0];
    return weakest?.showId ?? "";
  });

  useEffect(() => {
    fetch(`/api/giras/${tour.id}/ventas`)
      .then((r) => r.json())
      .then((d) => setPoints(Array.isArray(d) ? d : []))
      .catch(() => setPoints([]));
  }, [tour.id]);

  const ranking = dates.map((d) => ({
    city: d.city,
    pct: d.pctCapacity ?? 0,
    projected: ["no_iniciada", "sin_datos"].includes(d.paceStatus) ? 0 : d.projectedPct ?? 0,
    status: d.paceStatus,
  }));

  const selected = dates.find((d) => d.showId === showId);

  // Curva real (puntos de goal_history) vs esperada (día a día) para la fecha elegida.
  const curve = useMemo(() => {
    if (!selected || !selected.target) return [];
    const total = daysBetween(selected.salesStart, selected.date);
    const today = new Date().toISOString().slice(0, 10);
    const real = points.filter((p) => p.showId === selected.showId);
    const rows: { day: string; esperado: number; real: number | null }[] = [];
    for (let i = 0; i <= total; i += Math.max(1, Math.floor(total / 40))) {
      const day = new Date(new Date(`${selected.salesStart}T12:00:00`).getTime() + i * 86_400_000).toISOString().slice(0, 10);
      const lastReal = day <= today ? [...real].filter((p) => p.capturedAt.slice(0, 10) <= day).pop() : undefined;
      rows.push({
        day,
        esperado: Math.round(selected.target * expectedFraction(i, total, tour.lateSalesShare, tour.lateSalesDays)),
        real: day <= today ? lastReal?.sold ?? 0 : null,
      });
    }
    return rows;
  }, [selected, points, tour.lateSalesShare, tour.lateSalesDays]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-4">
        <p className="mb-1 text-sm font-semibold">Ocupación por ciudad</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Barra = proyección al día del show. Líneas: meta {tour.targetOccupancyPct}%
          {tour.breakevenPct !== null && ` y equilibrio ${tour.breakevenPct}%`}.
        </p>
        <ResponsiveContainer width="100%" height={Math.max(220, ranking.length * 34)}>
          <BarChart data={ranking} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
            <YAxis type="category" dataKey="city" tick={{ fontSize: 11 }} width={90} />
            <Tooltip {...TOOLTIP} formatter={(v, k) => [`${v}%`, k === "projected" ? "Proyección" : "Vendido"]} />
            <ReferenceLine x={tour.targetOccupancyPct} stroke="#059669" strokeDasharray="4 4" />
            {tour.breakevenPct !== null && <ReferenceLine x={tour.breakevenPct} stroke="#dc2626" strokeDasharray="4 4" />}
            <Bar dataKey="projected" radius={[0, 4, 4, 0]}>
              {ranking.map((r) => (
                <Cell key={r.city} fill={BAR_COLOR[r.status] ?? "#94a3b8"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {ranking.every((r) => r.projected === 0) && (
          <p className="text-xs text-muted-foreground">Todavía no hay venta registrada en ninguna fecha.</p>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Ritmo de venta</p>
            <p className="text-xs text-muted-foreground">Real acumulado vs lo esperado para llegar a la meta.</p>
          </div>
          <Select value={showId} onValueChange={(v) => setShowId(v ?? "")}>
            <SelectTrigger className="h-8 w-56 cursor-pointer text-xs">
              <SelectValue>{selected ? `${selected.city} · ${shortDate(selected.date)}` : "Elige fecha"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {dates.map((d) => (
                <SelectItem key={d.showId} value={d.showId}>{d.city} · {shortDate(d.date)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {curve.length === 0 ? (
          <p className="text-sm text-muted-foreground">Falta aforo o meta para esta fecha.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={curve} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="day" tickFormatter={(d) => shortDate(d)} tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={36} />
              <Tooltip {...TOOLTIP} labelFormatter={(d) => shortDate(String(d))} />
              <Line type="monotone" dataKey="esperado" name="Esperado" stroke="#94a3b8" strokeDasharray="5 4" dot={false} />
              <Line type="stepAfter" dataKey="real" name="Real" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>
    </div>
  );
}

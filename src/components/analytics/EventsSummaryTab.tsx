"use client";

import { useState, useMemo } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Music, Settings2 } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Show } from "@/types/analytics";

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return CLP.format(cents / 100);
}

interface Period {
  key: string;
  label: string;
  months: number | null; // null = todo el historial
}

const PERIODS: Period[] = [
  { key: "3m", label: "3 meses", months: 3 },
  { key: "6m", label: "6 meses", months: 6 },
  { key: "12m", label: "12 meses", months: 12 },
  { key: "all", label: "Todo", months: null },
];

interface EventsSummaryTabProps {
  shows: Show[];
}

// Solo lectura -- crear y editar eventos (logística + plata) se hace desde
// el módulo completo /eventos. Este dashboard solo lee la misma tabla,
// filtrada del lado del servidor a status="realizado" (ver
// /api/analytics/eventos) para no mezclar utilidad de eventos cotizando o
// cancelados con la de eventos que efectivamente pasaron.
export function EventsSummaryTab({ shows }: EventsSummaryTabProps) {
  const [period, setPeriod] = useState<Period>(PERIODS[3]); // default: todo el historial

  const filteredShows = useMemo(() => {
    if (period.months == null) return shows;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - period.months);
    return shows.filter((s) => new Date(s.date) >= cutoff);
  }, [shows, period]);

  // El grafico agrupa por mes (no un bloque por evento individual) -- con
  // meses de historial mezclando muchas fechas, un bloque por evento se
  // vuelve ilegible y no se ve la tendencia real. Eventos con
  // financialsUntracked (plata que vive en Excel aparte, de antes de
  // llevar costos acá) quedan afuera -- sumarlos como ingreso puro sin
  // sus costos reales inflaría el mes de forma engañosa.
  const chartData = useMemo(() => {
    const byMonth = new Map<string, { label: string; utilidad: number; sortKey: string }>();
    for (const s of filteredShows) {
      if (s.financialsUntracked || s.utility == null) continue;
      const d = new Date(`${s.date}T00:00:00`);
      const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = format(d, "MMM yyyy", { locale: es });
      const utilidad = s.utility / 100;
      const existing = byMonth.get(sortKey);
      if (existing) existing.utilidad += utilidad;
      else byMonth.set(sortKey, { label, utilidad, sortKey });
    }
    return [...byMonth.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [filteredShows]);

  const sortedShows = useMemo(
    () => [...filteredShows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [filteredShows]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground">
          {filteredShows.length} evento{filteredShows.length !== 1 ? "s" : ""} realizado{filteredShows.length !== 1 ? "s" : ""}
        </p>
        <Link href="/eventos" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Settings2 className="h-4 w-4 mr-2" />
          Gestionar eventos
        </Link>
      </div>

      <div className="flex items-center gap-1 rounded-lg border p-1 w-fit">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p)}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer",
              period.key === p.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      {chartData.length > 0 ? (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground mb-4">Utilidad por mes (CLP)</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => CLP.format(v)} width={90} />
              <Tooltip
                contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8 }}
                labelStyle={{ color: "#0f172a", fontWeight: 600 }}
                itemStyle={{ color: "#0f172a" }}
                formatter={(v) => [CLP.format(Number(v ?? 0)), "Utilidad"]}
              />
              <Bar dataKey="utilidad" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {/* Table */}
      {sortedShows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Music className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Sin eventos realizados en este rango</p>
          <p className="text-xs text-muted-foreground mt-1">
            Se muestran aquí en cuanto marques un evento como &ldquo;Realizado&rdquo; en el módulo de Eventos.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Fecha</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Venue</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Ciudad</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Fee</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Entradas</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Egresos</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Utilidad</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Vibe</th>
              </tr>
            </thead>
            <tbody>
              {sortedShows.map((show) => {
                const untracked = show.financialsUntracked || show.utility == null;
                const utilidad = show.utility ?? 0;
                return (
                  <tr key={show.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2 whitespace-nowrap">
                      {format(new Date(show.date), "d MMM yyyy", { locale: es })}
                    </td>
                    <td className="px-4 py-2 font-medium">{show.venue}</td>
                    <td className="px-4 py-2 text-muted-foreground">{show.city ?? "—"}</td>
                    {untracked ? (
                      <td colSpan={4} className="px-4 py-2 text-right text-muted-foreground italic" title="Plata de este evento registrada aparte -- no hay costos cargados en la app">
                        Sin información
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-2 text-right">{formatCents(show.fee)}</td>
                        <td className="px-4 py-2 text-right">{formatCents(show.ticketIncome)}</td>
                        <td className="px-4 py-2 text-right">{formatCents(show.expenses)}</td>
                        <td
                          className={`px-4 py-2 text-right font-semibold ${
                            utilidad >= 0
                              ? "text-green-700 dark:text-green-400"
                              : "text-red-700 dark:text-red-400"
                          }`}
                        >
                          {CLP.format(utilidad / 100)}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-2 text-right">
                      {show.avgVibe != null ? show.avgVibe.toFixed(1) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

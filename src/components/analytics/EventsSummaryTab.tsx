"use client";

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

interface EventsSummaryTabProps {
  shows: Show[];
}

// Solo lectura -- crear y editar eventos (logística + plata) se hace desde
// el módulo completo /eventos. Este dashboard solo lee la misma tabla,
// filtrada del lado del servidor a status="realizado" (ver
// /api/analytics/eventos) para no mezclar utilidad de eventos cotizando o
// cancelados con la de eventos que efectivamente pasaron.
export function EventsSummaryTab({ shows }: EventsSummaryTabProps) {
  const chartData = shows
    .slice()
    .reverse()
    .map((s) => ({
      venue: s.venue,
      utilidad: ((s.fee ?? 0) + (s.ticketIncome ?? 0) - (s.expenses ?? 0)) / 100,
    }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {shows.length} evento{shows.length !== 1 ? "s" : ""} realizado{shows.length !== 1 ? "s" : ""}
        </p>
        <Link href="/eventos" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Settings2 className="h-4 w-4 mr-2" />
          Gestionar eventos
        </Link>
      </div>

      {/* Chart */}
      {chartData.length > 0 ? (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground mb-4">Utilidad por evento (CLP)</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="venue" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => CLP.format(v)} width={90} />
              <Tooltip formatter={(v) => [CLP.format(Number(v ?? 0)), "Utilidad"]} />
              <Bar dataKey="utilidad" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {/* Table */}
      {shows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Music className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Sin eventos realizados todavía</p>
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
              {shows.map((show) => {
                const utilidad =
                  (show.fee ?? 0) + (show.ticketIncome ?? 0) - (show.expenses ?? 0);
                return (
                  <tr key={show.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2 whitespace-nowrap">
                      {format(new Date(show.date), "d MMM yyyy", { locale: es })}
                    </td>
                    <td className="px-4 py-2 font-medium">{show.venue}</td>
                    <td className="px-4 py-2 text-muted-foreground">{show.city ?? "—"}</td>
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

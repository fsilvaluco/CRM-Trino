"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NUM, PCT, ChangeText, change } from "@/components/analytics/spotify-geo-utils";
import type { SpotifyGeoSnapshot } from "@/types/analytics";

// Paleta categórica en orden fijo (validada para daltonismo). El color sigue
// al país mientras esté seleccionado: no se repinta al cambiar la selección.
const SLOTS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const MAX = SLOTS.length;
const TOP = 10;

interface SpotifyCountryEvolutionProps {
  projectId: string;
  current: SpotifyGeoSnapshot[];
  previous: SpotifyGeoSnapshot[];
  cutCount: number;
}

function defaultSelection(countries: SpotifyGeoSnapshot[]): string[] {
  // Si el primer país aplasta al resto (ej. Chile 4x México), se parte del 2º
  // para que el gráfico muestre algo legible; se puede sumar con un clic.
  const [first, second] = countries;
  const skipFirst = first && second && (first.listeners ?? 0) > 3 * (second.listeners ?? 1);
  return countries.slice(skipFirst ? 1 : 0, (skipFirst ? 1 : 0) + 4).map((c) => c.country);
}

/** Tabla de países del corte + evolución de oyentes por país entre cortes. */
export function SpotifyCountryEvolution({ projectId, current, previous, cutCount }: SpotifyCountryEvolutionProps) {
  const countries = useMemo(
    () => current.filter((r) => r.scope === "country").sort((a, b) => (b.listeners ?? 0) - (a.listeners ?? 0)),
    [current],
  );
  const prevByCountry = useMemo(
    () => new Map(previous.filter((r) => r.scope === "country").map((r) => [r.country, r.listeners])),
    [previous],
  );

  // país -> slot de color, estable mientras siga seleccionado. null = todavía
  // no se tocó: se usa la selección por defecto del corte.
  const [custom, setCustom] = useState<Map<string, number> | null>(null);
  const slots = useMemo(
    () => custom ?? new Map(defaultSelection(countries).map((c, i) => [c, i] as [string, number])),
    [custom, countries],
  );
  const selected = useMemo(() => [...slots.keys()], [slots]);
  const selKey = selected.join(",");

  const [seriesState, setSeriesState] = useState<{ key: string; rows: SpotifyGeoSnapshot[] } | null>(null);

  useEffect(() => {
    if (!selKey || cutCount < 2) return;
    const qs = new URLSearchParams({ projectId, countries: selKey });
    let cancelled = false;
    fetch(`/api/analytics/spotify/geo?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : { series: [] }))
      .catch(() => ({ series: [] }))
      .then((d) => {
        if (!cancelled) setSeriesState({ key: selKey, rows: Array.isArray(d.series) ? d.series : [] });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, selKey, cutCount]);

  const series = seriesState?.key === selKey ? seriesState.rows : null;

  const toggle = (country: string) => {
    setCustom(() => {
      const next = new Map(slots);
      if (next.has(country)) {
        next.delete(country);
      } else if (next.size < MAX) {
        const used = new Set(next.values());
        const free = SLOTS.findIndex((_, i) => !used.has(i));
        next.set(country, free);
      }
      return next;
    });
  };

  const chartData = useMemo(() => {
    const byEnd = new Map<string, Record<string, number | string | null>>();
    for (const r of series ?? []) {
      const row = byEnd.get(r.periodEnd) ?? { periodEnd: r.periodEnd };
      row[r.country] = r.listeners;
      byEnd.set(r.periodEnd, row);
    }
    return [...byEnd.values()]
      .sort((a, b) => String(a.periodEnd).localeCompare(String(b.periodEnd)))
      .map((row) => ({ ...row, label: format(new Date(`${row.periodEnd}T00:00:00`), "d MMM", { locale: es }) }));
  }, [series]);

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div>
        <p className="text-sm font-medium">Evolución por país</p>
        <p className="text-xs text-muted-foreground">Marca hasta {MAX} países para compararlos en el gráfico.</p>
      </div>

      {cutCount < 2 ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          La evolución aparece desde el segundo corte semanal.
        </p>
      ) : selected.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Marca al menos un país.</p>
      ) : series && chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => NUM.format(v)} width={60} />
            <Tooltip
              contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8 }}
              labelStyle={{ color: "#0f172a", fontWeight: 600 }}
              itemStyle={{ color: "#0f172a" }}
              formatter={(v, name) => [v != null ? NUM.format(Number(v)) : "—", String(name)]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span className="text-foreground">{v}</span>} />
            {selected.map((c) => (
              <Line
                key={c}
                type="monotone"
                dataKey={c}
                name={c}
                stroke={SLOTS[slots.get(c) ?? 0]}
                strokeWidth={2}
                dot={{ r: 4 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[240px] rounded-lg bg-muted animate-pulse" />
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>País</TableHead>
            <TableHead className="text-right">Oyentes</TableHead>
            <TableHead className="text-right">% activos</TableHead>
            <TableHead className="text-right">vs corte anterior</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {countries.slice(0, TOP).map((c) => {
            const slot = slots.get(c.country);
            const checked = slot != null;
            return (
              <TableRow key={c.country} className="cursor-pointer" onClick={() => toggle(c.country)}>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={checked}
                    disabled={!checked && slots.size >= MAX}
                    onCheckedChange={() => toggle(c.country)}
                    aria-label={`Mostrar ${c.country} en el gráfico`}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-2">
                    {checked && (
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SLOTS[slot] }} aria-hidden />
                    )}
                    {c.country}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.listeners != null ? NUM.format(c.listeners) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {c.activeListeners != null && c.listeners ? PCT.format(c.activeListeners / c.listeners) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <ChangeText value={change(c.listeners, prevByCountry.get(c.country))} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

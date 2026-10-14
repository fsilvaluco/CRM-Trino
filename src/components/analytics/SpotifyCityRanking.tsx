"use client";

import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NUM, PCT, ChangeText, change, geoKey } from "@/components/analytics/spotify-geo-utils";
import type { SpotifyGeoSnapshot } from "@/types/analytics";

const ALL = "__all__";
const PAGE = 15;

interface SpotifyCityRankingProps {
  current: SpotifyGeoSnapshot[];
  previous: SpotifyGeoSnapshot[];
}

/** Ranking de ciudades del corte, filtrable por país, con variación vs el corte anterior. */
export function SpotifyCityRanking({ current, previous }: SpotifyCityRankingProps) {
  const [country, setCountry] = useState<string>(ALL);
  const [limit, setLimit] = useState(PAGE);

  const prevByKey = useMemo(() => new Map(previous.map((r) => [geoKey(r), r])), [previous]);
  const countryListeners = useMemo(
    () => new Map(current.filter((r) => r.scope === "country").map((r) => [r.country, r.listeners ?? 0])),
    [current],
  );

  const cities = useMemo(
    () => current.filter((r) => r.scope === "city").sort((a, b) => (b.listeners ?? 0) - (a.listeners ?? 0)),
    [current],
  );

  // Países con ciudades en este corte, ordenados por oyentes del país.
  const countryOptions = useMemo(() => {
    const set = [...new Set(cities.map((c) => c.country))];
    return set.sort((a, b) => (countryListeners.get(b) ?? 0) - (countryListeners.get(a) ?? 0));
  }, [cities, countryListeners]);

  // "Todos": solo el top mundial de Spotify (rank). Las ciudades extra que se
  // cargan filtrando por país (ej. México, Perú) aparecen al elegir ese país.
  const rows = country === ALL ? cities.filter((c) => c.rank != null) : cities.filter((c) => c.country === country);
  const visible = rows.slice(0, limit);
  const countryTotal = country === ALL ? null : countryListeners.get(country) ?? null;

  if (cities.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Sin ciudades en este corte.</div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium">Ranking de ciudades</p>
          <p className="text-xs text-muted-foreground">
            {country === ALL
              ? "Top mundial"
              : `${country}${countryTotal ? ` · ${NUM.format(countryTotal)} oyentes en el país` : ""}`}
          </p>
        </div>
        <Select
          value={country}
          onValueChange={(v) => {
            setCountry(v ?? ALL);
            setLimit(PAGE);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue>{(v: string) => (v === ALL ? "Todos los países" : v)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los países</SelectItem>
            {countryOptions.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Ciudad</TableHead>
            <TableHead className="text-right">Oyentes</TableHead>
            <TableHead className="text-right">{country === ALL ? "País" : "% del país"}</TableHead>
            <TableHead className="text-right">vs corte anterior</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((c, i) => {
            const before = prevByKey.get(geoKey(c))?.listeners;
            return (
              <TableRow key={geoKey(c)}>
                <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                <TableCell className="font-medium">
                  {c.city}
                  {c.region && <span className="ml-1 text-xs text-muted-foreground">{c.region}</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.listeners != null ? NUM.format(c.listeners) : "—"}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {country === ALL
                    ? c.country
                    : countryTotal && c.listeners != null
                      ? PCT.format(c.listeners / countryTotal)
                      : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <ChangeText value={change(c.listeners, before)} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {rows.length > limit && (
        <div className="flex justify-center">
          <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + PAGE * 2)}>
            Ver más ({rows.length - limit} restantes)
          </Button>
        </div>
      )}
    </div>
  );
}

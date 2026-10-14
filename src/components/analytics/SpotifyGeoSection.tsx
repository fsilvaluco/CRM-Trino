"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SpotifyCountryEvolution } from "@/components/analytics/SpotifyCountryEvolution";
import { SpotifyCityRanking } from "@/components/analytics/SpotifyCityRanking";
import type { SpotifyGeoSnapshot } from "@/types/analytics";

interface GeoResponse {
  cuts: string[];
  current: SpotifyGeoSnapshot[];
  previous: SpotifyGeoSnapshot[];
}

function cutLabel(periodEnd: string): string {
  const end = new Date(`${periodEnd}T00:00:00`);
  const start = new Date(end);
  start.setDate(start.getDate() - 27);
  return `${format(start, "d MMM", { locale: es })} – ${format(end, "d MMM yyyy", { locale: es })}`;
}

interface SpotifyGeoSectionProps {
  projectId: string | undefined;
}

/** Oyentes por país y ciudad (cortes de 28 días de Spotify for Artists). */
export function SpotifyGeoSection({ projectId }: SpotifyGeoSectionProps) {
  // El padre monta este componente con key={projectId}: al cambiar de artista
  // parte de cero (último corte, sin datos del artista anterior).
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const [result, setResult] = useState<{ key: string; data: GeoResponse | null } | null>(null);

  const requestKey = `${projectId ?? ""}|${periodEnd ?? ""}`;

  useEffect(() => {
    if (!projectId) return;
    const qs = new URLSearchParams({ projectId });
    if (periodEnd) qs.set("periodEnd", periodEnd);
    let cancelled = false;
    fetch(`/api/analytics/spotify/geo?${qs.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((data: GeoResponse | null) => {
        if (!cancelled) setResult({ key: `${projectId}|${periodEnd ?? ""}`, data });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, periodEnd]);

  const loading = result?.key !== requestKey;
  const data = result?.data ?? null;

  if (!projectId) return null;
  if (loading && !data) return <div className="h-64 rounded-lg bg-muted animate-pulse" />;
  if (!data || data.cuts.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        Todavía no hay datos de países y ciudades para este artista. Se cargan solos en la revisión semanal de los viernes.
      </div>
    );
  }

  const selected = periodEnd ?? data.cuts[0];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">Países y ciudades</p>
          <span className="text-xs text-muted-foreground">oyentes en 28 días · Spotify for Artists</span>
        </div>
        <Select value={selected} onValueChange={(v) => v && setPeriodEnd(v)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue>{(v: string) => cutLabel(v)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {data.cuts.map((c) => (
              <SelectItem key={c} value={c}>
                {cutLabel(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SpotifyCountryEvolution
          projectId={projectId}
          current={data.current}
          previous={data.previous}
          cutCount={data.cuts.length}
        />
        <SpotifyCityRanking current={data.current} previous={data.previous} />
      </div>
    </section>
  );
}

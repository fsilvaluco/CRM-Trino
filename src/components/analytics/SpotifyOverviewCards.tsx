"use client";

import { useMemo } from "react";
import { Headphones, Radio, PlayCircle, Users } from "lucide-react";
import type { SpotifyStatsSnapshot, SocialMetric } from "@/types/analytics";

const NUM = new Intl.NumberFormat("es-CL");

interface SpotifyOverviewCardsProps {
  snapshots: SpotifyStatsSnapshot[];
  followerMetrics: SocialMetric[];
}

function fmt(n: number | null | undefined): string {
  return n != null ? NUM.format(n) : "—";
}

export function SpotifyOverviewCards({ snapshots, followerMetrics }: SpotifyOverviewCardsProps) {
  const latestSnapshot = useMemo(
    () => [...snapshots].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0] ?? null,
    [snapshots]
  );

  const latestFollowers = useMemo(() => {
    const spotify = followerMetrics
      .filter((m) => m.platform === "spotify")
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    return spotify[0]?.followers ?? latestSnapshot?.followers ?? null;
  }, [followerMetrics, latestSnapshot]);

  const cards = [
    { label: "Oyentes mensuales", value: latestSnapshot?.listeners, icon: Headphones },
    { label: "Oyentes activos", value: latestSnapshot?.monthlyActiveListeners, icon: Radio },
    { label: "Reproducciones", value: latestSnapshot?.streams, icon: PlayCircle },
    { label: "Seguidores", value: latestFollowers, icon: Users },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <c.icon className="h-3 w-3" /> {c.label}
          </p>
          <p className="text-lg font-bold">{fmt(c.value)}</p>
        </div>
      ))}
      {latestSnapshot && (
        <p className="col-span-2 sm:col-span-4 text-xs text-muted-foreground -mt-1">
          Último registro: período hasta {latestSnapshot.periodEnd}
        </p>
      )}
    </div>
  );
}

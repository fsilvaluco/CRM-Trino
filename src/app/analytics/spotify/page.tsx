"use client";

import { useState } from "react";
import { Music, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnalyticsPageHeader } from "@/components/analytics/AnalyticsPageHeader";
import { SpotifyOverviewCards } from "@/components/analytics/SpotifyOverviewCards";
import { SpotifyStatsSheet } from "@/components/analytics/SpotifyStatsSheet";
import { SpotifyStatsTable } from "@/components/analytics/SpotifyStatsTable";
import { SpotifyStatsCharts } from "@/components/analytics/SpotifyStatsCharts";
import { useAnalyticsData } from "@/lib/use-analytics-data";
import type { SpotifyStatsSnapshot } from "@/types/analytics";

export default function AnalyticsSpotifyPage() {
  const { social, spotifyStats, loading, refresh } = useAnalyticsData();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingSnapshot, setEditingSnapshot] = useState<SpotifyStatsSnapshot | null>(null);

  const openCreate = () => {
    setEditingSnapshot(null);
    setSheetOpen(true);
  };

  const openEdit = (snapshot: SpotifyStatsSnapshot) => {
    setEditingSnapshot(snapshot);
    setSheetOpen(true);
  };

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader icon={Music} title="Spotify" description="Seguidores, oyentes y reproducciones" />
      {loading ? (
        <div className="h-64 rounded-lg bg-muted animate-pulse" />
      ) : (
        <>
          <SpotifyOverviewCards snapshots={spotifyStats} followerMetrics={social} />

          <SpotifyStatsCharts snapshots={spotifyStats} followerMetrics={social} />

          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Estadísticas detalladas</p>
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Camera className="h-4 w-4 mr-2" />
              Subir pantallazo / registrar
            </Button>
          </div>
          <SpotifyStatsTable snapshots={spotifyStats} onEdit={openEdit} onDeleted={refresh} />

          <SpotifyStatsSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            onRegistered={refresh}
            editingSnapshot={editingSnapshot}
          />
        </>
      )}
    </div>
  );
}

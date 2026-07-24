"use client";

import { useState } from "react";
import { Music, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnalyticsPageHeader } from "@/components/analytics/AnalyticsPageHeader";
import { PlatformTab } from "@/components/analytics/PlatformTab";
import { SpotifyStatsSheet } from "@/components/analytics/SpotifyStatsSheet";
import { SpotifyStatsTable } from "@/components/analytics/SpotifyStatsTable";
import { useAnalyticsData } from "@/lib/use-analytics-data";

export default function AnalyticsSpotifyPage() {
  const { social, spotifyStats, loading, refresh } = useAnalyticsData();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader icon={Music} title="Spotify" description="Seguidores, oyentes y reproducciones" />
      {loading ? (
        <div className="h-64 rounded-lg bg-muted animate-pulse" />
      ) : (
        <>
          <PlatformTab platform="spotify" metrics={social} onRefresh={refresh} comingSoon />

          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Estadísticas detalladas</p>
            <Button size="sm" variant="outline" onClick={() => setSheetOpen(true)}>
              <Camera className="h-4 w-4 mr-2" />
              Subir pantallazo / registrar
            </Button>
          </div>
          <SpotifyStatsTable snapshots={spotifyStats} />

          <SpotifyStatsSheet open={sheetOpen} onOpenChange={setSheetOpen} onRegistered={refresh} />
        </>
      )}
    </div>
  );
}

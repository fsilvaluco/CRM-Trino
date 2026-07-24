"use client";

import { Music } from "lucide-react";
import { AnalyticsPageHeader } from "@/components/analytics/AnalyticsPageHeader";
import { PlatformTab } from "@/components/analytics/PlatformTab";
import { useAnalyticsData } from "@/lib/use-analytics-data";

export default function AnalyticsSpotifyPage() {
  const { social, loading, refresh } = useAnalyticsData();

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader icon={Music} title="Spotify" description="Seguidores del perfil de artista" />
      {loading ? (
        <div className="h-64 rounded-lg bg-muted animate-pulse" />
      ) : (
        <PlatformTab platform="spotify" metrics={social} onRefresh={refresh} comingSoon />
      )}
    </div>
  );
}

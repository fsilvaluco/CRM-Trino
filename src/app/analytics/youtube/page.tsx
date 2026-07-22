"use client";

import { PlayCircle } from "lucide-react";
import { AnalyticsPageHeader } from "@/components/analytics/AnalyticsPageHeader";
import { PlatformTab } from "@/components/analytics/PlatformTab";
import { useAnalyticsData } from "@/lib/use-analytics-data";

export default function AnalyticsYouTubePage() {
  const { social, loading, refresh } = useAnalyticsData();

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader icon={PlayCircle} title="YouTube" description="Suscriptores de YouTube" />
      {loading ? (
        <div className="h-64 rounded-lg bg-muted animate-pulse" />
      ) : (
        <PlatformTab platform="youtube" metrics={social} onRefresh={refresh} comingSoon />
      )}
    </div>
  );
}

"use client";

import { Music2 } from "lucide-react";
import { AnalyticsPageHeader } from "@/components/analytics/AnalyticsPageHeader";
import { PlatformTab } from "@/components/analytics/PlatformTab";
import { useAnalyticsData } from "@/lib/use-analytics-data";

export default function AnalyticsTikTokPage() {
  const { social, loading, refresh } = useAnalyticsData();

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader icon={Music2} title="TikTok" description="Seguidores de TikTok" />
      {loading ? (
        <div className="h-64 rounded-lg bg-muted animate-pulse" />
      ) : (
        <PlatformTab platform="tiktok" metrics={social} onRefresh={refresh} comingSoon />
      )}
    </div>
  );
}

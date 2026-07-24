"use client";

import { ThumbsUp } from "lucide-react";
import { AnalyticsPageHeader } from "@/components/analytics/AnalyticsPageHeader";
import { PlatformTab } from "@/components/analytics/PlatformTab";
import { useAnalyticsData } from "@/lib/use-analytics-data";

export default function AnalyticsFacebookPage() {
  const { social, facebookIntegration, loading, refresh } = useAnalyticsData();

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader icon={ThumbsUp} title="Facebook" description="Seguidores de la Página" />
      {loading ? (
        <div className="h-64 rounded-lg bg-muted animate-pulse" />
      ) : (
        <PlatformTab platform="facebook" metrics={social} onRefresh={refresh} integration={facebookIntegration} />
      )}
    </div>
  );
}

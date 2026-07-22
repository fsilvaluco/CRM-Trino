"use client";

import { Music } from "lucide-react";
import { AnalyticsPageHeader } from "@/components/analytics/AnalyticsPageHeader";
import { ShowsTab } from "@/components/analytics/ShowsTab";
import { useAnalyticsData } from "@/lib/use-analytics-data";

export default function AnalyticsShowsPage() {
  const { shows, loading, refresh } = useAnalyticsData();

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader icon={Music} title="Shows" description="Fechas, utilidad y vibe de cada show" />
      {loading ? (
        <div className="h-64 rounded-lg bg-muted animate-pulse" />
      ) : (
        <ShowsTab shows={shows} onRefresh={refresh} />
      )}
    </div>
  );
}

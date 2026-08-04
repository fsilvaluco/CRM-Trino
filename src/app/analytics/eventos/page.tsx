"use client";

import { Music } from "lucide-react";
import { AnalyticsPageHeader } from "@/components/analytics/AnalyticsPageHeader";
import { EventsSummaryTab } from "@/components/analytics/EventsSummaryTab";
import { useAnalyticsData } from "@/lib/use-analytics-data";

export default function AnalyticsEventosPage() {
  const { shows, loading } = useAnalyticsData();

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader
        icon={Music}
        title="Eventos"
        description="Utilidad y vibe de cada evento realizado"
      />
      {loading ? (
        <div className="h-64 rounded-lg bg-muted animate-pulse" />
      ) : (
        <EventsSummaryTab shows={shows} />
      )}
    </div>
  );
}

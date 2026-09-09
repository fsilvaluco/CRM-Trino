"use client";

import { useState } from "react";
import { Music2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnalyticsPageHeader } from "@/components/analytics/AnalyticsPageHeader";
import { PlatformTab } from "@/components/analytics/PlatformTab";
import { ManualStatsTable } from "@/components/analytics/ManualStatsTable";
import { ManualStatsDialog } from "@/components/dossier/ManualStatsDialog";
import { useAnalyticsData } from "@/lib/use-analytics-data";

export default function AnalyticsTikTokPage() {
  const { social, manualStats, loading, refresh } = useAnalyticsData();
  const [statsOpen, setStatsOpen] = useState(false);

  const tiktokStats = manualStats.filter((s) => s.platform === "tiktok");

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader
        icon={Music2}
        title="TikTok"
        description="Seguidores, vistas y engagement de TikTok"
        actions={
          <Button size="sm" onClick={() => setStatsOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Registrar estadísticas
          </Button>
        }
      />
      {loading ? (
        <div className="h-64 rounded-lg bg-muted animate-pulse" />
      ) : (
        <>
          <PlatformTab platform="tiktok" metrics={social} onRefresh={refresh} hideRegisterButton />

          <div>
            <p className="text-sm font-medium mb-3">Estadísticas detalladas</p>
            <ManualStatsTable platform="tiktok" snapshots={tiktokStats} onDeleted={refresh} />
          </div>
        </>
      )}

      <ManualStatsDialog open={statsOpen} onOpenChange={setStatsOpen} platform="tiktok" onSaved={refresh} />
    </div>
  );
}

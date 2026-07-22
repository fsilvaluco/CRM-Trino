"use client";

import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Plus, BarChart2, Clock } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import type { SocialMetric } from "@/types/analytics";
import { RegisterSnapshotSheet } from "@/components/analytics/RegisterSnapshotSheet";
import { MetaIntegrationCard } from "@/components/analytics/MetaIntegrationCard";
import { useProject } from "@/lib/project-context";

type Platform = "instagram" | "tiktok" | "youtube";

interface MetaIntegration {
  connected: boolean;
  accountName?: string;
  lastSyncAt?: string;
  tokenExpiresAt?: string;
}

interface PlatformTabProps {
  platform: Platform;
  metrics: SocialMetric[];
  onRefresh: () => void;
  /** Solo Instagram tiene conexión automática hoy. */
  integration?: MetaIntegration;
  comingSoon?: boolean;
}

const PLATFORM_COLOR: Record<Platform, string> = {
  instagram: "#3b82f6",
  tiktok: "#ec4899",
  youtube: "#ef4444",
};

const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

export function PlatformTab({ platform, metrics, onRefresh, integration, comingSoon }: PlatformTabProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { activeProject } = useProject();

  const platformMetrics = metrics
    .filter((m) => m.platform === platform)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

  const chartData = platformMetrics.map((m) => ({
    label: format(new Date(m.recordedAt), "d MMM", { locale: es }),
    followers: m.followers,
  }));

  return (
    <div className="space-y-6">
      {comingSoon && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/40 p-3 text-sm text-muted-foreground">
          <Clock className="h-4 w-4 shrink-0" />
          Conexión automática de {PLATFORM_LABEL[platform]} próximamente. Por ahora puedes registrar los
          seguidores a mano para ir siguiendo la evolución.
        </div>
      )}

      {integration && (
        <MetaIntegrationCard integration={integration} onRefresh={onRefresh} projectId={activeProject?.id} />
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {platformMetrics.length} registro{platformMetrics.length !== 1 ? "s" : ""} de {PLATFORM_LABEL[platform]}
        </p>
        <Button size="sm" variant="outline" onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Registrar snapshot
        </Button>
      </div>

      {chartData.length > 0 ? (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground mb-4">Seguidores — {PLATFORM_LABEL[platform]}</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => new Intl.NumberFormat("es-CL").format(v)}
                width={70}
              />
              <Tooltip
                formatter={(v) => [new Intl.NumberFormat("es-CL").format(Number(v ?? 0)), "Seguidores"]}
              />
              <Line
                type="monotone"
                dataKey="followers"
                stroke={PLATFORM_COLOR[platform]}
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Seguidores"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Sin datos de {PLATFORM_LABEL[platform]} todavía</p>
        </div>
      )}

      <RegisterSnapshotSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onRegistered={onRefresh}
        lockedPlatform={platform}
      />
    </div>
  );
}

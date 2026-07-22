"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useProject } from "@/lib/project-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart2, Music, Users, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { ShowsTab } from "@/components/analytics/ShowsTab";
import { SocialTab } from "@/components/analytics/SocialTab";
import { MerchTab } from "@/components/analytics/MerchTab";
import type { Show, SocialMetric, MerchSnapshot } from "@/types/analytics";

interface MetaIntegration {
  connected: boolean;
  accountName?: string;
  lastSyncAt?: string;
  tokenExpiresAt?: string;
}

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export default function AnalyticsPage() {
  const [shows, setShows] = useState<Show[]>([]);
  const [social, setSocial] = useState<SocialMetric[]>([]);
  const [merch, setMerch] = useState<MerchSnapshot[]>([]);
  const [metaIntegration, setMetaIntegration] = useState<MetaIntegration>({ connected: false });
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const { activeProject, isAllProjects } = useProject();

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (isAllProjects) {
        params.set("isAllProjects", "true");
      } else if (activeProject?.id) {
        params.set("projectId", activeProject.id);
      }
      const qs = params.toString() ? `?${params.toString()}` : "";

      const [showsRes, socialRes, merchRes, statusRes] = await Promise.all([
        fetch(`/api/analytics/shows${qs}`),
        fetch(`/api/analytics/social${qs}`),
        fetch(`/api/analytics/merch${qs}`),
        fetch(`/api/integrations/meta/status${qs}`),
      ]);
      const [showsData, socialData, merchData, statusData] = await Promise.all([
        showsRes.ok ? showsRes.json() : [],
        socialRes.ok ? socialRes.json() : [],
        merchRes.ok ? merchRes.json() : [],
        statusRes.ok ? statusRes.json() : { connected: false },
      ]);
      setShows(Array.isArray(showsData) ? showsData : []);
      setSocial(Array.isArray(socialData) ? socialData : []);
      setMerch(Array.isArray(merchData) ? merchData : []);
      setMetaIntegration(statusData);
    } finally {
      setLoading(false);
    }
  }, [activeProject, isAllProjects]);

  useEffect(() => {
    const id = window.setTimeout(() => void loadAll(), 0);
    return () => window.clearTimeout(id);
  }, [loadAll]);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected === "instagram") {
      toast.success("Instagram conectado correctamente");
    } else if (error === "meta_denied") {
      toast.error("Conexión cancelada");
    }
  }, [searchParams]);

  // KPI calculations
  const totalShows = shows.length;

  const utilidadAcumulada = shows.reduce((sum, s) => {
    return sum + (s.fee ?? 0) + (s.ticketIncome ?? 0) - (s.expenses ?? 0);
  }, 0);

  const vibesWithValue = shows.filter((s) => s.avgVibe != null);
  const vibePromedio =
    vibesWithValue.length > 0
      ? vibesWithValue.reduce((sum, s) => sum + (s.avgVibe ?? 0), 0) / vibesWithValue.length
      : null;

  const instagramMetrics = social
    .filter((m) => m.platform === "instagram")
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  const latestInstagram = instagramMetrics[0]?.followers ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground text-sm">Shows, redes sociales y merch</p>
        </div>
        <BarChart2 className="h-6 w-6 text-muted-foreground/40" />
      </div>

      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl border bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Music className="h-3 w-3" /> Total shows
            </p>
            <p className="text-lg font-bold">{totalShows}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Utilidad acumulada</p>
            <p
              className={`text-lg font-bold ${
                utilidadAcumulada >= 0
                  ? "text-green-700 dark:text-green-400"
                  : "text-red-700 dark:text-red-400"
              }`}
            >
              {CLP.format(utilidadAcumulada / 100)}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Vibe promedio</p>
            <p className="text-lg font-bold">
              {vibePromedio != null ? vibePromedio.toFixed(1) : "—"}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Users className="h-3 w-3" /> Seguidores Instagram
            </p>
            <p className="text-lg font-bold">
              {latestInstagram != null
                ? new Intl.NumberFormat("es-CL").format(latestInstagram)
                : "—"}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue="shows">
          <TabsList>
            <TabsTrigger value="shows">
              <Music className="h-3.5 w-3.5 mr-1.5" />
              Shows ({shows.length})
            </TabsTrigger>
            <TabsTrigger value="social">
              <BarChart2 className="h-3.5 w-3.5 mr-1.5" />
              Redes Sociales
            </TabsTrigger>
            <TabsTrigger value="merch">
              <ShoppingBag className="h-3.5 w-3.5 mr-1.5" />
              Merch
            </TabsTrigger>
          </TabsList>
          <TabsContent value="shows" className="mt-4">
            <ShowsTab shows={shows} onRefresh={loadAll} />
          </TabsContent>
          <TabsContent value="social" className="mt-4">
            <SocialTab metrics={social} onRefresh={loadAll} integration={metaIntegration} />
          </TabsContent>
          <TabsContent value="merch" className="mt-4">
            <MerchTab snapshots={merch} onRefresh={loadAll} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { BarChart2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { getPlatformDef } from "@/lib/smartlink-platforms";
import { PlatformIcon } from "./PlatformIcon";
import type { SmartlinkItem } from "./SmartlinkFormDialog";

interface RawEvent {
  eventType: "view" | "click";
  platform: string | null;
  occurredAt: string;
}

function SmartlinkStatsContent({ smartlinkId }: { smartlinkId: string }) {
  const [events, setEvents] = useState<RawEvent[] | null>(null);

  useEffect(() => {
    fetch(`/api/smartlinks/${smartlinkId}/events`)
      .then((r) => r.json())
      .then((d) => setEvents(Array.isArray(d.events) ? d.events : []))
      .catch(() => setEvents([]));
  }, [smartlinkId]);

  // Mismo criterio que el detalle de QR: si todas las vistas caen en un
  // solo día, agrupar por día da una sola barra -- se agrupa por hora en
  // ese caso.
  const { viewsChartData, viewsBucket } = useMemo(() => {
    if (!events) return { viewsChartData: [], viewsBucket: "day" as const };
    const views = events.filter((e) => e.eventType === "view");
    const distinctDays = new Set(views.map((e) => format(new Date(e.occurredAt), "yyyy-MM-dd")));
    const useHourly = distinctDays.size <= 1;

    const byBucket = new Map<string, { label: string; count: number; sortKey: string }>();
    for (const e of views) {
      const d = new Date(e.occurredAt);
      const sortKey = useHourly ? format(d, "yyyy-MM-dd'T'HH") : format(d, "yyyy-MM-dd");
      const label = useHourly ? format(d, "HH:00") : format(d, "d MMM", { locale: es });
      const existing = byBucket.get(sortKey);
      if (existing) existing.count += 1;
      else byBucket.set(sortKey, { label, count: 1, sortKey });
    }
    return {
      viewsChartData: [...byBucket.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey)),
      viewsBucket: useHourly ? ("hour" as const) : ("day" as const),
    };
  }, [events]);

  const clicksByPlatform = useMemo(() => {
    if (!events) return [];
    const byPlatform = new Map<string, number>();
    for (const e of events) {
      if (e.eventType !== "click" || !e.platform) continue;
      byPlatform.set(e.platform, (byPlatform.get(e.platform) ?? 0) + 1);
    }
    return [...byPlatform.entries()].sort((a, b) => b[1] - a[1]);
  }, [events]);

  if (events === null) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalViews = events.filter((e) => e.eventType === "view").length;
  const totalClicks = events.filter((e) => e.eventType === "click").length;

  if (totalViews === 0 && totalClicks === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Todavía no tiene actividad registrada.</p>;
  }

  return (
    <>
      {totalViews > 1 && viewsChartData.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-3">
            {viewsBucket === "hour" ? "Vistas por hora" : "Vistas por día"}
          </p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={viewsChartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8 }}
                labelStyle={{ color: "#0f172a", fontWeight: 600 }}
                itemStyle={{ color: "#0f172a" }}
                formatter={(v) => [v, "Vistas"]}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">
          {totalViews} vista{totalViews === 1 ? "" : "s"} · {totalClicks} click{totalClicks === 1 ? "" : "s"}
        </p>
        {clicksByPlatform.length > 0 && (
          <div className="space-y-1.5">
            {clicksByPlatform.map(([platform, count]) => (
              <div key={platform} className="flex items-center justify-between text-sm border-b py-1.5 last:border-0">
                <span className="flex items-center gap-2">
                  <PlatformIcon platformKey={platform} size={16} />
                  {getPlatformDef(platform).label}
                </span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function SmartlinkStatsSheet({ item, onClose }: { item: SmartlinkItem | null; onClose: () => void }) {
  return (
    <Sheet open={Boolean(item)} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4" />
            {item?.title}
          </SheetTitle>
        </SheetHeader>

        <div className="px-4 pb-4 space-y-6 overflow-y-auto flex-1">
          {item && <SmartlinkStatsContent key={item.id} smartlinkId={item.id} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

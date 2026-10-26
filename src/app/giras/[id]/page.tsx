"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Route } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/EmptyState";
import { useProject } from "@/lib/project-context";
import { TourSummaryTab } from "@/components/tours/TourSummaryTab";
import { TourDatesTab } from "@/components/tours/TourDatesTab";
import { TourSalesTab } from "@/components/tours/TourSalesTab";
import { SponsorshipsTab } from "@/components/tours/SponsorshipsTab";
import { TourBudgetTab } from "@/components/tours/TourBudgetTab";
import { TourTasksTab } from "@/components/tours/TourTasksTab";
import { shortDate } from "@/components/tours/labels";
import type { TourDetail } from "@/types/tours";

type TabKey = "resumen" | "fechas" | "venta" | "auspicios" | "presupuesto" | "tareas";

export default function GiraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { activeProject } = useProject();
  const [data, setData] = useState<TourDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("resumen");

  const load = useCallback(() => {
    const qs = activeProject?.id ? `?projectId=${encodeURIComponent(activeProject.id)}` : "";
    fetch(`/api/giras/${id}${qs}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "No se pudo cargar la gira");
        setData(d as TourDetail);
        setLoadError(null);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [id, activeProject?.id]);

  useEffect(load, [load]);

  // Recordar la última pestaña por gira (comodidad local, no crítico).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`gira-tab-${id}`) as TabKey | null;
      if (saved) setTab(saved);
    } catch {}
  }, [id]);
  function changeTab(v: TabKey) {
    setTab(v);
    try {
      localStorage.setItem(`gira-tab-${id}`, v);
    } catch {}
  }

  if (loadError) return <EmptyState icon={Route} title="No se pudo abrir la gira" description={loadError} />;
  if (!data) return <p className="text-sm text-muted-foreground">Cargando gira…</p>;

  const { tour } = data;
  const openAlerts = data.alerts.length;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link href="/giras" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Giras
        </Link>
        <h1 className="text-2xl font-semibold">{tour.name}</h1>
        <p className="text-sm text-muted-foreground">
          {shortDate(tour.startDate)} – {shortDate(tour.endDate)}
          {tour.folio && <> · Folio {tour.folio}</>}
          {tour.canvaFolderUrl && (
            <>
              {" · "}
              <a href={tour.canvaFolderUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline">
                Dossiers en Canva <ExternalLink className="h-3 w-3" />
              </a>
            </>
          )}
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => changeTab(v as TabKey)}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="resumen">
            Resumen{openAlerts > 0 && <span className="ml-1 rounded-full bg-red-500/15 px-1.5 text-[10px] text-red-700">{openAlerts}</span>}
          </TabsTrigger>
          <TabsTrigger value="fechas">Fechas</TabsTrigger>
          <TabsTrigger value="venta">Venta</TabsTrigger>
          <TabsTrigger value="auspicios">Auspicios</TabsTrigger>
          {data.canViewCosts && <TabsTrigger value="presupuesto">Presupuesto</TabsTrigger>}
          <TabsTrigger value="tareas">Tareas</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="pt-4">
          <TourSummaryTab data={data} onNavigate={changeTab} />
        </TabsContent>
        <TabsContent value="fechas" className="pt-4">
          <TourDatesTab data={data} onChanged={load} />
        </TabsContent>
        <TabsContent value="venta" className="pt-4">
          <TourSalesTab data={data} />
        </TabsContent>
        <TabsContent value="auspicios" className="pt-4">
          <SponsorshipsTab data={data} onChanged={load} />
        </TabsContent>
        {data.canViewCosts && (
          <TabsContent value="presupuesto" className="pt-4">
            <TourBudgetTab data={data} onChanged={load} />
          </TabsContent>
        )}
        <TabsContent value="tareas" className="pt-4">
          <TourTasksTab data={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

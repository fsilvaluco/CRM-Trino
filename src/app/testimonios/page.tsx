"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquareQuote } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  TestimonialCard,
  type TestimonialItem,
  type TestimonialStatus,
} from "@/components/testimonials/TestimonialCard";
import { useProject } from "@/lib/project-context";
import { getTestimonialSiteForProject } from "@/lib/testimonials/sites-public";

// Seccion Testimonios (menu Herramientas): lista los testimonios que llegan
// desde el sitio publico del proyecto activo y permite aprobarlos o
// rechazarlos sin depender de los links del correo. Acceso y permisos en
// src/lib/testimonials/app-access.ts.

type TabKey = "pendientes" | "aprobados" | "rechazados" | "sin_confirmar";

const TAB_STATUS: Record<TabKey, TestimonialStatus> = {
  pendientes: "verified",
  aprobados: "approved",
  rechazados: "rejected",
  sin_confirmar: "pending_code",
};

const EMPTY_TEXT: Record<TabKey, string> = {
  pendientes: "No hay testimonios esperando revisión.",
  aprobados: "Todavía no hay testimonios aprobados.",
  rechazados: "No hay testimonios rechazados.",
  sin_confirmar: "No hay testimonios esperando el código de confirmación.",
};

export default function TestimoniosPage() {
  const { activeProject } = useProject();
  const projectId = activeProject?.id ?? null;
  const site = getTestimonialSiteForProject(projectId);

  const [items, setItems] = useState<TestimonialItem[]>([]);
  const [canModerate, setCanModerate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("pendientes");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!projectId || !site) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    fetch(`/api/testimonials?projectId=${encodeURIComponent(projectId)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error || "No se pudieron cargar los testimonios");
        setItems(Array.isArray(d.items) ? d.items : []);
        setCanModerate(Boolean(d.canModerate));
      })
      .catch((err: Error) => {
        setItems([]);
        setLoadError(err.message);
      })
      .finally(() => setLoading(false));
  }, [projectId, site]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<TestimonialStatus, number> = { pending_code: 0, verified: 0, approved: 0, rejected: 0 };
    for (const it of items) if (it.status in c) c[it.status] += 1;
    return c;
  }, [items]);

  const visible = useMemo(() => items.filter((it) => it.status === TAB_STATUS[tab]), [items, tab]);

  async function handleModerate(item: TestimonialItem, action: "approve" | "reject") {
    if (!projectId) return;
    if (item.status === "approved" && action === "reject") {
      if (!confirm(`¿Rechazar el testimonio de ${item.name}? Dejará de mostrarse en el sitio.`)) return;
    }
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/testimonials/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, action }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "No se pudo actualizar");
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: d.status, approvedAt: d.approvedAt ?? null } : it)),
      );
      toast.success(action === "approve" ? "Testimonio aprobado" : "Testimonio rechazado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar");
    } finally {
      setBusyId(null);
    }
  }

  if (!activeProject) {
    return (
      <EmptyState
        icon={MessageSquareQuote}
        title="Elige un proyecto"
        description="Los testimonios son por proyecto: selecciona uno arriba para revisarlos."
      />
    );
  }

  if (!site) {
    return (
      <EmptyState
        icon={MessageSquareQuote}
        title="Sin testimonios para este proyecto"
        description="Este proyecto no tiene un sitio configurado para recibir testimonios."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Testimonios</h1>
        <p className="text-muted-foreground">
          Testimonios que llegan desde el sitio de {site.brandName}. Solo los aprobados se muestran públicamente.
          {!canModerate && !loading && " Solo los admins del proyecto pueden aprobarlos o rechazarlos."}
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="pendientes" className="cursor-pointer">
            Pendientes
            {counts.verified > 0 && (
              <span className="ml-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold px-1.5 min-w-[18px] text-center">
                {counts.verified}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="aprobados" className="cursor-pointer">Aprobados ({counts.approved})</TabsTrigger>
          <TabsTrigger value="rechazados" className="cursor-pointer">Rechazados ({counts.rejected})</TabsTrigger>
          {counts.pending_code > 0 && (
            <TabsTrigger value="sin_confirmar" className="cursor-pointer">Sin confirmar ({counts.pending_code})</TabsTrigger>
          )}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : loadError ? (
        <EmptyState icon={MessageSquareQuote} title="No se pudieron cargar" description={loadError} actionLabel="Reintentar" onAction={load} />
      ) : visible.length === 0 ? (
        <EmptyState icon={MessageSquareQuote} title="Nada por aquí" description={EMPTY_TEXT[tab]} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {visible.map((item) => (
            <TestimonialCard
              key={item.id}
              item={item}
              canModerate={canModerate}
              busy={busyId === item.id}
              onModerate={handleModerate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

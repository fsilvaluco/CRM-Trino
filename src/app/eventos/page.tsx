"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { EventFormDialog } from "@/components/events/EventFormDialog";
import { useProject } from "@/lib/project-context";
import { toast } from "sonner";
import { Mic2, Plus, MapPin, Clock, Trash2, Pencil, BarChart2, Link as LinkIcon, Star } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { LiveShow, ShowStatus } from "@/types/shows";

const STATUS_CONFIG: Record<ShowStatus, { label: string; className: string }> = {
  cotizando: { label: "Cotizando", className: "bg-yellow-100 text-yellow-700" },
  confirmado: { label: "Confirmado", className: "bg-blue-100 text-blue-700" },
  realizado: { label: "Realizado", className: "bg-green-100 text-green-700" },
  cancelado: { label: "Cancelado", className: "bg-red-100 text-red-700" },
};

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

function formatCents(cents: number | null | undefined): string | null {
  if (cents == null || cents === 0) return null;
  return CLP.format(cents / 100);
}

function formatDate(d: string) {
  try {
    return format(new Date(`${d}T00:00:00`), "EEEE d MMM yyyy", { locale: es });
  } catch {
    return d;
  }
}

// Un evento "necesita confirmación" cuando ya pasó su fecha pero sigue
// cotizando/confirmado -- alguien tiene que decir si efectivamente pasó o
// se cayó, antes de que Métricas pueda contarlo (o no).
function needsConfirmation(show: LiveShow): boolean {
  if (show.status !== "cotizando" && show.status !== "confirmado") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = new Date(`${show.date}T00:00:00`);
  return eventDate < today;
}

export default function EventosPage() {
  const { activeProject, isAllProjects, projects } = useProject();
  const [shows, setShows] = useState<LiveShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingShow, setEditingShow] = useState<LiveShow | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | ShowStatus>("all");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const targetProjectId = activeProject?.id ?? null;

  const loadShows = useCallback(() => {
    setLoading(true);
    const params = !isAllProjects && targetProjectId ? `?projectId=${targetProjectId}` : "";
    fetch(`/api/eventos${params}`)
      .then((r) => r.json())
      .then((d) => setShows(Array.isArray(d) ? d : []))
      .catch(() => setShows([]))
      .finally(() => setLoading(false));
  }, [targetProjectId, isAllProjects]);

  useEffect(() => {
    loadShows();
  }, [loadShows]);

  async function handleConfirm(show: LiveShow, status: "realizado" | "cancelado") {
    setConfirmingId(show.id);
    try {
      const res = await fetch(`/api/eventos/${show.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, status } : s)));
      toast.success(status === "realizado" ? "Marcado como realizado" : "Marcado como cancelado");
    } catch {
      toast.error("No se pudo actualizar el estado");
    } finally {
      setConfirmingId(null);
    }
  }

  async function handleCopyRatingLink(show: LiveShow) {
    const url = `${window.location.origin}/rate/${show.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado -- mándaselo a quien tocó para que califique cómo estuvo");
    } catch {
      toast.info(url);
    }
  }

  async function handleDelete(show: LiveShow) {
    if (!confirm(`¿Eliminar el evento "${show.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/eventos/${show.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setShows((prev) => prev.filter((s) => s.id !== show.id));
      toast.success("Evento eliminado");
    } catch {
      toast.error("No se pudo eliminar el evento");
    }
  }

  const filteredShows = shows.filter((s) => filterStatus === "all" || s.status === filterStatus);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Eventos</h1>
          <p className="text-muted-foreground">
            {isAllProjects || !activeProject ? "Todos los proyectos" : `Proyecto: ${activeProject.name}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/analytics/eventos" className={buttonVariants({ variant: "outline" })}>
            <BarChart2 className="h-4 w-4 mr-1.5" />
            Ver en Métricas
          </Link>
          <Button
            className="cursor-pointer"
            onClick={() => {
              setEditingShow(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Nuevo evento
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant={filterStatus === "all" ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => setFilterStatus("all")}
        >
          Todos
        </Button>
        {(Object.keys(STATUS_CONFIG) as ShowStatus[]).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={filterStatus === s ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setFilterStatus(s)}
          >
            {STATUS_CONFIG[s].label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />)}
        </div>
      ) : filteredShows.length === 0 ? (
        <EmptyState
          icon={Mic2}
          title="Sin eventos"
          description="Crea un evento suelto, o marca un deal como 'Es un evento' para armarlo automáticamente al ganarlo."
        />
      ) : (
        <div className="space-y-3">
          {filteredShows.map((show) => {
            const utilidadCents = (show.fee ?? 0) + (show.ticketIncome ?? 0) - (show.expenses ?? 0);
            const hasMoney = (show.fee ?? 0) !== 0 || (show.ticketIncome ?? 0) !== 0 || (show.expenses ?? 0) !== 0;

            return (
              <Card key={show.id} className="group">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Link href={`/eventos/${show.id}`} className="font-medium hover:underline">
                        {show.name}
                      </Link>
                      <Badge variant="secondary" className={`text-xs ${STATUS_CONFIG[show.status].className}`}>
                        {STATUS_CONFIG[show.status].label}
                      </Badge>
                      {show.projectName && (
                        <Badge variant="outline" className="text-xs">{show.projectName}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                      <span className="capitalize">{formatDate(show.date)}</span>
                      {show.eventTime && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {show.eventTime}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {show.venue}
                        {show.city ? `, ${show.city}` : ""}
                      </span>
                      {show.dealTitle && (
                        <span className="flex items-center gap-1">
                          <LinkIcon className="h-3.5 w-3.5" />
                          {show.dealTitle}
                        </span>
                      )}
                    </div>
                    {show.notes && <p className="text-sm text-muted-foreground mt-1.5">{show.notes}</p>}

                    {needsConfirmation(show) && (
                      <div className="mt-2 flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1.5">
                        <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                          Ya pasó la fecha -- ¿se realizó?
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs px-2 cursor-pointer"
                          disabled={confirmingId === show.id}
                          onClick={() => handleConfirm(show, "realizado")}
                        >
                          Sí, se hizo
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs px-2 cursor-pointer"
                          disabled={confirmingId === show.id}
                          onClick={() => handleConfirm(show, "cancelado")}
                        >
                          No, se canceló
                        </Button>
                      </div>
                    )}

                    {show.status === "realizado" && (
                      <button
                        onClick={() => handleCopyRatingLink(show)}
                        className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
                      >
                        <Star className="h-3 w-3" />
                        Copiar link para que califiquen el evento
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {hasMoney && (
                      <div className="text-right">
                        <p
                          className={`text-sm font-semibold ${
                            utilidadCents >= 0
                              ? "text-green-700 dark:text-green-400"
                              : "text-red-700 dark:text-red-400"
                          }`}
                        >
                          {formatCents(utilidadCents) ?? CLP.format(0)}
                        </p>
                        <p className="text-xs text-muted-foreground">utilidad</p>
                      </div>
                    )}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          setEditingShow(show);
                          setFormOpen(true);
                        }}
                        className="text-muted-foreground hover:text-foreground cursor-pointer p-1.5"
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(show)}
                        className="text-muted-foreground hover:text-destructive cursor-pointer p-1.5"
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <EventFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        defaultProjectId={targetProjectId}
        editingShow={editingShow}
        onSaved={loadShows}
      />
    </div>
  );
}

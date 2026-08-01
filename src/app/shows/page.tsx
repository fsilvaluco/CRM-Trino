"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { ShowFormDialog } from "@/components/shows/ShowFormDialog";
import { useProject } from "@/lib/project-context";
import { toast } from "sonner";
import { Mic2, Plus, MapPin, Clock, Trash2, Pencil } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { LiveShow, ShowStatus } from "@/types/shows";

const STATUS_CONFIG: Record<ShowStatus, { label: string; className: string }> = {
  cotizando: { label: "Cotizando", className: "bg-yellow-100 text-yellow-700" },
  confirmado: { label: "Confirmado", className: "bg-blue-100 text-blue-700" },
  realizado: { label: "Realizado", className: "bg-green-100 text-green-700" },
  cancelado: { label: "Cancelado", className: "bg-red-100 text-red-700" },
};

function formatDate(d: string) {
  try {
    return format(new Date(`${d}T00:00:00`), "EEEE d MMM yyyy", { locale: es });
  } catch {
    return d;
  }
}

export default function ShowsPage() {
  const { activeProject, isAllProjects, projects } = useProject();
  const [shows, setShows] = useState<LiveShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingShow, setEditingShow] = useState<LiveShow | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | ShowStatus>("all");

  const targetProjectId = activeProject?.id ?? null;

  const loadShows = useCallback(() => {
    setLoading(true);
    const params = !isAllProjects && targetProjectId ? `?projectId=${targetProjectId}` : "";
    fetch(`/api/shows${params}`)
      .then((r) => r.json())
      .then((d) => setShows(Array.isArray(d) ? d : []))
      .catch(() => setShows([]))
      .finally(() => setLoading(false));
  }, [targetProjectId, isAllProjects]);

  useEffect(() => {
    loadShows();
  }, [loadShows]);

  async function handleDelete(show: LiveShow) {
    if (!confirm(`¿Eliminar el show en "${show.venue}"? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/shows/${show.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setShows((prev) => prev.filter((s) => s.id !== show.id));
      toast.success("Show eliminado");
    } catch {
      toast.error("No se pudo eliminar el show");
    }
  }

  const filteredShows = shows.filter((s) => filterStatus === "all" || s.status === filterStatus);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Shows en vivo</h1>
          <p className="text-muted-foreground">
            {isAllProjects || !activeProject ? "Todos los proyectos" : `Proyecto: ${activeProject.name}`}
          </p>
        </div>
        <Button
          className="cursor-pointer"
          onClick={() => {
            setEditingShow(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Nuevo show
        </Button>
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
          title="Sin shows"
          description="Crea un show suelto, o marca un deal como 'Es un show' para armarlo automáticamente al ganarlo."
        />
      ) : (
        <div className="space-y-3">
          {filteredShows.map((show) => (
            <Card key={show.id} className="group">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-medium">{show.venue}</p>
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
                    {show.address && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {show.address}
                      </span>
                    )}
                  </div>
                  {show.notes && <p className="text-sm text-muted-foreground mt-1.5">{show.notes}</p>}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ShowFormDialog
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

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { FolderKanban, Plus, Building2 } from "lucide-react";

interface ProjectRow {
  id: string;
  name: string;
  type: string | null;
  status: string;
  description: string | null;
  companyId: string | null;
  companyName: string | null;
  createdAt: number | Date;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: { label: "Activo", className: "bg-green-100 text-green-700" },
  paused: { label: "Pausado", className: "bg-yellow-100 text-yellow-700" },
  completed: { label: "Completado", className: "bg-blue-100 text-blue-700" },
  archived: { label: "Archivado", className: "bg-slate-100 text-slate-600" },
};

export default function ProjectsPage() {
  const router = useRouter();
  const [projectsList, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");

  const loadProjects = () => {
    const params = filterStatus !== "all" ? `?status=${filterStatus}` : "";
    fetch(`/api/projects${params}`)
      .then((r) => r.json())
      .then((data) => {
        setProjects(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadProjects();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Proyectos</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Proyectos</h1>
          <p className="text-muted-foreground">{projectsList.length} proyecto{projectsList.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="cursor-pointer">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Proyecto
        </Button>
      </div>

      <ProjectForm
        open={showForm}
        onClose={() => {
          setShowForm(false);
          loadProjects();
        }}
      />

      {/* Filtros de estado */}
      <div className="flex flex-wrap gap-2">
        {["all", "active", "paused", "completed", "archived"].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer ${
              filterStatus === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {s === "all" ? "Todos" : STATUS_CONFIG[s]?.label || s}
          </button>
        ))}
      </div>

      {projectsList.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Sin proyectos"
          description="Crea tu primer proyecto para organizar tu trabajo en iniciativas y subproyectos."
          actionLabel="Nuevo Proyecto"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projectsList.map((project) => {
            const statusCfg = STATUS_CONFIG[project.status] || { label: project.status, className: "" };
            return (
              <Card
                key={project.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(`/projects/${project.id}`)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-primary/10 p-2.5 shrink-0">
                      <FolderKanban className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{project.name}</h3>
                      {project.type && (
                        <p className="text-xs text-muted-foreground">{project.type}</p>
                      )}
                    </div>
                    <Badge className={`text-xs shrink-0 ${statusCfg.className}`} variant="secondary">
                      {statusCfg.label}
                    </Badge>
                  </div>

                  {project.description && (
                    <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                      {project.description}
                    </p>
                  )}

                  {project.companyName && (
                    <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
                      <Building2 className="h-3 w-3" />
                      {project.companyName}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

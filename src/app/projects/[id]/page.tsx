"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { SubprojectForm } from "@/components/projects/SubprojectForm";
import {
  FolderKanban,
  ArrowLeft,
  Pencil,
  Trash2,
  Plus,
  Building2,
  CheckSquare,
  Layers,
} from "lucide-react";
import { formatDate } from "@/lib/constants";
import { toast } from "sonner";
import type { Project, Subproject, Task } from "@/types";

interface ProjectDetail extends Project {
  subprojects: Subproject[];
  tasks: Task[];
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  completed: "bg-blue-100 text-blue-700",
  archived: "bg-slate-100 text-slate-600",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Activo",
  paused: "Pausado",
  completed: "Completado",
  archived: "Archivado",
};

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showSubprojectForm, setShowSubprojectForm] = useState(false);

  const loadProject = () => {
    fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setProject(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadProject();
  }, [id]);

  const handleDelete = async () => {
    if (!confirm("¿Eliminar este proyecto?")) return;
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Proyecto eliminado");
      router.push("/projects");
    } catch {
      toast.error("Error al eliminar proyecto");
    }
  };

  const deleteSubproject = async (subId: string) => {
    if (!confirm("¿Eliminar este subproyecto?")) return;
    try {
      await fetch(`/api/subprojects/${subId}`, { method: "DELETE" });
      toast.success("Subproyecto eliminado");
      loadProject();
    } catch {
      toast.error("Error al eliminar subproyecto");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-40 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!project) {
    return <p className="text-muted-foreground">Proyecto no encontrado.</p>;
  }

  const pendingTasks = project.tasks.filter((t) => t.status !== "listo" && t.status !== "descartado").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Atras
          </Button>
          <div className="rounded-lg bg-primary/10 p-2">
            <FolderKanban className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              {project.type && (
                <span className="text-sm text-muted-foreground">{project.type}</span>
              )}
              <Badge
                className={`text-xs ${STATUS_COLORS[project.status] || ""}`}
                variant="secondary"
              >
                {STATUS_LABELS[project.status] || project.status}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEdit(true)}
            className="cursor-pointer"
          >
            <Pencil className="h-4 w-4 mr-1" />
            Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            className="cursor-pointer text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ProjectForm
        open={showEdit}
        initialData={project}
        onClose={() => {
          setShowEdit(false);
          loadProject();
        }}
      />

      <SubprojectForm
        open={showSubprojectForm}
        projectId={id}
        onClose={() => {
          setShowSubprojectForm(false);
          loadProject();
        }}
      />

      {/* Info general */}
      {(project.description || project.notes) && (
        <Card>
          <CardContent className="pt-6 space-y-2">
            {project.description && (
              <p className="text-sm">{project.description}</p>
            )}
            {project.notes && (
              <p className="text-sm text-muted-foreground">{project.notes}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats rápidas */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold">{project.subprojects.length}</div>
            <p className="text-sm text-muted-foreground">Subproyectos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold">{project.tasks.length}</div>
            <p className="text-sm text-muted-foreground">Tareas totales</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold">{pendingTasks}</div>
            <p className="text-sm text-muted-foreground">Pendientes</p>
          </CardContent>
        </Card>
      </div>

      {/* Subproyectos */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Subproyectos ({project.subprojects.length})
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSubprojectForm(true)}
              className="cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Agregar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {project.subprojects.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin subproyectos aun.</p>
          ) : (
            <ul className="space-y-3">
              {project.subprojects.map((sub) => (
                <li
                  key={sub.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{sub.name}</p>
                    {(sub.startDate || sub.endDate) && (
                      <p className="text-xs text-muted-foreground">
                        {sub.startDate && formatDate(sub.startDate)}
                        {sub.startDate && sub.endDate && " → "}
                        {sub.endDate && formatDate(sub.endDate)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={`text-xs ${STATUS_COLORS[sub.status] || ""}`}
                      variant="secondary"
                    >
                      {STATUS_LABELS[sub.status] || sub.status}
                    </Badge>
                    <button
                      onClick={() => deleteSubproject(sub.id)}
                      className="text-muted-foreground hover:text-destructive cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Tareas del proyecto */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckSquare className="h-4 w-4" />
            Tareas ({project.tasks.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {project.tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin tareas asociadas.</p>
          ) : (
            <ul className="space-y-2">
              {project.tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between text-sm">
                  <span className={t.status === "listo" || t.status === "descartado" ? "line-through text-muted-foreground" : ""}>
                    {t.title}
                  </span>
                  <Badge variant="secondary" className="text-xs">{t.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

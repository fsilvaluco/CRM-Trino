"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { UserPlus, X, ChevronDown, ChevronRight, Users } from "lucide-react";

interface OrgMember {
  user_id: string;
  role: string;
  profiles: { full_name: string | null; email: string | null } | null;
}

interface ProjectMember {
  id: string;
  user_id: string;
  profiles: { full_name: string | null; email: string | null } | null;
}

interface Project {
  id: string;
  name: string;
}

export function ProjectAccessPanel() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [projectMembers, setProjectMembers] = useState<Record<string, ProjectMember[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/org-members").then((r) => r.json()),
    ]).then(([p, m]) => {
      setProjects(Array.isArray(p) ? p : []);
      setOrgMembers(Array.isArray(m) ? m : []);
      setLoading(false);
    });
  }, []);

  const loadProjectMembers = useCallback(async (projectId: string) => {
    const data = await fetch(`/api/project-members?projectId=${projectId}`).then((r) => r.json());
    setProjectMembers((prev) => ({ ...prev, [projectId]: Array.isArray(data) ? data : [] }));
  }, []);

  const handleExpand = async (projectId: string) => {
    if (expanded === projectId) {
      setExpanded(null);
      return;
    }
    setExpanded(projectId);
    if (!projectMembers[projectId]) {
      await loadProjectMembers(projectId);
    }
  };

  const handleAdd = async (projectId: string, userId: string) => {
    const res = await fetch("/api/project-members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, userId }),
    });
    if (!res.ok) { toast.error("Error al agregar"); return; }
    toast.success("Usuario agregado al proyecto");
    await loadProjectMembers(projectId);
  };

  const handleRemove = async (projectId: string, userId: string) => {
    const res = await fetch("/api/project-members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, userId }),
    });
    if (!res.ok) { toast.error("Error al remover"); return; }
    toast.success("Usuario removido del proyecto");
    await loadProjectMembers(projectId);
  };

  if (loading) return <p className="text-sm text-muted-foreground">Cargando...</p>;

  // Solo mostrar members (no admins/owners — ellos siempre ven todo)
  const assignableMembers = orgMembers.filter((m) => m.role === "member");

  if (assignableMembers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay usuarios con rol <strong>member</strong> en la organización. Los usuarios con rol admin/owner ya tienen acceso total.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-3">
        Asigna qué proyectos puede ver cada usuario con rol <strong>member</strong>.
        Los usuarios admin/owner siempre tienen acceso completo.
      </p>
      {projects.map((project) => {
        const members = projectMembers[project.id] ?? [];
        const isExpanded = expanded === project.id;
        const assignedIds = new Set(members.map((m) => m.user_id));
        const unassigned = assignableMembers.filter((m) => !assignedIds.has(m.user_id));

        return (
          <div key={project.id} className="border rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left"
              onClick={() => handleExpand(project.id)}
            >
              <span className="font-medium text-sm">{project.name}</span>
              <div className="flex items-center gap-2">
                {isExpanded && (
                  <Badge variant="secondary" className="text-xs">
                    <Users className="h-3 w-3 mr-1" />
                    {members.length}
                  </Badge>
                )}
                {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 space-y-3 border-t bg-muted/20">
                {/* Miembros actuales */}
                {members.length > 0 ? (
                  <div className="pt-3 space-y-2">
                    {members.map((m) => (
                      <div key={m.user_id} className="flex items-center justify-between text-sm">
                        <span>
                          {m.profiles?.full_name ?? m.profiles?.email ?? m.user_id}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemove(project.id, m.user_id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="pt-3 text-xs text-muted-foreground">Sin usuarios asignados</p>
                )}

                {/* Agregar miembro */}
                {unassigned.length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-2">Agregar acceso:</p>
                    <div className="space-y-1">
                      {unassigned.map((m) => (
                        <button
                          key={m.user_id}
                          className="w-full flex items-center gap-2 text-sm text-left px-2 py-1.5 rounded hover:bg-muted transition-colors"
                          onClick={() => handleAdd(project.id, m.user_id)}
                        >
                          <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
                          {m.profiles?.full_name ?? m.profiles?.email ?? m.user_id}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export interface MemberAccessTarget {
  user_id: string;
  role: string;
  status: "pending" | "active";
  profiles: { full_name: string | null; email: string | null; avatar_url: string | null } | null;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface ProjectMemberRow {
  user_id: string;
  project_id: string;
}

interface MemberAccessSheetProps {
  open: boolean;
  member: MemberAccessTarget | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-2 py-2 border-b last:border-0">
      <span className="text-xs text-muted-foreground pt-2 font-medium">{label}</span>
      <div>{children}</div>
    </div>
  );
}

export function MemberAccessSheet({ open, member, onClose, onSaved }: MemberAccessSheetProps) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [initialProjectIds, setInitialProjectIds] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>("member");
  const [projectSearch, setProjectSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const memberName = member?.profiles?.full_name ?? member?.profiles?.email ?? "Usuario";
  const memberEmail = member?.profiles?.email ?? "Sin email";
  const isOwner = member?.role === "owner";

  const selectedSet = useMemo(() => new Set(selectedProjectIds), [selectedProjectIds]);
  const initialSet = useMemo(() => new Set(initialProjectIds), [initialProjectIds]);
  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) => project.name.toLowerCase().includes(query));
  }, [projects, projectSearch]);

  useEffect(() => {
    if (!open || !member) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const [projectsRes, membershipsRes] = await Promise.all([
          fetch("/api/projects"),
          fetch("/api/project-members"),
        ]);

        const projectsJson = await projectsRes.json().catch(() => null);
        const membershipsJson = await membershipsRes.json().catch(() => null);

        if (!projectsRes.ok) {
          throw new Error(
            (projectsJson && typeof projectsJson.error === "string" && projectsJson.error) ||
              "No se pudieron cargar los proyectos"
          );
        }

        if (!membershipsRes.ok) {
          throw new Error(
            (membershipsJson && typeof membershipsJson.error === "string" && membershipsJson.error) ||
              "No se pudo cargar la asignación de proyectos"
          );
        }

        const projectOptions = Array.isArray(projectsJson)
          ? (projectsJson as Array<{ id: string; name: string }>).map((p) => ({
              id: p.id,
              name: p.name,
            }))
          : [];

        const currentProjectIds = Array.isArray(membershipsJson)
          ? (membershipsJson as ProjectMemberRow[])
              .filter((row) => row.user_id === member.user_id)
              .map((row) => row.project_id)
          : [];

        setProjects(projectOptions);
        setInitialProjectIds(currentProjectIds);
        setSelectedProjectIds(currentProjectIds);
        setSelectedRole(member.role);
        setProjectSearch("");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Error cargando accesos");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [open, member]);

  const toggleProject = (projectId: string, checked: boolean) => {
    setSelectedProjectIds((prev) => {
      if (checked) {
        if (prev.includes(projectId)) return prev;
        return [...prev, projectId];
      }
      return prev.filter((id) => id !== projectId);
    });
  };

  const handleSave = async () => {
    if (!member) return;

    setSaving(true);
    try {
      const requests: Array<Promise<Response>> = [];

      if (!isOwner && selectedRole !== member.role) {
        requests.push(
          fetch("/api/org-members", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: member.user_id, role: selectedRole }),
          })
        );
      }

      const toAdd = selectedProjectIds.filter((projectId) => !initialSet.has(projectId));
      const toRemove = initialProjectIds.filter((projectId) => !selectedSet.has(projectId));

      toAdd.forEach((projectId) => {
        requests.push(
          fetch("/api/project-members", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: member.user_id, projectId }),
          })
        );
      });

      toRemove.forEach((projectId) => {
        requests.push(
          fetch("/api/project-members", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: member.user_id, projectId }),
          })
        );
      });

      const responses = await Promise.all(requests);

      for (const response of responses) {
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const message =
            (payload && typeof payload.error === "string" && payload.error) ||
            "No se pudo guardar el acceso del usuario";
          throw new Error(message);
        }
      }

      toast.success("Accesos actualizados correctamente");
      await onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al guardar cambios");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl flex flex-col p-0 overflow-hidden"
        showCloseButton={!saving}
      >
        <SheetHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <SheetTitle className="text-lg font-semibold">Gestionar acceso</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            Configura rol y proyectos asignados para este usuario.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          {!member ? (
            <p className="text-sm text-muted-foreground">Selecciona un usuario.</p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Cargando configuración...</p>
          ) : (
            <div className="space-y-4">
              <div className="border-b pb-4">
                <FieldRow label="Usuario">
                  <div>
                    <p className="text-sm font-medium">{memberName}</p>
                    <p className="text-xs text-muted-foreground">{memberEmail}</p>
                  </div>
                </FieldRow>

                <FieldRow label="ID">
                  <p className="text-xs text-muted-foreground break-all">{member.user_id}</p>
                </FieldRow>

                <FieldRow label="Estado">
                  <Badge
                    variant="outline"
                    className={
                      member.status === "active"
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                        : "bg-amber-500/15 text-amber-300 border-amber-500/40"
                    }
                  >
                    {member.status === "active" ? "Activo" : "Pendiente"}
                  </Badge>
                </FieldRow>

                <FieldRow label="Rol actual">
                  <Select
                    value={selectedRole}
                    disabled={isOwner || saving}
                    onValueChange={(value) => {
                      if (!value) return;
                      setSelectedRole(value);
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm cursor-pointer">
                      <SelectValue placeholder="Selecciona rol" />
                    </SelectTrigger>
                    <SelectContent>
                      {isOwner && <SelectItem value="owner">Propietario</SelectItem>}
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="member">Miembro</SelectItem>
                    </SelectContent>
                  </Select>
                  {isOwner && (
                    <p className="text-xs text-muted-foreground mt-1">
                      El rol de owner no se puede cambiar desde este panel.
                    </p>
                  )}
                </FieldRow>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Proyectos asignados</p>
                {projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay proyectos para asignar.</p>
                ) : (
                  <div className="space-y-3 rounded-lg border border-border/60 bg-card/50 p-3">
                    <Input
                      value={projectSearch}
                      onChange={(event) => setProjectSearch(event.target.value)}
                      placeholder="Buscar proyecto..."
                      className="h-8"
                    />
                    <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                      {filteredProjects.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2 px-1">
                          No hay proyectos que coincidan con la búsqueda.
                        </p>
                      ) : (
                        filteredProjects.map((project) => {
                          const checked = selectedSet.has(project.id);
                          return (
                            <label
                              key={project.id}
                              className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2 text-sm hover:bg-muted/40"
                            >
                              <Checkbox
                                checked={checked}
                                disabled={saving}
                                onCheckedChange={(value) => toggleProject(project.id, value === true)}
                              />
                              <span className="flex-1">{project.name}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={!member || loading || saving}>
            {saving ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

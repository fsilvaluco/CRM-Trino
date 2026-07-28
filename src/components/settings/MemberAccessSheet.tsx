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
  role: "admin" | "member" | "artist";
}

interface MemberAccessSheetProps {
  open: boolean;
  member: MemberAccessTarget | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

const ROLE_LABELS: Record<string, string> = { admin: "Admin", member: "Miembro", artist: "Artista" };

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
  const [projectRoles, setProjectRoles] = useState<Record<string, "admin" | "member" | "artist">>({});
  const [initialProjectRoles, setInitialProjectRoles] = useState<Record<string, string>>({});
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

        const currentMemberships = Array.isArray(membershipsJson)
          ? (membershipsJson as ProjectMemberRow[]).filter((row) => row.user_id === member.user_id)
          : [];
        const currentProjectIds = currentMemberships.map((row) => row.project_id);
        const rolesMap: Record<string, "admin" | "member" | "artist"> = {};
        currentMemberships.forEach((row) => {
          rolesMap[row.project_id] = row.role ?? "member";
        });

        setProjects(projectOptions);
        setInitialProjectIds(currentProjectIds);
        setSelectedProjectIds(currentProjectIds);
        setProjectRoles(rolesMap);
        setInitialProjectRoles(rolesMap);
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
    if (checked) {
      setProjectRoles((prev) => (prev[projectId] ? prev : { ...prev, [projectId]: "member" }));
    }
  };

  const setProjectRole = (projectId: string, role: "admin" | "member" | "artist") => {
    setProjectRoles((prev) => ({ ...prev, [projectId]: role }));
  };

  const handleSave = async () => {
    if (!member) return;

    setSaving(true);
    try {
      const requests: Array<Promise<Response>> = [];

      const toAdd = selectedProjectIds.filter((projectId) => !initialSet.has(projectId));
      const toRemove = initialProjectIds.filter((projectId) => !selectedSet.has(projectId));
      const toUpdateRole = selectedProjectIds.filter(
        (projectId) =>
          initialSet.has(projectId) && projectRoles[projectId] !== initialProjectRoles[projectId]
      );

      toAdd.forEach((projectId) => {
        requests.push(
          fetch("/api/project-members", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: member.user_id, projectId, role: projectRoles[projectId] ?? "member" }),
          })
        );
      });

      toUpdateRole.forEach((projectId) => {
        requests.push(
          fetch("/api/project-members", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: member.user_id, projectId, role: projectRoles[projectId] }),
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

                {isOwner && (
                  <FieldRow label="Rol">
                    <Badge variant="outline">Propietario</Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      Propietario tiene acceso total a todos los proyectos — no se gestiona por proyecto.
                    </p>
                  </FieldRow>
                )}
              </div>

              {!isOwner && (
                <p className="text-xs text-muted-foreground -mt-2">
                  El rol de esta persona se define <span className="font-medium">por proyecto</span> — puede ser
                  Admin en uno y Miembro o Artista en otro.
                </p>
              )}

              {!isOwner && (
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
                      <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                        {filteredProjects.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2 px-1">
                            No hay proyectos que coincidan con la búsqueda.
                          </p>
                        ) : (
                          filteredProjects.map((project) => {
                            const checked = selectedSet.has(project.id);
                            const role = projectRoles[project.id] ?? "member";
                            return (
                              <div
                                key={project.id}
                                className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2 text-sm hover:bg-muted/40"
                              >
                                <Checkbox
                                  checked={checked}
                                  disabled={saving}
                                  onCheckedChange={(value) => toggleProject(project.id, value === true)}
                                />
                                <span className="flex-1">{project.name}</span>
                                {checked && (
                                  <Select
                                    value={role}
                                    disabled={saving}
                                    onValueChange={(v) => v && setProjectRole(project.id, v as "admin" | "member" | "artist")}
                                  >
                                    <SelectTrigger className="h-7 text-xs w-28 cursor-pointer">
                                      <SelectValue>{ROLE_LABELS[role]}</SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="admin">Admin</SelectItem>
                                      <SelectItem value="member">Miembro</SelectItem>
                                      <SelectItem value="artist">Artista</SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Admin: gestiona permisos y tiene acceso total dentro de ese proyecto. Miembro: crea
                        tratos, contactos y tareas. Artista: solo lectura de sus tratos (o edición si el
                        proyecto es autogestionado) y edición de sus tareas.
                      </p>
                    </div>
                  )}
                </div>
              )}
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

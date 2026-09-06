"use client";

// Panel de Permisos ("intranet" de accesos): vista general de TODOS los
// proyectos de la organización, quién tiene fila en cada uno y su matriz
// de módulos -- sin acceder a los DATOS de esos proyectos (ni un deal, ni
// una transacción, ni un contacto). Exclusivo del Propietario/Admin de la
// organización (ver /api/admin/permissions-overview), separado a
// propósito de "Gestionar Acceso" (que exige ser miembro del proyecto
// puntual) para no reintroducir el bypass de datos que se eliminó por
// seguridad (ROLES.md, ítem 3: "nadie tiene bypass, ni siquiera el
// dueño") -- acá el dueño administra QUIÉN puede ver QUÉ, sin poder ver
// él mismo el contenido.

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, ChevronDown, ChevronRight, Settings2, Trash2, UserPlus, ShieldAlert } from "lucide-react";
import { ModulePermissionsEditor, type ModuleKey, type ModulePermission } from "@/components/settings/ModulePermissionsEditor";

type ProjectRole = "admin" | "member" | "artist" | "staff";

const ROLE_LABELS: Record<ProjectRole, string> = { admin: "Admin", member: "Miembro", artist: "Artista", staff: "Staff técnico" };

interface ProjectRow {
  id: string;
  name: string;
  parentProjectId: string | null;
}

interface OrgMemberRow {
  userId: string;
  role: string;
  name: string;
  email: string | null;
}

interface MembershipRow {
  id: string;
  projectId: string;
  userId: string;
  role: string;
  puedeGestionarEquipo: boolean;
  name: string;
  email: string | null;
  modules: Record<ModuleKey, ModulePermission> | null;
}

interface Overview {
  projects: ProjectRow[];
  organizationMembers: OrgMemberRow[];
  memberships: MembershipRow[];
}

export default function PermissionsAdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [expandedMatrixId, setExpandedMatrixId] = useState<string | null>(null);
  const [addingToProjectId, setAddingToProjectId] = useState<string | null>(null);
  const [newMemberUserId, setNewMemberUserId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<ProjectRole>("member");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/permissions-overview");
      const body = await res.json().catch(() => ({}));
      if (res.status === 403) { setForbidden(true); return; }
      if (!res.ok) { toast.error(body.error ?? "No se pudo cargar"); return; }
      setData(body);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleRoleChange = async (membershipId: string, role: ProjectRole) => {
    const res = await fetch("/api/admin/project-members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectMemberId: membershipId, role }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "No se pudo cambiar el rol");
      return;
    }
    toast.success("Rol actualizado (la plantilla de módulos no cambia sola -- ajústala en Permisos si hace falta)");
    await load();
  };

  const handleManagerToggle = async (membershipId: string, value: boolean) => {
    const res = await fetch("/api/admin/project-members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectMemberId: membershipId, puedeGestionarEquipo: value }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error ?? "No se pudo actualizar"); return; }
    await load();
  };

  const handleRemove = async (membershipId: string, name: string) => {
    if (!confirm(`¿Sacar a ${name} de este proyecto?`)) return;
    const res = await fetch("/api/admin/project-members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectMemberId: membershipId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error ?? "No se pudo sacar"); return; }
    toast.success("Persona removida del proyecto");
    await load();
  };

  const handleAddMember = async (projectId: string) => {
    if (!newMemberUserId) return;
    const res = await fetch("/api/admin/project-members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, userId: newMemberUserId, role: newMemberRole }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error ?? "No se pudo agregar"); return; }
    toast.success("Persona agregada al proyecto");
    setAddingToProjectId(null);
    setNewMemberUserId("");
    setNewMemberRole("member");
    await load();
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-16 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Cargando...</div>;
  }

  if (forbidden) {
    return (
      <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground py-16 text-center max-w-md mx-auto">
        <ShieldAlert className="h-8 w-8 text-muted-foreground/50" />
        Solo el Propietario o un Admin de la organización puede ver el Panel de Permisos.
      </div>
    );
  }

  if (!data) return null;

  const topLevel = data.projects.filter((p) => !p.parentProjectId);
  const childrenOf = (id: string) => data.projects.filter((p) => p.parentProjectId === id);
  const membersOf = (projectId: string) => data.memberships.filter((m) => m.projectId === projectId);
  const nonMembersOf = (projectId: string) => {
    const memberIds = new Set(membersOf(projectId).map((m) => m.userId));
    return data.organizationMembers.filter((m) => !memberIds.has(m.userId));
  };

  const renderProject = (project: ProjectRow, depth: number) => {
    const members = membersOf(project.id);
    const isExpanded = expandedProjectId === project.id;
    const children = childrenOf(project.id);

    return (
      <div key={project.id} style={{ marginLeft: depth * 20 }}>
        <button
          type="button"
          onClick={() => setExpandedProjectId(isExpanded ? null : project.id)}
          className="w-full flex items-center gap-2 py-2.5 px-3 rounded-lg border bg-card hover:bg-muted/40 cursor-pointer text-left"
        >
          {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <span className="font-medium text-sm flex-1">{project.name}</span>
          <Badge variant="outline" className="text-xs">{members.length} persona{members.length === 1 ? "" : "s"}</Badge>
        </button>

        {isExpanded && (
          <div className="ml-6 mt-1.5 mb-2 space-y-1.5">
            {members.length === 0 && <p className="text-xs text-muted-foreground py-1.5">Nadie tiene acceso a este proyecto todavía.</p>}
            {members.map((m) => (
              <div key={m.id} className="rounded-md border p-2.5 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{m.name}</p>
                    {m.email && <p className="text-xs text-muted-foreground truncate">{m.email}</p>}
                  </div>
                  <Select value={m.role} onValueChange={(v) => v && handleRoleChange(m.id, v as ProjectRole)}>
                    <SelectTrigger className="h-7 text-xs w-28 cursor-pointer shrink-0">
                      <SelectValue>{ROLE_LABELS[m.role as ProjectRole] ?? m.role}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(["admin", "member", "artist", "staff"] as const).map((r) => (
                        <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 cursor-pointer">
                    <Checkbox checked={m.puedeGestionarEquipo} onCheckedChange={(v) => handleManagerToggle(m.id, v === true)} />
                    Gestiona equipo
                  </label>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 shrink-0 cursor-pointer"
                    title="Editar permisos finos por módulo"
                    onClick={() => setExpandedMatrixId(expandedMatrixId === m.id ? null : m.id)}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 shrink-0 cursor-pointer text-muted-foreground hover:text-destructive"
                    title="Sacar del proyecto"
                    onClick={() => handleRemove(m.id, m.name)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {expandedMatrixId === m.id && m.modules && (
                  <ModulePermissionsEditor
                    projectId={project.id}
                    userId={m.userId}
                    adminProjectMemberId={m.id}
                    initialModules={m.modules}
                  />
                )}
              </div>
            ))}

            {addingToProjectId === project.id ? (
              <div className="rounded-md border border-dashed p-2.5 space-y-2">
                <Select value={newMemberUserId} onValueChange={(v) => setNewMemberUserId(v ?? "")}>
                  <SelectTrigger className="h-8 text-xs cursor-pointer w-full">
                    <SelectValue placeholder="Elegir persona de la organización" />
                  </SelectTrigger>
                  <SelectContent>
                    {nonMembersOf(project.id).map((m) => (
                      <SelectItem key={m.userId} value={m.userId}>{m.name}{m.email ? ` (${m.email})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Select value={newMemberRole} onValueChange={(v) => v && setNewMemberRole(v as ProjectRole)}>
                    <SelectTrigger className="h-8 text-xs cursor-pointer w-32">
                      <SelectValue>{ROLE_LABELS[newMemberRole]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(["admin", "member", "artist", "staff"] as const).map((r) => (
                        <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-8 text-xs cursor-pointer" disabled={!newMemberUserId} onClick={() => handleAddMember(project.id)}>
                    Agregar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs cursor-pointer" onClick={() => setAddingToProjectId(null)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline" size="sm" className="h-7 text-xs cursor-pointer"
                onClick={() => setAddingToProjectId(project.id)}
              >
                <UserPlus className="h-3.5 w-3.5 mr-1" /> Agregar integrante
              </Button>
            )}
          </div>
        )}

        {children.length > 0 && (
          <div className="mt-1.5 space-y-1.5">
            {children.map((c) => renderProject(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Panel de Permisos</h1>
        <p className="text-muted-foreground text-sm max-w-2xl">
          Vista general de todos los proyectos y quién tiene acceso a cada uno, para configurar roles y permisos
          desde un solo lugar. Esto administra <span className="font-medium">quién puede ver qué</span> --
          no te da acceso a los datos de proyectos en los que no participas.
        </p>
      </div>

      <div className="space-y-1.5">
        {topLevel.map((p) => renderProject(p, 0))}
      </div>
    </div>
  );
}

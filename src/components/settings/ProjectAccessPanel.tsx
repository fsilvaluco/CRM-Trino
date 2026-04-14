"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { ShieldCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrgMember {
  user_id: string;
  role: string;
  profiles: { full_name: string | null; email: string | null; avatar_url: string | null } | null;
}

interface Project {
  id: string;
  name: string;
}

// Full matrix row returned by GET /api/project-members (no projectId)
interface ProjectMemberRow {
  user_id: string;
  project_id: string;
}

function initials(name: string | null, email: string | null): string {
  const src = name ?? email ?? "?";
  return src.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export function ProjectAccessPanel() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  // Key: `${userId}:${projectId}` — tracks current granted assignments
  const [granted, setGranted] = useState<Set<string>>(new Set());
  // Key: `${userId}:${projectId}` — tracks in-flight toggles to disable checkbox
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/org-members").then((r) => r.json()),
      fetch("/api/project-members").then((r) => r.json()),
    ])
      .then(([projs, members, memberships]) => {
        setProjects(Array.isArray(projs) ? projs : []);
        setOrgMembers(Array.isArray(members) ? members : []);

        const rows: ProjectMemberRow[] = Array.isArray(memberships) ? memberships : [];
        setGranted(new Set(rows.map((r) => `${r.user_id}:${r.project_id}`)));
      })
      .catch(() => setError("Error cargando datos de acceso"))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(userId: string, projectId: string, checked: boolean) {
    const key = `${userId}:${projectId}`;
    setPending((prev) => new Set(prev).add(key));

    // Optimistic update
    setGranted((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });

    try {
      const res = await fetch("/api/project-members", {
        method: checked ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? res.statusText);
      }
      toast.success(checked ? "Acceso concedido" : "Acceso revocado");
    } catch (err) {
      // Roll back optimistic update
      setGranted((prev) => {
        const next = new Set(prev);
        if (checked) next.delete(key); else next.add(key);
        return next;
      });
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando asignaciones...
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  const adminMembers = orgMembers.filter((m) => m.role === "owner" || m.role === "admin");
  const regularMembers = orgMembers.filter((m) => m.role === "member");

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Asigna qué proyectos puede ver cada usuario con rol <strong>member</strong>.
        Los cambios son inmediatos.
      </p>

      {/* Admin/owner notice */}
      {adminMembers.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 flex items-start gap-3">
          <ShieldCheck className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Admin/Owner</span> ya tienen acceso completo a todos los proyectos:{" "}
            {adminMembers.map((m, i) => (
              <span key={m.user_id}>
                {m.profiles?.full_name ?? m.profiles?.email ?? m.user_id}
                {i < adminMembers.length - 1 ? ", " : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Member users with project checkboxes */}
      {regularMembers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay usuarios con rol <strong>member</strong> en la organización.
        </p>
      ) : (
        <div className="space-y-3">
          {regularMembers.map((member) => {
            const displayName = member.profiles?.full_name ?? member.profiles?.email ?? member.user_id;
            const avatarSrc = member.profiles?.avatar_url ?? undefined;
            const ini = initials(member.profiles?.full_name ?? null, member.profiles?.email ?? null);

            return (
              <div key={member.user_id} className="rounded-lg border p-4 space-y-3">
                {/* Member header */}
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="text-xs">{ini}</AvatarFallback>
                    {avatarSrc && <AvatarImage src={avatarSrc} />}
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{displayName}</p>
                    {member.profiles?.email && member.profiles.full_name && (
                      <p className="text-xs text-muted-foreground truncate">{member.profiles.email}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="ml-auto shrink-0 text-xs">
                    Miembro
                  </Badge>
                </div>

                {/* Project checkboxes */}
                {projects.length === 0 ? (
                  <p className="text-xs text-muted-foreground pl-11">No hay proyectos en la organización</p>
                ) : (
                  <div className="pl-11 flex flex-wrap gap-2">
                    {projects.map((project) => {
                      const key = `${member.user_id}:${project.id}`;
                      const isGranted = granted.has(key);
                      const isPending = pending.has(key);

                      return (
                        <label
                          key={project.id}
                          className={cn(
                            "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium cursor-pointer select-none transition-colors",
                            isPending && "opacity-50 cursor-wait",
                            isGranted
                              ? "border-primary/50 bg-primary/10 text-primary"
                              : "border-border bg-transparent text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground"
                          )}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={isGranted}
                            disabled={isPending}
                            onChange={(e) => toggle(member.user_id, project.id, e.target.checked)}
                          />
                          <span
                            className={cn(
                              "inline-flex h-3.5 w-3.5 items-center justify-center rounded border transition-colors shrink-0",
                              isGranted
                                ? "border-primary bg-primary"
                                : "border-muted-foreground/40 bg-transparent"
                            )}
                          >
                            {isGranted && (
                              <svg viewBox="0 0 10 8" className="h-2 w-2 fill-primary-foreground">
                                <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          {project.name}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
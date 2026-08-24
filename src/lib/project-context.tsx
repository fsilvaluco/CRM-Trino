"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { applyProjectThemeColor, resetProjectThemeColor } from "@/lib/theme-palettes";
import type { ProjectRole } from "@/lib/project-roles";

export interface ProjectOption {
  id: string;
  name: string;
  themeColor?: string;
  avatarUrl?: string | null;
  avatarSource?: string | null;
  driveUrl?: string | null;
  // Rol del usuario en ESTE proyecto -- "admin" siempre para owner/admin de
  // la organización (bypass total), o el valor de `project_members.role`
  // para el resto. `null` = sin restricciones conocidas (no debería pasar
  // para un member real, pero por las dudas no se trata como restringido).
  // Ver src/lib/project-roles.ts para qué puede ver/editar cada rol.
  role?: ProjectRole | null;
}

export type OrgRole = "owner" | "admin" | "member";

interface ProjectContextValue {
  activeProject: ProjectOption | null; // null = "Todos los proyectos" (solo admin)
  setActiveProject: (p: ProjectOption | null) => void;
  projects: ProjectOption[];
  setProjects: (p: ProjectOption[]) => void;
  reloadProjects: () => void;
  isAllProjects: boolean;
  isAdmin: boolean;
  orgRole: OrgRole | null;
  loading: boolean;
  // Permisos del proyecto activo -- ver src/lib/project-roles.ts
  activeProjectRole: ProjectRole | null;
  canViewDealsModule: boolean;
  canEditDeals: boolean;
  canViewEventCosts: boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

const STORAGE_KEY = "crm_active_project";
const STORAGE_PROJECTS_KEY = "crm_projects_cache";

function readStoredProjects(): ProjectOption[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem(STORAGE_PROJECTS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is ProjectOption =>
            Boolean(item) && typeof item.id === "string" && typeof item.name === "string"
        )
      : [];
  } catch {
    return [];
  }
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const [projects, setProjects] = useState<ProjectOption[]>(() => readStoredProjects());
  const [activeProject, setActiveProjectState] = useState<ProjectOption | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [orgRole, setOrgRole] = useState<OrgRole | null>(null);
  const [loading, setLoading] = useState(true);

  const reloadProjects = useCallback(async () => {
    if (!userId) {
      console.log("[project-context] orgRole -> null (reloadProjects sin userId)", new Date().toISOString());
      setProjects([]);
      setOrgRole(null);
      setActiveProjectState(null);
      setLoading(false);
      if (typeof window !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_PROJECTS_KEY);
      }
      return;
    }

    setLoading(true);

    try {
      // 1. Verificar rol del usuario en la organización
      const { data: memberRow, error: memberError } = await supabase
        .from("organization_members")
        .select("role, organization_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (memberError) {
        throw memberError;
      }

      if (!memberRow) {
        setLoading(false);
        return;
      }

      const role = memberRow.role as OrgRole;
      console.log(`[project-context] orgRole -> ${role} (reloadProjects OK)`, new Date().toISOString());
      setOrgRole(role);

      // El rol de organización (owner/admin/member) ya NO da acceso
      // automático a los proyectos -- corregido 23 ago 2026, mismo día que
      // el fix del servidor (ver BITACORA.md, "Aislamiento entre
      // proyectos"). Todos, sin excepción, ven solo los proyectos donde
      // tienen fila en `project_members` -- el rol de organización solo
      // controla acciones administrativas de la organización en sí
      // (billing, equipo, etc.), no visibilidad de datos de un proyecto.
      let list: ProjectOption[] = [];

      const { data: memberships, error: membershipsError } = await supabase
        .from("project_members")
        .select("project_id, role")
        .eq("user_id", userId)
        .eq("organization_id", memberRow.organization_id);

      if (membershipsError) {
        throw membershipsError;
      }

      const projectIds = (memberships ?? []).map((m: { project_id: string }) => m.project_id);
      const roleByProjectId = new Map(
        (memberships ?? []).map((m: { project_id: string; role: string }) => [m.project_id, m.role as ProjectRole])
      );
      if (projectIds.length === 0) {
        setProjects([]);
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify([]));
          localStorage.removeItem(STORAGE_KEY);
        }
        setActiveProjectState(null);
        return;
      }

      const { data, error: projectsError } = await supabase
        .from("projects")
        .select("id, name, theme_color, avatar_url, avatar_source, drive_url")
        .in("id", projectIds)
        .order("created_at", { ascending: false });

      if (projectsError) {
        throw projectsError;
      }

      list = (data ?? []).map(
        (p: { id: string; name: string; theme_color?: string; avatar_url?: string | null; avatar_source?: string | null; drive_url?: string | null }) => ({
          id: p.id,
          name: p.name,
          themeColor: p.theme_color,
          avatarUrl: p.avatar_url,
          avatarSource: p.avatar_source,
          driveUrl: p.drive_url,
          role: roleByProjectId.get(p.id) ?? null,
        })
      );

      setProjects(list);
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(list));
      }

      setActiveProjectState((prev) => {
        if (!prev) {
          if (list.length === 1) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list[0]));
            return list[0];
          }
          return prev;
        }

        // Importante: no basta con comprobar que el proyecto sigue
        // existiendo — hay que devolver la versión FRESCA de la lista, no
        // la referencia vieja en cache. Si no, cambios hechos server-side
        // (ej. el cron actualizando el avatar_url, o cualquier admin
        // cambiando el color) nunca se reflejan hasta que el usuario
        // reselecciona el proyecto a mano.
        const fresh = list.find((project) => project.id === prev.id);
        if (fresh) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
          return fresh;
        }

        localStorage.removeItem(STORAGE_KEY);
        return null;
      });
    } catch {
      // Preserve last known good state when the browser resumes from background
      // and one of the project queries fails transiently.
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Cargar proyectos solo cuando el usuario esté autenticado
  useEffect(() => {
    console.log(`[project-context] effect userId=${userId} authLoading=${authLoading}`, new Date().toISOString());
    if (authLoading) return;

    if (userId) {
      setLoading(true);
      const timerId = window.setTimeout(() => {
        void reloadProjects();
      }, 0);
      return () => window.clearTimeout(timerId);
    }

    // Antes esto se ejecutaba casi instantaneo (setTimeout de 0ms) -- si la
    // sesion parpadeaba momentaneamente a null (ej. un refresco de token en
    // segundo plano) mientras el usuario seguia realmente logueado, esto
    // podia alcanzar a borrar orgRole/isAdmin antes de que la sesion real
    // se restableciera, dejando a un Propietario/Admin viendo la app como
    // si no tuviera permisos. Con mas margen, si userId vuelve a tener
    // valor antes de que se cumpla el tiempo, React cancela este timer solo
    // (por el cleanup de abajo) y nunca llega a borrar nada.
    const timerId = window.setTimeout(() => {
      console.log("[project-context] orgRole -> null (timeout, sin userId sostenido 1.2s)", new Date().toISOString());
      setProjects([]);
      setOrgRole(null);
      setActiveProjectState(null);
      setLoading(false);
      localStorage.removeItem(STORAGE_KEY);
    }, 1200);

    return () => window.clearTimeout(timerId);
  }, [authLoading, userId, reloadProjects]);

  const setActiveProject = useCallback((p: ProjectOption | null) => {
    setActiveProjectState(p);
    if (p) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Theming por proyecto: aplica la paleta del proyecto activo, o vuelve al
  // azul por defecto en "Todos los proyectos" (solo admin puede estar ahí).
  useEffect(() => {
    if (activeProject) {
      applyProjectThemeColor(activeProject.themeColor);
    } else {
      resetProjectThemeColor();
    }
  }, [activeProject]);

  const isAdmin = orgRole === "owner" || orgRole === "admin";

  // Rol granular del proyecto activo -- ya NO se fuerza a "admin" solo por
  // ser admin de organización (corregido 23 ago 2026, ver BITACORA.md).
  // En "Todos los proyectos" (activeProject null, solo alcanzable si hay
  // más de un proyecto asignado) no hay un único rol -- para la
  // visibilidad de nav (lo único que consume esto hoy, ver Sidebar.tsx) se
  // usa el mejor rol entre los proyectos asignados.
  const activeProjectRole: ProjectRole | null = activeProject
    ? activeProject.role ?? null
    : projects.some((p) => p.role && p.role !== "staff")
      ? "member"
      : null;
  const canViewDealsModule = activeProjectRole !== "staff" && activeProjectRole !== null;
  const canEditDeals = activeProjectRole === "admin" || activeProjectRole === "member";
  const canViewEventCosts = activeProjectRole === "admin" || activeProjectRole === "member";

  const contextValue = useMemo(
    () => ({
      activeProject,
      setActiveProject,
      projects,
      setProjects,
      reloadProjects,
      isAllProjects: activeProject === null,
      isAdmin,
      orgRole,
      loading,
      activeProjectRole,
      canViewDealsModule,
      canEditDeals,
      canViewEventCosts,
    }),
    [
      activeProject,
      isAdmin,
      loading,
      orgRole,
      projects,
      reloadProjects,
      setActiveProject,
      activeProjectRole,
      canViewDealsModule,
      canEditDeals,
      canViewEventCosts,
    ]
  );

  return (
    <ProjectContext.Provider value={contextValue}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject debe usarse dentro de ProjectProvider");
  return ctx;
}

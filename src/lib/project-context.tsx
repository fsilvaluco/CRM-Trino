"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { applyProjectThemeColor, resetProjectThemeColor } from "@/lib/theme-palettes";

export interface ProjectOption {
  id: string;
  name: string;
  themeColor?: string;
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
      setOrgRole(role);
      const isAdmin = role === "owner" || role === "admin";

      let list: ProjectOption[] = [];

      if (isAdmin) {
        // Owner/admin: ve todos los proyectos de la organización
        const { data, error: projectsError } = await supabase
          .from("projects")
          .select("id, name, theme_color")
          .eq("organization_id", memberRow.organization_id)
          .order("created_at", { ascending: false });

        if (projectsError) {
          throw projectsError;
        }

        list = (data ?? []).map((p: { id: string; name: string; theme_color?: string }) => ({
          id: p.id,
          name: p.name,
          themeColor: p.theme_color,
        }));
      } else {
        // Member: solo los proyectos asignados en project_members
        const { data: memberships, error: membershipsError } = await supabase
          .from("project_members")
          .select("project_id")
          .eq("user_id", userId)
          .eq("organization_id", memberRow.organization_id);

        if (membershipsError) {
          throw membershipsError;
        }

        const projectIds = (memberships ?? []).map((m: { project_id: string }) => m.project_id);
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
          .select("id, name, theme_color")
          .in("id", projectIds)
          .order("created_at", { ascending: false });

        if (projectsError) {
          throw projectsError;
        }

        list = (data ?? []).map((p: { id: string; name: string; theme_color?: string }) => ({
          id: p.id,
          name: p.name,
          themeColor: p.theme_color,
        }));
      }

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

        const stillExists = list.some((project) => project.id === prev.id);
        if (stillExists) {
          return prev;
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
    if (authLoading) return;

    if (userId) {
      setLoading(true);
      const timerId = window.setTimeout(() => {
        void reloadProjects();
      }, 0);
      return () => window.clearTimeout(timerId);
    }

    const timerId = window.setTimeout(() => {
      setProjects([]);
      setOrgRole(null);
      setActiveProjectState(null);
      setLoading(false);
      localStorage.removeItem(STORAGE_KEY);
    }, 0);

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
    }),
    [activeProject, isAdmin, loading, orgRole, projects, reloadProjects, setActiveProject]
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

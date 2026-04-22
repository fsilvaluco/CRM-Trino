"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";

export interface ProjectOption {
  id: string;
  name: string;
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
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

const STORAGE_KEY = "crm_active_project";

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const [projects, setProjects] = useState<ProjectOption[]>([]);
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

  const reloadProjects = useCallback(async () => {
    if (!userId) return;

    // 1. Verificar rol del usuario en la organización
    const { data: memberRow } = await supabase
      .from("organization_members")
      .select("role, organization_id")
      .eq("user_id", userId)
      .single();

    if (!memberRow) return;

    const role = memberRow.role as OrgRole;
    setOrgRole(role);
    const isAdmin = role === "owner" || role === "admin";

    let list: ProjectOption[] = [];

    if (isAdmin) {
      // Owner/admin: ve todos los proyectos de la organización
      const { data } = await supabase
        .from("projects")
        .select("id, name")
        .eq("organization_id", memberRow.organization_id)
        .order("created_at", { ascending: false });
      list = (data ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }));
    } else {
      // Member: solo los proyectos asignados en project_members
      const { data: memberships } = await supabase
        .from("project_members")
        .select("project_id")
        .eq("user_id", userId)
        .eq("organization_id", memberRow.organization_id);

      const projectIds = (memberships ?? []).map((m: { project_id: string }) => m.project_id);
      if (projectIds.length === 0) {
        setProjects([]);
        return;
      }

      const { data } = await supabase
        .from("projects")
        .select("id, name")
        .in("id", projectIds)
        .order("created_at", { ascending: false });
      list = (data ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }));
    }

    setProjects(list);

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
  }, [userId]);

  // Cargar proyectos solo cuando el usuario esté autenticado
  useEffect(() => {
    if (authLoading) return;

    if (userId) {
      const timerId = window.setTimeout(() => {
        void reloadProjects();
      }, 0);
      return () => window.clearTimeout(timerId);
    }

    const timerId = window.setTimeout(() => {
      setProjects([]);
      setOrgRole(null);
      setActiveProjectState(null);
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
    }),
    [activeProject, isAdmin, orgRole, projects, reloadProjects, setActiveProject]
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

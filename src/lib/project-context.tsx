"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";

export interface ProjectOption {
  id: string;
  name: string;
}

interface ProjectContextValue {
  activeProject: ProjectOption | null; // null = "Todos los proyectos" (solo admin)
  setActiveProject: (p: ProjectOption | null) => void;
  projects: ProjectOption[];
  setProjects: (p: ProjectOption[]) => void;
  reloadProjects: () => void;
  isAllProjects: boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

const STORAGE_KEY = "crm_active_project";

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [activeProject, setActiveProjectState] = useState<ProjectOption | null>(null);

  const reloadProjects = useCallback(async () => {
    if (!user) return;

    // 1. Verificar rol del usuario en la organización
    const { data: memberRow } = await supabase
      .from("organization_members")
      .select("role, organization_id")
      .eq("user_id", user.id)
      .single();

    if (!memberRow) return;

    const isAdmin = memberRow.role === "owner" || memberRow.role === "admin";

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
        .eq("user_id", user.id)
        .eq("organization_id", memberRow.organization_id);

      const projectIds = (memberships ?? []).map((m: { project_id: string }) => m.project_id);
      if (projectIds.length === 0) { setProjects([]); return; }

      const { data } = await supabase
        .from("projects")
        .select("id, name")
        .in("id", projectIds)
        .order("created_at", { ascending: false });
      list = (data ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }));
    }

    setProjects(list);

    if (list.length === 1) {
      setActiveProjectState((prev) => prev ?? list[0]);
      if (!localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list[0]));
      }
    }
  }, [user]);

  // Cargar proyectos solo cuando el usuario esté autenticado
  useEffect(() => {
    if (!authLoading && user) {
      reloadProjects();
    }
    if (!authLoading && !user) {
      setProjects([]);
    }
  }, [authLoading, user, reloadProjects]);

  // Restaurar proyecto activo desde localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setActiveProjectState(JSON.parse(stored));
      }
    } catch {
      // ignorar
    }
  }, []);

  const setActiveProject = (p: ProjectOption | null) => {
    setActiveProjectState(p);
    if (p) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <ProjectContext.Provider value={{
      activeProject,
      setActiveProject,
      projects,
      setProjects,
      reloadProjects,
      isAllProjects: activeProject === null,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject debe usarse dentro de ProjectProvider");
  return ctx;
}

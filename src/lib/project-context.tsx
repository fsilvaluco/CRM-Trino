"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";

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
    // Usar API route (con requireAuth) para que filtre por allowedProjectIds según rol
    const res = await fetch("/api/projects");
    if (!res.ok) {
      console.error("[ProjectProvider] error cargando proyectos:", res.statusText);
      return;
    }
    const data = await res.json();
    const list: ProjectOption[] = (Array.isArray(data) ? data : []).map((p: { id: string; name: string }) => ({
      id: p.id,
      name: p.name,
    }));

    setProjects(list);

    if (list.length === 1) {
      setActiveProjectState((prev) => prev ?? list[0]);
      if (!localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list[0]));
      }
    }
  }, []);

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

"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface ProjectOption {
  id: string;
  name: string;
}

interface ProjectContextValue {
  activeProject: ProjectOption | null; // null = "Todos los proyectos" (solo admin)
  setActiveProject: (p: ProjectOption | null) => void;
  projects: ProjectOption[];
  setProjects: (p: ProjectOption[]) => void;
  isAllProjects: boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

const STORAGE_KEY = "crm_active_project";

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [activeProject, setActiveProjectState] = useState<ProjectOption | null>(null);

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

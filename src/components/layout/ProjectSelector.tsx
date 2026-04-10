"use client";

import { useEffect } from "react";
import { useProject } from "@/lib/project-context";
import { ChevronDown, Layers, FolderOpen } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ProjectSelector() {
  const { activeProject, setActiveProject, projects, setProjects, isAllProjects } = useProject();

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })) : [];
        setProjects(list);
        if (!activeProject && list.length === 1) {
          setActiveProject(list[0]);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (projects.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-input bg-background hover:bg-accent transition-colors text-sm cursor-pointer max-w-[200px]">
        {isAllProjects ? (
          <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <FolderOpen className="h-4 w-4 text-primary shrink-0" />
        )}
        <span className="truncate font-medium">
          {isAllProjects ? "Todos" : activeProject?.name}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        {/* "Todos" solo aparece si la API devuelve más de un proyecto (admin/owner) */}
        {projects.length > 1 && (
          <>
            <DropdownMenuItem
              className={`gap-2 cursor-pointer ${isAllProjects ? "font-medium bg-accent" : ""}`}
              onClick={() => setActiveProject(null)}
            >
              <Layers className="h-4 w-4 text-muted-foreground" />
              Todos los proyectos
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {projects.map((p) => (
          <DropdownMenuItem
            key={p.id}
            className={`gap-2 cursor-pointer ${activeProject?.id === p.id ? "font-medium bg-accent" : ""}`}
            onClick={() => setActiveProject(p)}
          >
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            {p.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

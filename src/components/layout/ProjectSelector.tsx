"use client";

import { useState } from "react";
import { useProject } from "@/lib/project-context";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { ChevronDown, Layers, FolderOpen, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ProjectSelector() {
  const { activeProject, setActiveProject, projects, reloadProjects, isAllProjects } = useProject();
  const [showForm, setShowForm] = useState(false);

  const label =
    projects.length === 0
      ? "Sin proyecto"
      : isAllProjects
      ? "Todos"
      : (activeProject?.name ?? "Proyecto");

  return (
    <>
      <ProjectForm
        open={showForm}
        onClose={() => {
          setShowForm(false);
          reloadProjects();
        }}
      />

      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-input bg-background hover:bg-accent transition-colors text-sm cursor-pointer max-w-[200px]">
          {projects.length === 0 ? (
            <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : isAllProjects ? (
            <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <FolderOpen className="h-4 w-4 text-primary shrink-0" />
          )}
          <span className="truncate font-medium text-muted-foreground">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-56">
          {projects.length === 0 ? (
            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 text-muted-foreground" />
              Crear primer proyecto
            </DropdownMenuItem>
          ) : (
            <>
              {projects.length > 1 && (
                <>
                  <DropdownMenuItem
                    className={'gap-2 cursor-pointer ' + (isAllProjects ? 'font-medium bg-accent' : '')}
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
                  className={'gap-2 cursor-pointer ' + (activeProject?.id === p.id ? 'font-medium bg-accent' : '')}
                  onClick={() => setActiveProject(p)}
                >
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  {p.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 cursor-pointer text-muted-foreground"
                onClick={() => setShowForm(true)}
              >
                <Plus className="h-4 w-4" />
                Nuevo proyecto
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

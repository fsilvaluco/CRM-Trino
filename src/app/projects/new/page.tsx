"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { useProject } from "@/lib/project-context";

export default function NewProjectPage() {
  const router = useRouter();
  const { setProjects, setActiveProject } = useProject();
  const [open, setOpen] = useState(true);

  const handleClose = async () => {
    // Recargar lista de proyectos en el context
    const res = await fetch("/api/projects");
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })) : [];
      setProjects(list);
      // Seleccionar el primero si solo hay uno
      if (list.length === 1) setActiveProject(list[0]);
    }
    setOpen(false);
    router.push("/");
  };

  return (
    <ProjectForm open={open} onClose={handleClose} />
  );
}

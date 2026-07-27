"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useProject } from "@/lib/project-context";

export function DriveLinkPanel() {
  const { activeProject, reloadProjects } = useProject();
  const [driveUrl, setDriveUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDriveUrl(activeProject?.driveUrl ?? "");
  }, [activeProject?.id, activeProject?.driveUrl]);

  if (!activeProject) {
    return (
      <p className="text-sm text-muted-foreground">
        Selecciona un proyecto (arriba a la izquierda) para configurar su link de Drive.
      </p>
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${activeProject!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveUrl: driveUrl.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo guardar");
        return;
      }
      toast.success("Link de Drive guardado");
      reloadProjects();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Carpeta o unidad compartida de Google Drive de <span className="font-medium">{activeProject.name}</span>.
        Aparece como acceso rápido junto a las notificaciones, para cualquiera con acceso al proyecto.
      </p>
      <div className="space-y-2">
        <Label>Link de Drive</Label>
        <Input
          value={driveUrl}
          onChange={(e) => setDriveUrl(e.target.value)}
          placeholder="https://drive.google.com/drive/folders/..."
        />
      </div>
      <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
        {saving ? "Guardando..." : "Guardar link de Drive"}
      </Button>
    </div>
  );
}

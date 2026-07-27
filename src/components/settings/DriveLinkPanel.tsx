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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // No confiar en activeProject.driveUrl del contexto (se cachea en
  // localStorage y puede quedar desactualizado) -- siempre traer el valor
  // real directo del API cuando se abre este panel o cambia el proyecto.
  useEffect(() => {
    if (!activeProject) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/projects/${activeProject.id}`)
      .then((r) => r.json())
      .then((data) => setDriveUrl(data.driveUrl ?? ""))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeProject?.id]);

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
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo guardar");
        return;
      }
      // Confirmar con el valor que realmente quedo guardado (no solo el
      // que había en el input), y refrescar el contexto global para que
      // el ícono del header se actualice sin necesidad de refrescar la
      // página.
      setDriveUrl(data.driveUrl ?? "");
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
          placeholder={loading ? "Cargando..." : "https://drive.google.com/drive/folders/..."}
          disabled={loading}
        />
      </div>
      <Button onClick={handleSave} disabled={saving || loading} className="cursor-pointer">
        {saving ? "Guardando..." : "Guardar link de Drive"}
      </Button>
    </div>
  );
}

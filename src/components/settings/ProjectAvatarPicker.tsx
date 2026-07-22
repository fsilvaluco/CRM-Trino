"use client";

import { useRef, useState } from "react";
import { Loader2, Upload, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useProject } from "@/lib/project-context";
import { ProjectIcon } from "@/components/shared/ProjectIcon";

export function ProjectAvatarPicker() {
  const { activeProject, setActiveProject } = useProject();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!activeProject) {
    return (
      <p className="text-sm text-muted-foreground">
        Selecciona un proyecto para elegir su ícono.
      </p>
    );
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("La imagen no puede superar 2MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten imágenes");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${activeProject.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("project-avatars")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("project-avatars").getPublicUrl(path);
      const url = `${data.publicUrl}?t=${Date.now()}`;

      const res = await fetch(`/api/projects/${activeProject.id}/avatar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: url }),
      });
      const resData = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(resData?.error ?? "Error al guardar el ícono");
        return;
      }

      setActiveProject({ ...activeProject, avatarUrl: url, avatarSource: "manual" });
      toast.success("Ícono actualizado");
    } catch {
      toast.error("Error al subir la imagen");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleReset = async () => {
    setUploading(true);
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/avatar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Error al restablecer");
        return;
      }
      setActiveProject({ ...activeProject, avatarUrl: null, avatarSource: null });
      toast.success("Vuelto al ícono automático de Instagram");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Ícono de <span className="font-medium text-foreground">{activeProject.name}</span>
        {activeProject.avatarSource === "instagram" && " · desde Instagram"}
        {activeProject.avatarSource === "manual" && " · imagen propia"}
      </p>
      <div className="flex items-center gap-3">
        <ProjectIcon avatarUrl={activeProject.avatarUrl} name={activeProject.name} size="md" />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5 mr-1.5" />
          )}
          Subir imagen
        </Button>
        {activeProject.avatarSource === "manual" && (
          <Button type="button" variant="ghost" size="sm" onClick={handleReset} disabled={uploading}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Usar la de Instagram
          </Button>
        )}
      </div>
    </div>
  );
}

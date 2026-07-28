"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useProject } from "@/lib/project-context";

interface ProjectOption {
  id: string;
  name: string;
}

export function SelloPanel() {
  const { activeProject, projects, reloadProjects } = useProject();
  const [parentProjectId, setParentProjectId] = useState<string>("");
  const [selfManaged, setSelfManaged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeProject) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/projects/${activeProject.id}`)
      .then((r) => r.json())
      .then((data) => {
        setParentProjectId(data.parentProjectId ?? "");
        setSelfManaged(Boolean(data.selfManaged));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeProject?.id]);

  if (!activeProject) {
    return (
      <p className="text-sm text-muted-foreground">
        Selecciona un proyecto (arriba a la izquierda) para ver de qué sello depende.
      </p>
    );
  }

  const parentOptions: ProjectOption[] = projects.filter((p) => p.id !== activeProject.id);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${activeProject!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentProjectId: parentProjectId || null,
          selfManaged,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo guardar");
        return;
      }
      toast.success("Relación con el sello guardada");
      reloadProjects();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Si <span className="font-medium">{activeProject.name}</span> es un artista que depende de una
        agencia/sello (ej. Gamuza depende de Trino), elígelo aquí. Sus tratos y tareas van a seguir
        gestionándose desde el sello, pero {activeProject.name} también los va a ver.
      </p>

      <div className="space-y-2">
        <Label>Depende de (sello/agencia)</Label>
        <Select
          value={parentProjectId || "__none__"}
          onValueChange={(v) => setParentProjectId(!v || v === "__none__" ? "" : v)}
          disabled={loading}
        >
          <SelectTrigger className="cursor-pointer">
            <SelectValue placeholder={loading ? "Cargando..." : "Ninguno (proyecto independiente)"}>
              {parentProjectId
                ? parentOptions.find((p) => p.id === parentProjectId)?.name ?? "Ninguno (proyecto independiente)"
                : "Ninguno (proyecto independiente)"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Ninguno (proyecto independiente)</SelectItem>
            {parentOptions.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {parentProjectId && (
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={selfManaged} onCheckedChange={(v) => setSelfManaged(Boolean(v))} />
          Autogestionado — {activeProject.name} puede crear/editar sus propios tratos, no solo verlos
        </label>
      )}

      <Button onClick={handleSave} disabled={saving || loading} className="cursor-pointer">
        {saving ? "Guardando..." : "Guardar"}
      </Button>
    </div>
  );
}

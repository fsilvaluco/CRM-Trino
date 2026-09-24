"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { useProject } from "@/lib/project-context";

// Pixel de Meta + token de la API de conversiones del proyecto activo.
// El token se pega aqui y queda solo en el servidor: esta pantalla nunca lo
// recibe de vuelta, solo sabe si existe y sus ultimos 4 caracteres.

interface Status {
  pixelId: string | null;
  pixelName: string | null;
  hasToken: boolean;
  tokenLast4: string | null;
}

export function MetaCapiPanel() {
  const { activeProject, isAllProjects } = useProject();
  const [status, setStatus] = useState<Status | null>(null);
  const [pixelId, setPixelId] = useState("");
  const [pixelName, setPixelName] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);

  // Depende solo del id del proyecto: el contexto se refresca en segundo plano y
  // no debe borrar lo que el usuario esta escribiendo.
  const projectId = activeProject?.id;
  const load = useCallback(async () => {
    if (!projectId) return;
    const res = await fetch(`/api/integrations/meta-capi?projectId=${projectId}`);
    if (!res.ok) return setStatus(null);
    const data: Status = await res.json();
    setStatus(data);
    setPixelId((cur) => cur || (data.pixelId ?? ""));
    setPixelName((cur) => cur || (data.pixelName ?? ""));
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isAllProjects || !activeProject) {
    return <p className="text-sm text-muted-foreground">Selecciona un proyecto para configurar su pixel.</p>;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/meta-capi", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: activeProject!.id, pixelId, pixelName, accessToken: token || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo guardar");
      setToken("");
      toast.success("Pixel guardado");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const ready = status?.pixelId && status.hasToken;

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        {ready ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : (
          <CircleAlert className="h-4 w-4 text-amber-600" />
        )}
        <span>
          {ready
            ? `Activo en ${activeProject.name}: pixel ${status!.pixelId}, token terminado en ····${status!.tokenLast4}`
            : status?.pixelId
              ? "Falta el token: los eventos no se envían a Meta hasta que lo pegues."
              : "Sin pixel configurado para este proyecto."}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="capi-pixel">ID del pixel (conjunto de datos)</Label>
          <Input id="capi-pixel" value={pixelId} onChange={(e) => setPixelId(e.target.value)} inputMode="numeric" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="capi-name">Nombre (opcional)</Label>
          <Input id="capi-name" value={pixelName} onChange={(e) => setPixelName(e.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="capi-token">Token de la API de conversiones</Label>
          <Input
            id="capi-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={status?.hasToken ? "Déjalo vacío para mantener el actual" : "Pega el token aquí"}
          />
          <p className="text-xs text-muted-foreground">
            Administrador de eventos → tu pixel → Configuración → API de conversiones → Generar token de acceso.
          </p>
        </div>
      </div>

      <Button type="submit" disabled={saving || !pixelId} className="cursor-pointer">
        {saving ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}

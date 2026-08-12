"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useProject } from "@/lib/project-context";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface BroadcastHistoryItem {
  id: string;
  title: string;
  body: string;
  targetProjectId: string | null;
  targetProjectName: string | null;
  recipientCount: number;
  sentByName: string;
  createdAt: string;
}

// Panel de admin para mandar una notificacion push con mensaje libre --
// "toda la organizacion" o un proyecto puntual (project_members de ese
// proyecto). Pensado para avisos que no calzan en ningun trigger
// automatico ("mañana no hay oficina", "recuerden cargar el reporte", etc).
export function BroadcastPanel() {
  const { projects } = useProject();
  const [scope, setScope] = useState<"org" | "project">("org");
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<BroadcastHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  function loadHistory() {
    setLoadingHistory(true);
    fetch("/api/admin/broadcast")
      .then((r) => r.json())
      .then((data) => setHistory(Array.isArray(data) ? data : []))
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
  }

  useEffect(() => {
    loadHistory();
  }, []);

  async function handleSend() {
    if (!title.trim() || !body.trim()) {
      toast.error("Título y mensaje son requeridos");
      return;
    }
    if (scope === "project" && !projectId) {
      toast.error("Elige un proyecto");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), scope, projectId: scope === "project" ? projectId : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al enviar");

      toast.success(
        data.notified === 0
          ? "Enviado, pero nadie en ese grupo tiene notificaciones activadas todavía"
          : `Notificación enviada a ${data.notified} persona${data.notified === 1 ? "" : "s"}`
      );
      setTitle("");
      setBody("");
      loadHistory();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al enviar");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Enviar a</Label>
          <Select value={scope} onValueChange={(v) => setScope(v as "org" | "project")}>
            <SelectTrigger className="cursor-pointer w-full">
              <SelectValue>{scope === "org" ? "Toda la organización" : "Un proyecto específico"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="org">Toda la organización</SelectItem>
              <SelectItem value="project">Un proyecto específico</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {scope === "project" && (
          <div className="space-y-2">
            <Label>Proyecto</Label>
            <Select value={projectId} onValueChange={(v) => setProjectId(v ?? "")}>
              <SelectTrigger className="cursor-pointer w-full">
                <SelectValue placeholder="Selecciona uno">
                  {projects.find((p) => p.id === projectId)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="broadcast-title">Título</Label>
          <Input
            id="broadcast-title"
            placeholder="ej. Mañana no hay oficina"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="broadcast-body">Mensaje</Label>
          <Textarea
            id="broadcast-body"
            placeholder="Escribe el mensaje que va a recibir la gente..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={300}
          />
        </div>

        <Button onClick={handleSend} disabled={sending} className="cursor-pointer">
          {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
          Enviar notificación
        </Button>
      </div>

      <div className="space-y-2 pt-2 border-t">
        <p className="text-sm font-medium">Historial</p>
        {loadingHistory ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no se ha mandado ninguna notificación.</p>
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="text-sm border rounded-lg p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{h.title}</p>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(h.createdAt), { addSuffix: true, locale: es })}
                  </span>
                </div>
                <p className="text-muted-foreground">{h.body}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {h.targetProjectName ? `Proyecto: ${h.targetProjectName}` : "Toda la organización"} · {h.recipientCount} destinatario{h.recipientCount === 1 ? "" : "s"} · por {h.sentByName}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

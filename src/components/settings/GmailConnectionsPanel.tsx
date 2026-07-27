"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Mail, Plus, Trash2, Loader2, Play } from "lucide-react";
import { useProject } from "@/lib/project-context";

interface GmailConnection {
  id: string;
  projectId: string;
  emailAddress: string;
  status: "active" | "revoked" | "error";
  connectedByName: string | null;
  lastSyncAt: string | null;
  createdAt: string;
}

export function GmailConnectionsPanel() {
  const { activeProject } = useProject();
  const [connections, setConnections] = useState<GmailConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [testDays, setTestDays] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!activeProject) {
      setConnections([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations/gmail/connections?projectId=${activeProject.id}`);
      const data = await res.json();
      setConnections(Array.isArray(data) ? data : []);
    } catch {
      toast.error("No se pudieron cargar las conexiones de Gmail");
    } finally {
      setLoading(false);
    }
  }, [activeProject]);

  useEffect(() => {
    load();
  }, [load]);

  // Al volver del flujo OAuth, /settings/integrations trae ?connected=email
  // o ?error=... en la URL -- mostrar el resultado y recargar la lista.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const errorParam = params.get("error");
    if (connected) {
      toast.success(`Gmail conectado: ${connected}`);
      window.history.replaceState({}, "", "/settings/integrations");
      load();
    } else if (errorParam) {
      toast.error(`Error al conectar Gmail (${errorParam})`);
      window.history.replaceState({}, "", "/settings/integrations");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = () => {
    if (!activeProject) {
      toast.error("Selecciona un proyecto primero (arriba a la izquierda)");
      return;
    }
    window.location.href = `/api/integrations/gmail/connect?projectId=${activeProject.id}`;
  };

  const handleRunNow = async (id: string) => {
    setRunningId(id);
    try {
      const days = Number(testDays[id]);
      const res = await fetch(`/api/integrations/gmail/connections/${id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(days > 0 ? { days } : {}),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo correr el detector");
        return;
      }
      if (data.leadsCreated > 0) {
        toast.success(
          `Revisados ${data.messagesScanned} correos, ${data.leadsCreated} lead(s) nuevo(s) en la bandeja`
        );
      } else {
        toast.info(`Revisados ${data.messagesScanned} correos, sin leads nuevos`);
      }
    } finally {
      setRunningId(null);
    }
  };

  const handleDisconnect = async (id: string, email: string) => {
    if (!confirm(`¿Desconectar ${email}? El detector dejara de leer esta cuenta.`)) return;
    setRemovingId(id);
    try {
      const res = await fetch(`/api/integrations/gmail/connections/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo desconectar");
        return;
      }
      toast.success("Cuenta desconectada");
      await load();
    } finally {
      setRemovingId(null);
    }
  };

  if (!activeProject) {
    return (
      <p className="text-sm text-muted-foreground">
        Selecciona un proyecto (arriba a la izquierda) para ver o conectar sus cuentas de Gmail.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Cuentas de Gmail conectadas a <span className="font-medium">{activeProject.name}</span>.
          Cada persona conecta su propia cuenta; puede haber varias por proyecto.
        </p>
        <Button size="sm" onClick={handleConnect} className="cursor-pointer shrink-0">
          <Plus className="h-4 w-4 mr-1" />
          Conectar Gmail
        </Button>
      </div>

      {loading ? (
        <div className="h-16 bg-muted rounded-lg animate-pulse" />
      ) : connections.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Mail className="h-4 w-4" />
          Nadie ha conectado Gmail para este proyecto todavia.
        </div>
      ) : (
        <div className="space-y-2">
          {connections.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{c.emailAddress}</p>
                  <p className="text-xs text-muted-foreground">
                    Conectada por {c.connectedByName ?? "desconocido"}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    c.status === "active"
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                      : "bg-amber-500/15 text-amber-300 border-amber-500/40"
                  }
                >
                  {c.status === "active" ? "Activa" : c.status === "revoked" ? "Revocada" : "Error"}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={90}
                  placeholder="días"
                  value={testDays[c.id] ?? ""}
                  onChange={(e) => setTestDays((prev) => ({ ...prev, [c.id]: e.target.value }))}
                  className="w-16 h-9 rounded border border-input bg-background px-2 text-sm"
                  title="Dias hacia atras a revisar (solo para pruebas; vacio = normal)"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="cursor-pointer"
                  disabled={runningId === c.id}
                  onClick={() => handleRunNow(c.id)}
                >
                  {runningId === c.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-1" />
                      Probar ahora
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="cursor-pointer text-destructive hover:text-destructive"
                  disabled={removingId === c.id}
                  onClick={() => handleDisconnect(c.id, c.emailAddress)}
                >
                  {removingId === c.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

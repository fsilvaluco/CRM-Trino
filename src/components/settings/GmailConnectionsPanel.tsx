"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Mail, Plus, Trash2, Loader2, Play, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { useProject } from "@/lib/project-context";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface SyncRun {
  id: string;
  trigger: "cron" | "manual";
  messagesScanned: number;
  leadsCreated: number;
  error: string | null;
  ranAt: string;
}

interface GmailConnection {
  id: string;
  projectId: string;
  emailAddress: string;
  status: "active" | "revoked" | "error";
  connectedByName: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  lastCronRun: SyncRun | null;
  lastManualRun: SyncRun | null;
  recentRuns: SyncRun[];
}

export function GmailConnectionsPanel() {
  const { activeProject } = useProject();
  const [connections, setConnections] = useState<GmailConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [testDays, setTestDays] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function formatRunDate(value: string) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return format(d, "d MMM yyyy, HH:mm", { locale: es });
  }

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
      await load();
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
              className="rounded-lg border p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
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

              {/* Log de la última corrida automática vs manual -- para
                  poder comparar si el cron de Railway efectivamente corre
                  y detecta lo mismo que "Probar ahora". */}
              <div className="pl-7 space-y-1 text-xs text-muted-foreground">
                {c.lastCronRun ? (
                  <p className="flex items-center gap-1">
                    {c.lastCronRun.error && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
                    <span className="font-medium">Último cron automático:</span>{" "}
                    {formatRunDate(c.lastCronRun.ranAt)} ·{" "}
                    {c.lastCronRun.error
                      ? <span className="text-destructive">error: {c.lastCronRun.error}</span>
                      : `${c.lastCronRun.messagesScanned} correo${c.lastCronRun.messagesScanned !== 1 ? "s" : ""} revisado${c.lastCronRun.messagesScanned !== 1 ? "s" : ""}, ${c.lastCronRun.leadsCreated} lead${c.lastCronRun.leadsCreated !== 1 ? "s" : ""} encontrado${c.lastCronRun.leadsCreated !== 1 ? "s" : ""}`}
                  </p>
                ) : (
                  <p>El cron automático todavía no ha corrido para esta cuenta.</p>
                )}
                {c.lastManualRun && (
                  <p>
                    <span className="font-medium">Última prueba manual:</span>{" "}
                    {formatRunDate(c.lastManualRun.ranAt)} ·{" "}
                    {c.lastManualRun.error
                      ? <span className="text-destructive">error: {c.lastManualRun.error}</span>
                      : `${c.lastManualRun.messagesScanned} correo${c.lastManualRun.messagesScanned !== 1 ? "s" : ""} revisado${c.lastManualRun.messagesScanned !== 1 ? "s" : ""}, ${c.lastManualRun.leadsCreated} lead${c.lastManualRun.leadsCreated !== 1 ? "s" : ""} encontrado${c.lastManualRun.leadsCreated !== 1 ? "s" : ""}`}
                  </p>
                )}
                {c.recentRuns.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    className="flex items-center gap-1 text-primary hover:underline cursor-pointer"
                  >
                    {expandedId === c.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    Ver historial ({c.recentRuns.length})
                  </button>
                )}
                {expandedId === c.id && (
                  <div className="border rounded-md divide-y mt-1">
                    {c.recentRuns.map((run) => (
                      <div key={run.id} className="px-2 py-1.5 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {run.trigger === "cron" ? "Cron" : "Manual"}
                          </Badge>
                          {formatRunDate(run.ranAt)}
                        </span>
                        <span className={run.error ? "text-destructive" : ""}>
                          {run.error ?? `${run.messagesScanned} correos, ${run.leadsCreated} leads`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

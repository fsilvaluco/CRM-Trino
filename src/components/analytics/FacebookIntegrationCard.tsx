"use client";

import { useState } from "react";
import { ThumbsUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";

interface FacebookIntegration {
  connected: boolean;
  accountName?: string;
  lastSyncAt?: string;
}

interface FacebookIntegrationCardProps {
  integration: FacebookIntegration;
  onRefresh: () => void;
  projectId?: string;
}

/**
 * Facebook no tiene flujo de conexión propio: usa el mismo login de Meta
 * que Instagram (misma Página, mismo token). Si no está conectado, se
 * explica eso en vez de mostrar un botón de "Conectar" separado.
 */
export function FacebookIntegrationCard({ integration, onRefresh, projectId }: FacebookIntegrationCardProps) {
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleSync = async () => {
    if (!projectId) {
      toast.error("Selecciona un proyecto antes de sincronizar");
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch("/api/integrations/facebook/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (res.ok) {
        toast.success("Sincronización completada");
        onRefresh();
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Error al sincronizar");
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("¿Desconectar Facebook? Se eliminarán las métricas sincronizadas de este proyecto.")) {
      return;
    }
    setDisconnecting(true);
    try {
      const res = await fetch("/api/integrations/facebook/disconnect", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (res.ok) {
        toast.success("Facebook desconectado");
        onRefresh();
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Error al desconectar");
      }
    } finally {
      setDisconnecting(false);
    }
  };

  if (!integration.connected) {
    return (
      <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
        <ThumbsUp className="h-5 w-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium leading-none mb-1">Facebook no conectado</p>
          <p className="text-xs text-muted-foreground">
            Facebook usa el mismo login que Instagram — conecta o reconecta desde{" "}
            <Link href="/analytics/instagram" className="underline">
              Métricas → Instagram
            </Link>{" "}
            y la Página de Facebook queda conectada automáticamente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <ThumbsUp className="h-5 w-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium leading-none mb-1">{integration.accountName}</p>
          {integration.lastSyncAt && (
            <p className="text-xs text-muted-foreground">
              Último sync: {format(new Date(integration.lastSyncAt), "d MMM HH:mm", { locale: es })}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing || disconnecting}>
          {syncing && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Sincronizar ahora
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={handleDisconnect}
          disabled={syncing || disconnecting}
        >
          {disconnecting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Desconectar
        </Button>
      </div>
    </div>
  );
}

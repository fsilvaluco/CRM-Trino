"use client";

import { useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface MetaIntegration {
  connected: boolean;
  accountName?: string;
  lastSyncAt?: string;
  tokenExpiresAt?: string;
}

interface MetaIntegrationCardProps {
  integration: MetaIntegration;
  onRefresh: () => void;
}

export function MetaIntegrationCard({ integration, onRefresh }: MetaIntegrationCardProps) {
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/integrations/meta/sync", { method: "POST" });
      if (res.ok) {
        toast.success("Sincronización completada");
        onRefresh();
      } else {
        toast.error("Error al sincronizar");
      }
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Camera className="h-5 w-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium leading-none mb-1">Instagram</p>
          {integration.connected ? (
            <p className="text-xs text-muted-foreground">
              {integration.accountName}
              {integration.lastSyncAt && (
                <>
                  {" · "}
                  Último sync:{" "}
                  {format(new Date(integration.lastSyncAt), "d MMM HH:mm", { locale: es })}
                </>
              )}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Conecta tu cuenta para sincronizar seguidores automáticamente.
            </p>
          )}
        </div>
      </div>

      {integration.connected ? (
        <Button
          size="sm"
          variant="outline"
          onClick={handleSync}
          disabled={syncing}
        >
          {syncing && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Sincronizar ahora
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            window.location.href = "/api/integrations/meta/connect";
          }}
        >
          Conectar Instagram
        </Button>
      )}
    </div>
  );
}

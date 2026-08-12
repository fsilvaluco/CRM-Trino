"use client";

import { Button } from "@/components/ui/button";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { usePushNotifications } from "@/lib/use-push-notifications";

export function NotificationToggle() {
  const { status, busy, enable, disable } = usePushNotifications();

  if (status === "unsupported") return null;

  const enabled = status === "on";

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border">
      <div className="flex items-center gap-3">
        {enabled ? (
          <Bell className="h-5 w-5 text-primary" />
        ) : (
          <BellOff className="h-5 w-5 text-muted-foreground" />
        )}
        <div>
          <p className="text-sm font-medium">Notificaciones de tareas asignadas</p>
          <p className="text-xs text-muted-foreground">
            {enabled
              ? "Te avisamos en este dispositivo cuando te asignen una tarea"
              : "Activa para recibir un aviso cuando te asignen una tarea"}
          </p>
        </div>
      </div>
      <Button
        variant={enabled ? "default" : "outline"}
        size="sm"
        onClick={() => (enabled ? disable() : enable())}
        disabled={status === "loading" || busy}
        className="cursor-pointer"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : enabled ? "Desactivar" : "Activar"}
      </Button>
    </div>
  );
}

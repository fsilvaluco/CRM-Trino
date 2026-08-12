"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Convierte la VAPID public key (base64url) al Uint8Array que pide
// PushManager.subscribe(). No hay helper nativo para esto -- es el snippet
// estandar que aparece en la doc de Web Push.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

type Status = "unsupported" | "loading" | "off" | "on";

export function NotificationToggle() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function checkStatus() {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("unsupported");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        setStatus(sub ? "on" : "off");
      } catch {
        setStatus("off");
      }
    }
    checkStatus();
  }, []);

  async function enable() {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      toast.error("Notificaciones push no configuradas todavia");
      return;
    }

    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Permiso de notificaciones denegado");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("No se pudo guardar la suscripcion");

      setStatus("on");
      toast.success("Notificaciones activadas");
    } catch (err) {
      console.error("[push] error al activar:", err);
      toast.error("No se pudieron activar las notificaciones");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("off");
      toast.success("Notificaciones desactivadas");
    } catch (err) {
      console.error("[push] error al desactivar:", err);
      toast.error("No se pudieron desactivar las notificaciones");
    } finally {
      setBusy(false);
    }
  }

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
        onClick={enabled ? disable : enable}
        disabled={status === "loading" || busy}
        className="cursor-pointer"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : enabled ? "Desactivar" : "Activar"}
      </Button>
    </div>
  );
}

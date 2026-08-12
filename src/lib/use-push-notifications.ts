"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

// Leida a nivel de modulo (no adentro de una funcion) -- necesario para que
// Next.js/Turbopack la sustituya en build-time por el valor real. Ver
// BITACORA.md (12 ago 2026) para la causa raiz completa de por que esto
// importa: si se lee dentro de una funcion async, en algunos builds queda
// sin resolver.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// Convierte la VAPID public key (base64url) al Uint8Array que pide
// PushManager.subscribe(). No hay helper nativo para esto -- es el snippet
// estandar que aparece en la doc de Web Push.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export type PushStatus = "unsupported" | "loading" | "off" | "on";

// Hook compartido por: el toggle de Configuración > Proyecto, el item
// "Activar Notificaciones" del menú de perfil, y el auto-prompt al entrar a
// la app -- los 3 necesitan exactamente la misma lógica de
// suscribir/desuscribir, solo cambia desde dónde se dispara.
export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const enable = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;

    if (!VAPID_PUBLIC_KEY) {
      if (!silent) toast.error("Notificaciones push no configuradas todavia");
      return;
    }

    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        // En modo silencioso (auto-prompt al entrar) no molestar con un
        // toast si la persona lo rechazo -- ya sabe que dijo que no. El
        // boton del menu de perfil sigue disponible para reintentar.
        if (!silent) toast.error("Permiso de notificaciones denegado");
        setStatus("off");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("No se pudo guardar la suscripcion");

      setStatus("on");
      if (!silent) toast.success("Notificaciones activadas");
    } catch (err) {
      console.error("[push] error al activar:", err);
      if (!silent) toast.error("No se pudieron activar las notificaciones");
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
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
  }, []);

  return { status, busy, enable, disable };
}

"use client";

import { useEffect, useRef } from "react";
import { usePushNotifications } from "@/lib/use-push-notifications";

// Pide el permiso de notificaciones apenas se entra a la app logueado, sin
// esperar a que la persona busque un boton. Solo dispara si el navegador
// nunca preguntó antes (Notification.permission === "default") -- si ya
// dijo que si o que no, no vuelve a molestar acá (para "que no" ni
// siquiera se puede: el navegador no re-muestra el dialogo nativo una vez
// denegado). El botón "Activar Notificaciones" en el menú de perfil sigue
// disponible para quien lo cerró sin decidir o cambió de opinión.
//
// Vive en AppShell (persiste entre navegaciones del router, no se
// remonta) así que el useEffect con deps vacías corre una sola vez por
// sesión de pestaña, no en cada cambio de página.
export function AutoRequestPushPermission() {
  const { status, enable } = usePushNotifications();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    if (status !== "off") return; // "loading"/"on"/"unsupported": nada que hacer
    if (typeof Notification === "undefined" || Notification.permission !== "default") return;

    attempted.current = true;
    void enable({ silent: true });
  }, [status, enable]);

  return null;
}

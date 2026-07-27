"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";

interface NotificationsContextValue {
  unseenCounts: Record<string, number>;
  markSeen: (moduleKey: string) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const POLL_INTERVAL_MS = 30_000;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [unseenCounts, setUnseenCounts] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    if (!user) {
      setUnseenCounts({});
      return;
    }
    try {
      const res = await fetch("/api/notifications/unseen-counts");
      if (!res.ok) return;
      const data = await res.json();
      setUnseenCounts(data ?? {});
    } catch {
      // silencioso -- un fallo de polling no debe interrumpir la app
    }
  }, [user]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  // Marca un modulo como visto: limpia el punto rojo localmente al instante
  // (no esperar el proximo poll) y avisa al backend en paralelo.
  const markSeen = useCallback((moduleKey: string) => {
    setUnseenCounts((prev) => ({ ...prev, [moduleKey]: 0 }));
    fetch("/api/notifications/mark-seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: moduleKey }),
    }).catch(() => {
      // si falla, el proximo poll (30s) vuelve a mostrar el punto -- aceptable
    });
  }, []);

  return (
    <NotificationsContext.Provider value={{ unseenCounts, markSeen }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications debe usarse dentro de NotificationsProvider");
  return ctx;
}

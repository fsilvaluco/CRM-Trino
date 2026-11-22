"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SalesPoint, TourDetail } from "@/types/tours";

const REFRESH_MS = 60_000;

// Carga la gira y su serie de ventas, y las vuelve a pedir cada 60 s y al
// volver a la pestaña del navegador. No desmonta nada: solo reemplaza los
// datos, así la pestaña activa y lo que el usuario tenga abierto se mantienen.
// Si un refresco falla, se conservan los últimos datos buenos.
export function useTourLive(id: string, projectId: string | undefined) {
  const [data, setData] = useState<TourDetail | null>(null);
  const [points, setPoints] = useState<SalesPoint[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hasData = useRef(false);
  const inflight = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";

    fetch(`/api/giras/${id}${qs}`, { signal: ctrl.signal, cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "No se pudo cargar la gira");
        hasData.current = true;
        setData(d as TourDetail);
        setLoadError(null);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError" && !hasData.current) setLoadError(e.message);
      });

    fetch(`/api/giras/${id}/ventas`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d)) setPoints(d as SalesPoint[]);
      })
      .catch(() => {});
  }, [id, projectId]);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      inflight.current?.abort();
    };
  }, [load]);

  return { data, points, loadError, reload: load };
}

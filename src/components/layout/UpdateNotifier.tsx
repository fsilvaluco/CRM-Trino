"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function UpdateNotifier() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const initialBuildId = useRef<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;

    async function checkVersion() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { buildId?: string };
        const buildId = data.buildId ?? null;

        if (!buildId || buildId === "dev") return;

        if (!initialBuildId.current) {
          initialBuildId.current = buildId;
          return;
        }

        if (buildId !== initialBuildId.current) {
          setUpdateAvailable(true);
          clearInterval(timer);
        }
      } catch {
        // Ignore network errors silently — don't bother the user
      }
    }

    checkVersion();
    timer = setInterval(checkVersion, POLL_INTERVAL);

    return () => clearInterval(timer);
  }, []);

  if (!updateAvailable || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-background px-5 py-3 shadow-xl"
    >
      <RefreshCw className="size-4 shrink-0 text-primary" />
      <p className="text-sm">
        <span className="font-semibold">Nueva versión disponible.</span>{" "}
        <span className="text-muted-foreground">
          Actualiza cuando puedas para ver los últimos cambios.
        </span>
      </p>
      <Button
        size="sm"
        className="ml-1 cursor-pointer shrink-0"
        onClick={() => window.location.reload()}
      >
        Actualizar ahora
      </Button>
      <button
        type="button"
        aria-label="Cerrar aviso"
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setDismissed(true)}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

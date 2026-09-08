"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { Loader2 } from "lucide-react";
import { useProject } from "@/lib/project-context";
import { MANUAL_PLATFORM_METRIC_KEYS } from "@/lib/dossier-data-sources";

interface ManualStatsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: "tiktok" | "youtube";
  onSaved: () => void;
}

const PLATFORM_LABEL: Record<"tiktok" | "youtube", string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Carga manual de estadísticas de TikTok/YouTube -- sin integración en
// vivo todavía (ver migración 091), así que estos números se teclean a
// mano cada cierto tiempo, igual que ya se hace con Spotify. Alimenta el
// catálogo de datos que se pueden posicionar en un Dossier.
export function ManualStatsDialog({ open, onOpenChange, platform, onSaved }: ManualStatsDialogProps) {
  const { activeProject } = useProject();
  const [periodEnd, setPeriodEnd] = useState(todayIso());
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const fields = MANUAL_PLATFORM_METRIC_KEYS[platform];

  const handleSubmit = async () => {
    if (!activeProject?.id) {
      toast.error("Selecciona un proyecto antes de registrar");
      return;
    }
    const metrics: Record<string, number> = {};
    for (const f of fields) {
      const raw = values[f.key];
      if (raw != null && raw.trim() !== "") {
        const n = Number(raw);
        if (Number.isFinite(n)) metrics[f.key] = n;
      }
    }
    if (Object.keys(metrics).length === 0) {
      toast.error("Ingresa al menos un valor");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/analytics/manual-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: activeProject.id,
          platform,
          periodStart: periodEnd,
          periodEnd,
          metrics,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Estadísticas de ${PLATFORM_LABEL[platform]} guardadas`);
      setValues({});
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error("No se pudo guardar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Registrar estadísticas de {PLATFORM_LABEL[platform]}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-4">
          <div className="space-y-1.5">
            <Label htmlFor="periodEnd">Fecha</Label>
            <Input id="periodEnd" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={f.key}>{f.label}</Label>
              <Input
                id={f.key}
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <SheetFooter>
          <Button onClick={handleSubmit} disabled={submitting} className="cursor-pointer">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Route, Plus, AlertTriangle, Handshake, Ticket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { useProject } from "@/lib/project-context";
import { shortDate } from "@/components/tours/labels";
import type { TourListItem } from "@/types/tours";

// Lista de giras del proyecto activo. Cada gira junta fechas, venta vs meta,
// auspicios/canjes, presupuesto y alertas (ver /giras/[id]).
export default function GirasPage() {
  const { activeProject } = useProject();
  const projectId = activeProject?.id ?? null;
  const [tours, setTours] = useState<TourListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", startDate: "", endDate: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    fetch(`/api/giras${qs}`)
      .then((r) => r.json())
      .then((d) => setTours(Array.isArray(d) ? d : []))
      .catch(() => setTours([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(load, [load]);

  async function create() {
    if (!projectId || !form.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/giras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ...form }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "No se pudo crear la gira");
      window.location.href = `/giras/${d.id}`;
    } catch (e) {
      toast.error((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Giras</h1>
          <p className="text-sm text-muted-foreground">Fechas, venta, auspicios y presupuesto de cada gira en un solo lugar.</p>
        </div>
        {projectId && (
          <Button onClick={() => setCreating(true)} className="cursor-pointer">
            <Plus className="h-4 w-4" /> Nueva gira
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : tours.length === 0 ? (
        <EmptyState
          icon={Route}
          title="Sin giras"
          description={projectId ? "Este proyecto todavía no tiene giras." : "Selecciona un proyecto para ver sus giras."}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {tours.map((t) => {
            const pct = t.capacity > 0 ? Math.round((t.sold * 100) / t.capacity) : 0;
            return (
              <Link key={t.id} href={`/giras/${t.id}`}>
                <Card className="hover:border-primary/50 transition-colors">
                  <CardContent className="space-y-3 py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{t.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {shortDate(t.startDate)} – {shortDate(t.endDate)} · {t.datesCount} fechas
                        </p>
                      </div>
                      {t.alertsTotal > 0 && (
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${t.alertsHigh > 0 ? "text-red-600" : "text-amber-600"}`}>
                          <AlertTriangle className="h-3.5 w-3.5" /> {t.alertsTotal}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Ticket className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {t.sold} / {t.target} meta <span className="text-muted-foreground">({pct}% aforo)</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Handshake className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {t.sponsorshipsConfirmed} confirmados · {t.sponsorshipsOpen} abiertos
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <Dialog open={creating} onOpenChange={(v) => !v && setCreating(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva gira</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tour-name">Nombre</Label>
              <Input id="tour-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="tour-start">Inicio</Label>
                <Input id="tour-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tour-end">Fin</Label>
                <Input id="tour-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Después agrega sus fechas (eventos del proyecto) desde la pestaña Fechas.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreating(false)} className="cursor-pointer">Cancelar</Button>
              <Button onClick={create} disabled={saving || !form.name.trim()} className="cursor-pointer">Crear</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

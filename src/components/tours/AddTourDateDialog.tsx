"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { shortDate } from "@/components/tours/labels";
import type { TourLeg } from "@/types/tours";

interface Candidate {
  id: string;
  date: string;
  city: string | null;
  venue: string;
  name: string | null;
}

// Suma a la gira un evento que ya existe en el proyecto. Para una fecha
// nueva, primero se crea el evento en Eventos.
export function AddTourDateDialog({
  tourId,
  legs,
  onClose,
  onAdded,
}: {
  tourId: string;
  legs: TourLeg[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [showId, setShowId] = useState("");
  const [legId, setLegId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/giras/${tourId}/fechas`)
      .then((r) => r.json())
      .then((d) => setCandidates(Array.isArray(d) ? d : []))
      .catch(() => setCandidates([]));
  }, [tourId]);

  const label = (c: Candidate) => `${shortDate(c.date)} · ${c.city ?? ""} · ${c.venue}`;

  async function add() {
    setSaving(true);
    try {
      const res = await fetch(`/api/giras/${tourId}/fechas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showId, tourLegId: legId || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "No se pudo agregar");
      onAdded();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const selected = candidates?.find((c) => c.id === showId);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar fecha a la gira</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {candidates === null ? (
            <p className="text-sm text-muted-foreground">Buscando eventos…</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay eventos del proyecto sin gira. Crea primero el evento en Eventos.</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Evento</Label>
                <Select value={showId} onValueChange={(v) => setShowId(v ?? "")}>
                  <SelectTrigger className="w-full cursor-pointer">
                    <SelectValue>{selected ? label(selected) : "Elige un evento"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{label(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {legs.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Tramo</Label>
                  <Select value={legId} onValueChange={(v) => setLegId(v ?? "")}>
                    <SelectTrigger className="w-full cursor-pointer">
                      <SelectValue>{legs.find((l) => l.id === legId)?.name ?? "Sin tramo"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {legs.map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} className="cursor-pointer">Cancelar</Button>
            <Button onClick={add} disabled={!showId || saving} className="cursor-pointer">Agregar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

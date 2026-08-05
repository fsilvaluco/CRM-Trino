"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export function EventSetupDialog({
  open,
  onClose,
  dealId,
  dealTitle,
  projectId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  dealId: string;
  dealTitle: string;
  /** El proyecto (sello o artista) al que queda anclado el evento -- el mismo que tenía el deal. */
  projectId: string;
  onSaved?: () => void;
}) {
  const [name, setName] = useState(dealTitle);
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setName(dealTitle);
    setDate("");
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Ponle un nombre al evento");
      return;
    }
    if (!date) {
      toast.error("Ponle al menos la fecha del evento");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/eventos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          dealId,
          name: name.trim(),
          date,
          status: "confirmado",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al crear el evento");
      }
      toast.success("Evento armado -- venue, riders, setlist y costos se completan desde Eventos");
      reset();
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear el evento. Puedes armarlo a mano después desde Eventos.");
    } finally {
      setSaving(false);
    }
  }

  function handleSkip() {
    reset();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleSkip()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>🎤 ¿Armamos el evento?</DialogTitle>
          <DialogDescription>
            &ldquo;{dealTitle}&rdquo; está marcado como evento. El venue, riders, setlist y costos se
            completan después desde Eventos -- aquí solo el nombre y la fecha.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="show-name">Nombre del evento</Label>
            <Input id="show-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div className="space-y-2">
            <Label htmlFor="show-date">Fecha</Label>
            <Input id="show-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleSkip} className="cursor-pointer">
              Omitir
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving} className="cursor-pointer">
              {saving ? "Creando..." : "Armar evento"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

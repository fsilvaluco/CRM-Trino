"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export function ShowSetupDialog({
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
  /** El proyecto (sello o artista) al que queda anclado el show -- el mismo que tenía el deal. */
  projectId: string;
  onSaved?: () => void;
}) {
  const [date, setDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [venue, setVenue] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setDate("");
    setEventTime("");
    setVenue("");
    setAddress("");
    setNotes("");
  }

  async function handleSave() {
    if (!date) {
      toast.error("Ponle al menos la fecha del show");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          dealId,
          date,
          eventTime: eventTime || null,
          venue: venue || dealTitle,
          address: address || null,
          notes: notes || null,
          status: "confirmado",
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Show armado -- lo puedes seguir completando en Shows en vivo");
      reset();
      onSaved?.();
      onClose();
    } catch {
      toast.error("No se pudo crear el show. Puedes armarlo a mano después desde Shows en vivo.");
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
          <DialogTitle>🎤 ¿Armamos el show?</DialogTitle>
          <DialogDescription>
            &ldquo;{dealTitle}&rdquo; está marcado como show. Completa lo que ya sepas -- el resto lo
            rellenas después desde Shows en vivo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="show-date">Fecha</Label>
              <Input id="show-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="show-time">Hora</Label>
              <Input id="show-time" type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="show-venue">Venue</Label>
            <Input
              id="show-venue"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder={dealTitle}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="show-address">Dirección</Label>
            <Input id="show-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="show-notes">Notas</Label>
            <Textarea id="show-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleSkip} className="cursor-pointer">
              Omitir
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving} className="cursor-pointer">
              {saving ? "Creando..." : "Armar show"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

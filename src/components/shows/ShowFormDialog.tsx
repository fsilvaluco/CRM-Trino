"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { LiveShow, ShowStatus } from "@/types/shows";

const STATUS_OPTIONS: Array<{ value: ShowStatus; label: string }> = [
  { value: "cotizando", label: "Cotizando" },
  { value: "confirmado", label: "Confirmado" },
  { value: "realizado", label: "Realizado" },
  { value: "cancelado", label: "Cancelado" },
];

export function ShowFormDialog({
  open,
  onClose,
  projects,
  defaultProjectId,
  editingShow,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  projects: Array<{ id: string; name: string }>;
  defaultProjectId?: string | null;
  editingShow: LiveShow | null;
  onSaved: () => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [date, setDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [venue, setVenue] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<ShowStatus>("cotizando");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingShow) {
      setProjectId(editingShow.projectId ?? "");
      setDate(editingShow.date);
      setEventTime(editingShow.eventTime ?? "");
      setVenue(editingShow.venue);
      setAddress(editingShow.address ?? "");
      setNotes(editingShow.notes ?? "");
      setStatus(editingShow.status);
    } else {
      setProjectId(defaultProjectId ?? "");
      setDate("");
      setEventTime("");
      setVenue("");
      setAddress("");
      setNotes("");
      setStatus("cotizando");
    }
  }, [open, editingShow, defaultProjectId]);

  async function handleSave() {
    if (!projectId) {
      toast.error("Selecciona a qué proyecto/artista pertenece");
      return;
    }
    if (!date) {
      toast.error("La fecha es requerida");
      return;
    }
    if (!venue.trim()) {
      toast.error("El venue es requerido");
      return;
    }

    setSaving(true);
    try {
      const url = editingShow ? `/api/shows/${editingShow.id}` : "/api/shows";
      const method = editingShow ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          date,
          eventTime: eventTime || null,
          venue: venue.trim(),
          address: address || null,
          notes: notes || null,
          status,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al guardar el show");
      }
      toast.success(editingShow ? "Show actualizado" : "Show creado");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar el show");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{editingShow ? "Editar show" : "Nuevo show"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Proyecto / artista</Label>
            <Select value={projectId} onValueChange={(v) => setProjectId(v ?? "")}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue placeholder="Selecciona uno" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="show-date">Fecha</Label>
              <Input id="show-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="show-time">Hora</Label>
              <Input id="show-time" type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="show-venue">Venue</Label>
            <Input id="show-venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="show-address">Dirección</Label>
            <Input id="show-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Estado</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ShowStatus)}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="show-notes">Notas</Label>
            <Textarea id="show-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="cursor-pointer">
              Cancelar
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving} className="cursor-pointer">
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

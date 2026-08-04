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

// Igual que en Tratos: los montos se guardan en centavos (fee=$500.000 se
// guarda como 50000000) -- convención de toda la app, no es que el peso
// chileno tenga centavos reales.
function pesosToCents(v: string): number | null {
  const trimmed = v.trim();
  if (!trimmed) return null;
  const n = parseInt(trimmed.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n * 100 : null;
}

function centsToPesos(v: number | null | undefined): string {
  if (v == null) return "";
  return String(Math.round(v / 100));
}

export function EventFormDialog({
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
  const [fee, setFee] = useState("");
  const [ticketIncome, setTicketIncome] = useState("");
  const [expenses, setExpenses] = useState("");
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
      setFee(centsToPesos(editingShow.fee));
      setTicketIncome(centsToPesos(editingShow.ticketIncome));
      setExpenses(centsToPesos(editingShow.expenses));
    } else {
      setProjectId(defaultProjectId ?? "");
      setDate("");
      setEventTime("");
      setVenue("");
      setAddress("");
      setNotes("");
      setStatus("cotizando");
      setFee("");
      setTicketIncome("");
      setExpenses("");
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
      const url = editingShow ? `/api/eventos/${editingShow.id}` : "/api/eventos";
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
          fee: pesosToCents(fee),
          ticketIncome: pesosToCents(ticketIncome),
          expenses: pesosToCents(expenses),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al guardar el evento");
      }
      toast.success(editingShow ? "Evento actualizado" : "Evento creado");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar el evento");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{editingShow ? "Editar evento" : "Nuevo evento"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
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
            {status !== "realizado" && (fee || ticketIncome || expenses) && (
              <p className="text-xs text-muted-foreground">
                Los montos no se cuentan en el dashboard de Métricas hasta que el estado sea &ldquo;Realizado&rdquo;.
              </p>
            )}
          </div>

          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Plata</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="show-fee" className="text-xs">Fee</Label>
                <Input id="show-fee" inputMode="numeric" placeholder="$0" value={fee} onChange={(e) => setFee(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="show-tickets" className="text-xs">Entradas</Label>
                <Input id="show-tickets" inputMode="numeric" placeholder="$0" value={ticketIncome} onChange={(e) => setTicketIncome(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="show-expenses" className="text-xs">Gastos</Label>
                <Input id="show-expenses" inputMode="numeric" placeholder="$0" value={expenses} onChange={(e) => setExpenses(e.target.value)} />
              </div>
            </div>
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

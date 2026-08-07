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
import { MapPin, Link as LinkIcon, ExternalLink } from "lucide-react";
import { VenueCombobox } from "@/components/venues/VenueCombobox";
import { MoneyInput } from "@/components/shared/MoneyInput";
import type { LiveShow, ShowStatus } from "@/types/shows";
import type { Venue } from "@/types/venues";

const STATUS_LABELS: Record<ShowStatus, string> = {
  cotizando: "Cotizando",
  confirmado: "Confirmado",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

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
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [notes, setNotes] = useState("");
  const [eventLink, setEventLink] = useState("");
  const [status, setStatus] = useState<ShowStatus>("cotizando");
  const [fee, setFee] = useState("");
  const [ticketIncome, setTicketIncome] = useState("");
  const [expenses, setExpenses] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingVenue, setLoadingVenue] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingShow) {
      setProjectId(editingShow.projectId ?? "");
      setName(editingShow.name ?? "");
      setDate(editingShow.date);
      setEventTime(editingShow.eventTime ?? "");
      setNotes(editingShow.notes ?? "");
      setEventLink(editingShow.eventLink ?? "");
      setStatus(editingShow.status);
      setFee(centsToPesos(editingShow.fee));
      setTicketIncome(centsToPesos(editingShow.ticketIncome));
      setExpenses(centsToPesos(editingShow.expenses));

      if (editingShow.venueId) {
        setLoadingVenue(true);
        fetch(`/api/venues/${editingShow.venueId}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((v) => setSelectedVenue(v))
          .catch(() => setSelectedVenue(null))
          .finally(() => setLoadingVenue(false));
      } else {
        // Evento viejo sin venue_id -- solo tiene el nombre en texto libre.
        // Se representa como un Venue "fantasma" (id vacío) para poder
        // mostrarlo en el combobox sin forzar a crear un venue real todavía.
        setSelectedVenue(
          editingShow.venue
            ? ({
                id: "",
                name: editingShow.venue,
                address: editingShow.address ?? "",
                comuna: null,
                region: null,
                country: null,
                latitude: null,
                longitude: null,
                capacityStanding: null,
                capacitySeated: null,
                mood: null,
                description: null,
                parkingAvailable: null,
                backlineAvailable: null,
                website: null,
                instagram: null,
                contactId: null,
                companyId: null,
                contactName: null,
                companyName: null,
                createdAt: "",
                updatedAt: "",
              } satisfies Venue)
            : null
        );
      }
    } else {
      setProjectId(defaultProjectId ?? "");
      setName("");
      setDate("");
      setEventTime("");
      setSelectedVenue(null);
      setNotes("");
      setEventLink("");
      setStatus("cotizando");
      setFee("");
      setTicketIncome("");
      setExpenses("");
    }
  }, [open, editingShow, defaultProjectId]);

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Ponle un nombre al evento");
      return;
    }
    if (!projectId) {
      toast.error("Selecciona a qué proyecto/artista pertenece");
      return;
    }
    if (!date) {
      toast.error("La fecha es requerida");
      return;
    }
    if (!selectedVenue) {
      toast.error("Selecciona o crea un venue");
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
          name: name.trim(),
          date,
          eventTime: eventTime || null,
          // Si el venue tiene id real, mandamos venueId (fuente de verdad).
          // Si es el caso legacy de texto libre (id vacío), mandamos el
          // nombre directo para no perderlo.
          venueId: selectedVenue.id || null,
          venue: selectedVenue.id ? undefined : selectedVenue.name,
          address: selectedVenue.id ? undefined : selectedVenue.address || null,
          notes: notes || null,
          eventLink: eventLink || null,
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
            <Label htmlFor="event-name">Nombre del evento *</Label>
            <Input
              id="event-name"
              placeholder="PAMN, Lanzamiento disco, Toca en vivo..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              El nombre del evento, no del venue -- un mismo venue puede alojar eventos muy distintos.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Proyecto / artista</Label>
            <Select value={projectId} onValueChange={(v) => setProjectId(v ?? "")}>
              <SelectTrigger className="cursor-pointer w-full">
                <SelectValue placeholder="Selecciona uno">
                  {projects.find((p) => p.id === projectId)?.name}
                </SelectValue>
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
            <Label>Venue</Label>
            {loadingVenue ? (
              <div className="h-9 rounded-md border bg-muted/40 animate-pulse" />
            ) : (
              <VenueCombobox
                value={selectedVenue?.id || null}
                selectedVenue={selectedVenue}
                onSelect={setSelectedVenue}
              />
            )}
            {selectedVenue?.address && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                {selectedVenue.address}
                {selectedVenue.comuna ? `, ${selectedVenue.comuna}` : ""}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Estado</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ShowStatus)}>
              <SelectTrigger className="cursor-pointer w-full">
                <SelectValue>{STATUS_LABELS[status]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
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
                <MoneyInput id="show-fee" value={fee} onChange={setFee} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="show-tickets" className="text-xs">Entradas</Label>
                <MoneyInput id="show-tickets" value={ticketIncome} onChange={setTicketIncome} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="show-expenses" className="text-xs">Egresos</Label>
                <MoneyInput id="show-expenses" value={expenses} onChange={setExpenses} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="show-event-link" className="flex items-center gap-1">
              <LinkIcon className="h-3.5 w-3.5" />
              Link del evento
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="show-event-link"
                placeholder="https://..."
                value={eventLink}
                onChange={(e) => setEventLink(e.target.value)}
              />
              {eventLink && (
                <a href={eventLink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground shrink-0">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
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

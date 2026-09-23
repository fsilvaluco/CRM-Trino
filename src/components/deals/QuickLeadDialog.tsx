"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// "Lead rapido": carga en ~20 segundos un lead que entro por WhatsApp o DM.
// Solo nombre y WhatsApp son obligatorios; el resto se completa despues en el trato.

const CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "referido", label: "Referido" },
  { value: "evento", label: "En un evento" },
  { value: "otro", label: "Otro" },
] as const;

type Channel = (typeof CHANNELS)[number]["value"];

const EMPTY = { name: "", phone: "", event_date: "", venue: "", comuna: "", guests: "", message: "" };

export function QuickLeadDialog({
  open,
  onClose,
  projectId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onSaved?: () => void;
}) {
  const [fields, setFields] = useState(EMPTY);
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields((f) => ({ ...f, [key]: e.target.value }));

  function close() {
    setFields(EMPTY);
    setChannel("whatsapp");
    onClose();
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (fields.name.trim().length < 2 || fields.phone.replace(/\D/g, "").length < 8) {
      toast.error("Nombre y WhatsApp son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/leads/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, projectId, channel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo crear el lead");
      toast.success(
        data.status === "existing_deal"
          ? "Ese contacto ya tenía un deal abierto: se agregó una nota"
          : "Lead creado en la primera etapa"
      );
      onSaved?.();
      close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear el lead");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lead rápido</DialogTitle>
          <DialogDescription>Crea el contacto y el deal en la primera etapa del pipeline.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label>¿Por dónde llegó?</Label>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setChannel(c.value)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs cursor-pointer transition-colors",
                    channel === c.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label htmlFor="ql-name">Nombre (o pareja) *</Label>
              <Input id="ql-name" value={fields.name} onChange={set("name")} autoFocus />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ql-phone">WhatsApp *</Label>
              <Input id="ql-phone" value={fields.phone} onChange={set("phone")} placeholder="+56 9 1234 5678" inputMode="tel" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ql-date">Fecha del evento</Label>
              <Input id="ql-date" type="date" value={fields.event_date} onChange={set("event_date")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ql-venue">Lugar</Label>
              <Input id="ql-venue" value={fields.venue} onChange={set("venue")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ql-comuna">Comuna</Label>
              <Input id="ql-comuna" value={fields.comuna} onChange={set("comuna")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ql-guests">Invitados</Label>
              <Input id="ql-guests" value={fields.guests} onChange={set("guests")} inputMode="numeric" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label htmlFor="ql-msg">Nota</Label>
              <Textarea id="ql-msg" rows={2} value={fields.message} onChange={set("message")} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close} className="cursor-pointer">
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="cursor-pointer">
              {saving ? "Guardando..." : "Crear lead"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface QrCodeItem {
  id: string;
  projectId: string;
  slug: string;
  label: string;
  destinationUrl: string;
  createdAt: string;
  updatedAt: string;
  scanCount: number;
  lastScannedAt: string | null;
}

export function QrFormDialog({
  open,
  onClose,
  onSaved,
  projectId,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  projectId: string | null;
  editing: QrCodeItem | null;
}) {
  const [label, setLabel] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel(editing?.label ?? "");
      setDestinationUrl(editing?.destinationUrl ?? "");
    }
  }, [open, editing]);

  async function handleSubmit() {
    if (!label.trim()) {
      toast.error("Ponle un nombre (ej. \"Flyer show Valparaíso\")");
      return;
    }
    if (!destinationUrl.trim()) {
      toast.error("Falta el link de destino");
      return;
    }
    if (!editing && !projectId) {
      toast.error("Selecciona un proyecto activo primero");
      return;
    }

    setSaving(true);
    try {
      const res = editing
        ? await fetch(`/api/qr/${editing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label: label.trim(), destinationUrl: destinationUrl.trim() }),
          })
        : await fetch("/api/qr", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label: label.trim(), destinationUrl: destinationUrl.trim(), projectId }),
          });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo guardar");

      toast.success(editing ? "QR actualizado" : "QR creado");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar QR" : "Nuevo QR"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="qr-label">Nombre</Label>
            <Input
              id="qr-label"
              placeholder="ej. Flyer show Valparaíso, Bio Instagram..."
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Solo para identificarlo en esta lista -- no aparece en el QR ni al escanearlo.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="qr-url">Link de destino</Label>
            <Input
              id="qr-url"
              placeholder="https://..."
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
            />
            {editing && (
              <p className="text-xs text-muted-foreground">
                El QR ya impreso sigue funcionando igual -- solo cambia a dónde redirige.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="cursor-pointer">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="cursor-pointer">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {editing ? "Guardar" : "Crear QR"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

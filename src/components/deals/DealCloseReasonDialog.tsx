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
import { cn } from "@/lib/utils";

const LOST_REASONS = ["Valor muy alto", "Más adelante", "Otro"];
const WON_FEELINGS = [
  "Muy satisfecho",
  "Le pareció bien",
  "Aceptó a regañadientes",
  "Precio bajo para el valor",
  "Otro",
];

export function DealCloseReasonDialog({
  open,
  onClose,
  dealId,
  dealTitle,
  currentValue,
  outcome,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  dealId: string;
  dealTitle: string;
  currentValue: number | null;
  outcome: "won" | "lost";
  onSaved?: () => void;
}) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [freeText, setFreeText] = useState("");
  const [realValue, setRealValue] = useState(currentValue != null ? String(currentValue) : "");
  const [saving, setSaving] = useState(false);

  const options = outcome === "won" ? WON_FEELINGS : LOST_REASONS;

  function reset() {
    setSelectedReason(null);
    setFreeText("");
    setRealValue(currentValue != null ? String(currentValue) : "");
  }

  async function handleSave() {
    if (!selectedReason) {
      toast.error("Selecciona una opción");
      return;
    }
    if (selectedReason === "Otro" && !freeText.trim()) {
      toast.error("Escribe el detalle");
      return;
    }

    setSaving(true);
    try {
      const reasonText = selectedReason === "Otro" ? freeText.trim() : selectedReason;
      const commentContent =
        outcome === "won"
          ? `🎉 Cerrado ganado. Sensación del cliente: ${reasonText}.`
          : `❌ Cerrado perdido. Motivo: ${reasonText}.`;

      const commentRes = await fetch(`/api/deals/${dealId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentContent }),
      });
      if (!commentRes.ok) throw new Error();

      if (outcome === "won" && realValue && Number(realValue) !== currentValue) {
        await fetch(`/api/deals/${dealId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: Math.round(Number(realValue) * 100) }),
        });
      }

      toast.success("Cierre registrado");
      reset();
      onSaved?.();
      onClose();
    } catch {
      toast.error("No se pudo guardar el motivo de cierre");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {outcome === "won" ? "¡Trato ganado! 🎉" : "Trato perdido"}
          </DialogTitle>
          <DialogDescription>
            &ldquo;{dealTitle}&rdquo; — {outcome === "won"
              ? "cuéntanos cómo quedó el cliente y el valor real de cierre."
              : "cuéntanos por qué se perdió, para tener el registro."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {outcome === "won" && (
            <div className="space-y-2">
              <Label>Valor real de cierre (CLP)</Label>
              <Input
                type="number"
                value={realValue}
                onChange={(e) => setRealValue(e.target.value)}
                placeholder="Monto final"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>{outcome === "won" ? "Sensación del cliente" : "¿Por qué se perdió?"}</Label>
            <div className="flex flex-wrap gap-2">
              {options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setSelectedReason(opt)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full border cursor-pointer transition-colors",
                    selectedReason === opt
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-muted"
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {selectedReason === "Otro" && (
            <Textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="Cuéntanos más..."
              className="text-sm min-h-[60px]"
              autoFocus
            />
          )}

          <Button onClick={handleSave} disabled={saving} className="w-full cursor-pointer">
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

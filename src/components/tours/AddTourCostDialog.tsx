"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BudgetLine } from "@/types/tours";

// Gasto real de la gira que no pertenece a una fecha (van, carro, bencina…).
export function AddTourCostDialog({ tourId, lines, onClose, onSaved }: { tourId: string; lines: BudgetLine[]; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [lineId, setLineId] = useState(lines[0]?.id ?? "");
  const [spentOn, setSpentOn] = useState(new Date().toISOString().slice(0, 10));
  const [responsable, setResponsable] = useState("");
  const [pagado, setPagado] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    const pesos = Number(amount.replace(/\D/g, ""));
    if (!label.trim() || !pesos) return toast.error("Falta descripción o monto");
    setSaving(true);
    try {
      const res = await fetch(`/api/giras/${tourId}/costos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, amount: pesos * 100, budgetLineId: lineId || null, spentOn, responsable, pagado }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "No se pudo guardar");
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar gasto de la gira</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Descripción</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Arriendo van tramo sur" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Monto ($)</Label>
              <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Partida</Label>
            <Select value={lineId} onValueChange={(v) => setLineId(v ?? "")}>
              <SelectTrigger className="w-full cursor-pointer">
                <SelectValue>{lines.find((l) => l.id === lineId)?.label ?? "Elige partida"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {lines.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Quién pagó</Label>
            <Input value={responsable} onChange={(e) => setResponsable(e.target.value)} />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={pagado} onCheckedChange={(v) => setPagado(Boolean(v))} /> Pagado
          </label>
          <p className="text-xs text-muted-foreground">Los gastos de cada fecha van en la Planilla del evento y se suman solos aquí.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} className="cursor-pointer">Cancelar</Button>
            <Button onClick={save} disabled={saving} className="cursor-pointer">Guardar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

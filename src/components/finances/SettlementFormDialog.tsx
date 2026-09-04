"use client";

// Alta de una "liquidación": pago recurrente entre partes que NO está
// atado a un evento puntual -- regalías (ej. Gamuza le paga 20% a Trino
// de lo que retiró de la distribuidora) o merchandising mensual (ej.
// Trino le paga a Gamuza el % de lo vendido ese mes). Ver
// scripts/migrations/087_settlements.sql para el porqué de este modelo
// genérico en vez de una tabla por tipo.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/shared/MoneyInput";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Paperclip, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

interface ProjectMemberOption {
  userId: string;
  name: string;
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

type SettlementType = "regalias" | "merch" | "otro";

// SelectValue (Base UI) muestra el `value` crudo del item seleccionado, no
// su texto -- hay que pasarle el label como children a mano (mismo caso ya
// resuelto en DealForm para su selector de "Fuente").
const TYPE_LABELS: Record<SettlementType, string> = {
  regalias: "Regalías",
  merch: "Merchandising mensual",
  otro: "Otro",
};

// Sin nombres de parte hardcodeados -- quién paga y quién recibe varía por
// proyecto (un artista puede depender de una agencia distinta a la de
// otro), así que el usuario los escribe cada vez. Solo el % queda vacío
// por defecto en todos los tipos, mismo motivo.
const TYPE_DEFAULTS: Record<SettlementType, { payer: string; payee: string; pct: string }> = {
  regalias: { payer: "", payee: "", pct: "" },
  merch: { payer: "", payee: "", pct: "" },
  otro: { payer: "", payee: "", pct: "" },
};

async function uploadProof(file: File, prefix: string): Promise<{ path: string; name: string } | null> {
  if (file.size > 25 * 1024 * 1024) {
    toast.error("El archivo no puede superar 25 MB");
    return null;
  }
  const ext = file.name.split(".").pop();
  const path = `${prefix}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("finances").upload(path, file, { upsert: false });
  if (error) {
    toast.error("Error subiendo el archivo: " + error.message);
    return null;
  }
  return { path, name: file.name };
}

export function SettlementFormDialog({
  open,
  onClose,
  onCreated,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  projectId: string | null;
}) {
  const [type, setType] = useState<SettlementType>("regalias");
  const [periodMonth, setPeriodMonth] = useState(String(new Date().getMonth() + 1));
  const [periodYear, setPeriodYear] = useState(String(new Date().getFullYear()));
  const [payerName, setPayerName] = useState(TYPE_DEFAULTS.regalias.payer);
  const [payeeName, setPayeeName] = useState(TYPE_DEFAULTS.regalias.payee);
  const [sourceAmount, setSourceAmount] = useState("");
  const [percentage, setPercentage] = useState(TYPE_DEFAULTS.regalias.pct);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutOverridden, setPayoutOverridden] = useState(false);
  const [notes, setNotes] = useState("");
  const [sourceProof, setSourceProof] = useState<{ path: string; name: string } | null>(null);
  const [payoutProof, setPayoutProof] = useState<{ path: string; name: string } | null>(null);
  const [uploadingSource, setUploadingSource] = useState(false);
  const [uploadingPayout, setUploadingPayout] = useState(false);
  const [saving, setSaving] = useState(false);
  const [projectMembers, setProjectMembers] = useState<ProjectMemberOption[]>([]);
  const [requiredSignerIds, setRequiredSignerIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    const d = TYPE_DEFAULTS[type];
    setPayerName(d.payer);
    setPayeeName(d.payee);
    setPercentage(d.pct);
  }, [type, open]);

  // Gente del proyecto para elegir quién tiene que firmar -- se recarga
  // cada vez que se abre el diálogo o cambia el proyecto activo.
  useEffect(() => {
    if (!open || !projectId) { setProjectMembers([]); return; }
    let cancelled = false;
    fetch(`/api/project-members?projectId=${projectId}`)
      .then((r) => r.json())
      .then((rows) => {
        if (cancelled || !Array.isArray(rows)) return;
        setProjectMembers(
          rows.map((r: { user_id: string; profiles: { full_name: string | null; email: string | null } | null }) => ({
            userId: r.user_id,
            name: r.profiles?.full_name ?? r.profiles?.email ?? "Alguien",
          }))
        );
      })
      .catch(() => { if (!cancelled) setProjectMembers([]); });
    return () => { cancelled = true; };
  }, [open, projectId]);

  // Monto a pagar = source * % / 100, salvo que el usuario ya lo haya
  // tocado a mano (ej. para ajustar redondeos de la transferencia real).
  useEffect(() => {
    if (payoutOverridden) return;
    const source = parseInt(sourceAmount || "0", 10);
    const pct = parseFloat(percentage || "0");
    if (!source || !pct) { setPayoutAmount(""); return; }
    setPayoutAmount(String(Math.round((source * pct) / 100)));
  }, [sourceAmount, percentage, payoutOverridden]);

  const reset = () => {
    setType("regalias");
    setSourceAmount("");
    setPayoutAmount("");
    setPayoutOverridden(false);
    setNotes("");
    setSourceProof(null);
    setPayoutProof(null);
    setRequiredSignerIds([]);
  };

  const toggleSigner = (userId: string, checked: boolean) => {
    setRequiredSignerIds((prev) => (checked ? [...prev, userId] : prev.filter((id) => id !== userId)));
  };

  const handleUploadSource = async (file: File) => {
    setUploadingSource(true);
    const uploaded = await uploadProof(file, "settlements/source");
    setUploadingSource(false);
    if (uploaded) setSourceProof(uploaded);
  };

  const handleUploadPayout = async (file: File) => {
    setUploadingPayout(true);
    const uploaded = await uploadProof(file, "settlements/payout");
    setUploadingPayout(false);
    if (uploaded) setPayoutProof(uploaded);
  };

  const handleSubmit = async () => {
    if (!projectId) return;
    if (!payerName.trim() || !payeeName.trim()) {
      toast.error("Falta quién paga y quién recibe");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          type,
          periodMonth: Number(periodMonth) || null,
          periodYear: Number(periodYear) || null,
          payerName,
          payeeName,
          sourceAmount: Number(sourceAmount) || 0,
          sourceProofPath: sourceProof?.path ?? null,
          sourceProofName: sourceProof?.name ?? null,
          percentage: Number(percentage) || 0,
          payoutAmount: Number(payoutAmount) || 0,
          payoutProofPath: payoutProof?.path ?? null,
          payoutProofName: payoutProof?.name ?? null,
          notes: notes || null,
          requiredSignerIds,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || "Error al crear la liquidación");
        return;
      }
      toast.success("Liquidación creada");
      reset();
      onCreated();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva liquidación</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => v && setType(v as SettlementType)}>
              <SelectTrigger className="cursor-pointer w-full">
                <SelectValue>{TYPE_LABELS[type]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="regalias">Regalías</SelectItem>
                <SelectItem value="merch">Merchandising mensual</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mes</Label>
              <Select value={periodMonth} onValueChange={(v) => v && setPeriodMonth(v)}>
                <SelectTrigger className="cursor-pointer w-full">
                  <SelectValue>{MONTHS[Number(periodMonth) - 1] ?? ""}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Año</Label>
              <Input inputMode="numeric" value={periodYear} onChange={(e) => setPeriodYear(e.target.value.replace(/\D/g, ""))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quién paga</Label>
              <Input value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder="Nombre de quién paga" />
            </div>
            <div className="space-y-1.5">
              <Label>Quién recibe</Label>
              <Input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder="Nombre de quién recibe" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Monto de origen (lo retirado / lo vendido)</Label>
            <MoneyInput value={sourceAmount} onChange={setSourceAmount} />
          </div>

          <div className="space-y-1.5">
            <Label>Comprobante del monto de origen</Label>
            <input
              type="file"
              id="settlement-source-file"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUploadSource(e.target.files[0])}
            />
            <Button
              type="button" variant="outline" className="w-full justify-start gap-2 cursor-pointer"
              disabled={uploadingSource}
              onClick={() => document.getElementById("settlement-source-file")?.click()}
            >
              {uploadingSource ? <Loader2 className="h-4 w-4 animate-spin" /> : sourceProof ? <Check className="h-4 w-4 text-green-600" /> : <Paperclip className="h-4 w-4" />}
              {sourceProof ? sourceProof.name : "Subir comprobante"}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="space-y-1.5">
              <Label>Porcentaje a pagar</Label>
              <div className="relative">
                <Input
                  inputMode="decimal"
                  value={percentage}
                  onChange={(e) => setPercentage(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="pr-7"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Monto a pagar</Label>
              <MoneyInput
                value={payoutAmount}
                onChange={(v) => { setPayoutOverridden(true); setPayoutAmount(v); }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Comprobante de la transferencia de pago</Label>
            <input
              type="file"
              id="settlement-payout-file"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUploadPayout(e.target.files[0])}
            />
            <Button
              type="button" variant="outline" className="w-full justify-start gap-2 cursor-pointer"
              disabled={uploadingPayout}
              onClick={() => document.getElementById("settlement-payout-file")?.click()}
            >
              {uploadingPayout ? <Loader2 className="h-4 w-4 animate-spin" /> : payoutProof ? <Check className="h-4 w-4 text-green-600" /> : <Paperclip className="h-4 w-4" />}
              {payoutProof ? payoutProof.name : "Subir comprobante (opcional por ahora)"}
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label>Quién debe firmar</Label>
            {projectMembers.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin otras personas en este proyecto todavía.</p>
            ) : (
              <div className="rounded-md border p-2 space-y-1.5 max-h-36 overflow-y-auto">
                {projectMembers.map((m) => (
                  <label key={m.userId} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={requiredSignerIds.includes(m.userId)}
                      onCheckedChange={(v) => toggleSigner(m.userId, v === true)}
                    />
                    {m.name}
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Cada firmante recibe un correo con un botón para revisar y aprobar. Si no eliges a nadie,
              cualquiera con acceso a Finanzas de este proyecto puede firmarla.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="cursor-pointer">Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving} className="cursor-pointer">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Crear liquidación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

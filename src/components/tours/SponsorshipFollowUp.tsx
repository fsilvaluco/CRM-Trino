"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SPONSORSHIP_STATUSES } from "@/lib/tours/sponsorship-fields";
import { SPONSORSHIP_STATUS_LABEL } from "@/components/tours/labels";
import type { Sponsorship, SponsorshipUpdate } from "@/types/tours";

function when(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-CL", { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

// Registrar seguimiento + historial de un auspicio.
export function SponsorshipFollowUp({
  tourId,
  sp,
  canEdit,
  onSaved,
}: {
  tourId: string;
  sp: Sponsorship;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [history, setHistory] = useState<SponsorshipUpdate[] | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState(sp.status);
  const [contacted, setContacted] = useState(true);
  const [nextDate, setNextDate] = useState(sp.nextFollowupAt ?? "");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/giras/${tourId}/auspicios/${sp.id}/seguimiento`)
      .then((r) => r.json())
      .then((d) => setHistory(Array.isArray(d) ? d : []))
      .catch(() => setHistory([]));
  }, [tourId, sp.id]);

  useEffect(load, [load]);
  useEffect(() => {
    setStatus(sp.status);
    setNextDate(sp.nextFollowupAt ?? "");
  }, [sp.status, sp.nextFollowupAt]);

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch(`/api/giras/${tourId}/auspicios/${sp.id}/seguimiento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, status, contacted, nextFollowupAt: nextDate || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "No se pudo guardar");
      setNote("");
      load();
      onSaved();
      toast.success("Seguimiento guardado");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="space-y-2 rounded-lg border p-3">
          <Label className="text-xs">Registrar seguimiento</Label>
          <Textarea rows={2} placeholder="Qué pasó: respondieron, se llamó, se reenvió…" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Select value={status} onValueChange={(v) => v && setStatus(v as Sponsorship["status"])}>
              <SelectTrigger className="w-full cursor-pointer text-xs">
                <SelectValue>{SPONSORSHIP_STATUS_LABEL[status]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SPONSORSHIP_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{SPONSORSHIP_STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} title="Próximo seguimiento" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <Checkbox checked={contacted} onCheckedChange={(v) => setContacted(Boolean(v))} /> Hubo contacto con la marca
            </label>
            <Button size="sm" onClick={submit} disabled={saving || (!note.trim() && status === sp.status)} className="cursor-pointer">
              Guardar
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">La fecha es el próximo seguimiento; si vence, aparece en las alertas.</p>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Historial</p>
        {history === null ? (
          <p className="text-xs text-muted-foreground">Cargando…</p>
        ) : history.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin movimientos todavía.</p>
        ) : (
          <ol className="space-y-2 border-l pl-3">
            {history.map((h) => (
              <li key={h.id} className="text-xs">
                <p className="text-muted-foreground">
                  {when(h.createdAt)}
                  {h.authorName ? ` · ${h.authorName}` : ""}
                </p>
                {h.statusTo && (
                  <p className="font-medium">
                    {h.statusFrom ? `${SPONSORSHIP_STATUS_LABEL[h.statusFrom]} → ` : ""}
                    {SPONSORSHIP_STATUS_LABEL[h.statusTo]}
                  </p>
                )}
                {h.note && <p className="whitespace-pre-wrap">{h.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

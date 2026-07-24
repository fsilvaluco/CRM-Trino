"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useProject } from "@/lib/project-context";
import { PRESS_TYPE_LABELS, PRESS_SOURCE_LABELS, type PressMention, type PressMentionType, type PressMentionSource } from "@/types/press";

interface Campaign {
  id: string;
  name: string;
}

interface PressMentionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editingMention?: PressMention | null;
}

interface FormFields {
  campaignId: string; // "__none__" si no aplica
  mentionDate: string;
  outlet: string;
  type: PressMentionType;
  source: PressMentionSource;
  title: string;
  referenceUrl: string;
  socialUrl: string;
  notes: string;
}

const EMPTY_FIELDS: FormFields = {
  campaignId: "__none__",
  mentionDate: "",
  outlet: "",
  type: "digital",
  source: "earned",
  title: "",
  referenceUrl: "",
  socialUrl: "",
  notes: "",
};

function mentionToFields(m: PressMention): FormFields {
  return {
    campaignId: m.campaignId ?? "__none__",
    mentionDate: m.mentionDate ?? "",
    outlet: m.outlet,
    type: m.type,
    source: m.source,
    title: m.title,
    referenceUrl: m.referenceUrl ?? "",
    socialUrl: m.socialUrl ?? "",
    notes: m.notes ?? "",
  };
}

export function PressMentionSheet({ open, onOpenChange, onSaved, editingMention }: PressMentionSheetProps) {
  const isEditing = !!editingMention;
  const { activeProject } = useProject();
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFields(editingMention ? mentionToFields(editingMention) : EMPTY_FIELDS);
    }
  }, [open, editingMention]);

  useEffect(() => {
    if (!open || !activeProject?.id) return;
    fetch(`/api/subprojects?projectId=${activeProject.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setCampaigns(Array.isArray(data) ? data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })) : []))
      .catch(() => setCampaigns([]));
  }, [open, activeProject?.id]);

  const handleSave = async () => {
    if (!activeProject?.id) {
      toast.error("Selecciona un proyecto antes de guardar");
      return;
    }
    if (!fields.outlet.trim() || !fields.title.trim()) {
      toast.error("Completa al menos el medio y la descripción");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        projectId: activeProject.id,
        campaignId: fields.campaignId === "__none__" ? null : fields.campaignId,
        mentionDate: fields.mentionDate || null,
        outlet: fields.outlet.trim(),
        type: fields.type,
        source: fields.source,
        title: fields.title.trim(),
        referenceUrl: fields.referenceUrl.trim() || null,
        socialUrl: fields.socialUrl.trim() || null,
        notes: fields.notes.trim() || null,
      };
      const res = await fetch(isEditing ? `/api/analytics/press/${editingMention!.id}` : "/api/analytics/press", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Error al guardar");
        return;
      }
      toast.success(isEditing ? "Mención actualizada" : "Mención registrada");
      onOpenChange(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Editar mención de prensa" : "Registrar mención de prensa"}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 px-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mentionDate">Fecha</Label>
              <Input
                id="mentionDate"
                type="date"
                value={fields.mentionDate}
                onChange={(e) => setFields((f) => ({ ...f, mentionDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Campaña</Label>
              <Select value={fields.campaignId} onValueChange={(v) => setFields((f) => ({ ...f, campaignId: v ?? "__none__" }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin campaña</SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="outlet">Medio *</Label>
            <Input
              id="outlet"
              placeholder="Ej. CNN Chile"
              value={fields.outlet}
              onChange={(e) => setFields((f) => ({ ...f, outlet: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={fields.type} onValueChange={(v) => setFields((f) => ({ ...f, type: v as PressMentionType }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRESS_TYPE_LABELS) as PressMentionType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {PRESS_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fuente</Label>
              <Select value={fields.source} onValueChange={(v) => setFields((f) => ({ ...f, source: v as PressMentionSource }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRESS_SOURCE_LABELS) as PressMentionSource[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {PRESS_SOURCE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Descripción *</Label>
            <Textarea
              id="title"
              rows={2}
              placeholder="Ej. «Gamuza estrena su álbum debut» — reseña del lanzamiento"
              value={fields.title}
              onChange={(e) => setFields((f) => ({ ...f, title: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="referenceUrl">Link de referencia</Label>
            <Input
              id="referenceUrl"
              placeholder="https://..."
              value={fields.referenceUrl}
              onChange={(e) => setFields((f) => ({ ...f, referenceUrl: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="socialUrl">Link RRSS / YouTube</Label>
            <Input
              id="socialUrl"
              placeholder="https://..."
              value={fields.socialUrl}
              onChange={(e) => setFields((f) => ({ ...f, socialUrl: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              rows={2}
              value={fields.notes}
              onChange={(e) => setFields((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>

        <SheetFooter>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? "Guardar cambios" : "Registrar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SPONSORSHIP_CATEGORIES, SPONSORSHIP_STATUSES } from "@/lib/tours/sponsorship-fields";
import { SPONSORSHIP_CATEGORY_LABEL, SPONSORSHIP_STATUS_LABEL } from "@/components/tours/labels";
import type { BudgetLine, Sponsorship } from "@/types/tours";

// Formulario de una marca/canje. Los montos se escriben en pesos y se
// guardan en centavos.
export type SponsorshipDraft = Partial<Omit<Sponsorship, "id" | "updatedAt">>;

const pesos = (cents: number | null | undefined) => (cents === null || cents === undefined ? "" : String(Math.round(cents / 100)));
const cents = (v: string) => (v.trim() === "" ? null : Math.round(Number(v.replace(/\D/g, "")) * 100));

export function SponsorshipFields({
  draft,
  onChange,
  budgetLines,
}: {
  draft: SponsorshipDraft;
  onChange: (d: SponsorshipDraft) => void;
  budgetLines: BudgetLine[] | null;
}) {
  const set = (patch: SponsorshipDraft) => onChange({ ...draft, ...patch });
  const text = (key: keyof SponsorshipDraft, label: string, opts: { type?: string; placeholder?: string } = {}) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type={opts.type ?? "text"}
        placeholder={opts.placeholder}
        value={(draft[key] as string | null | undefined) ?? ""}
        onChange={(e) => set({ [key]: e.target.value } as SponsorshipDraft)}
      />
    </div>
  );

  return (
    <div className="space-y-3">
      {text("brand", "Marca")}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Categoría</Label>
          <Select value={draft.category ?? "otro"} onValueChange={(v) => set({ category: v as Sponsorship["category"] })}>
            <SelectTrigger className="w-full cursor-pointer">
              <SelectValue>{SPONSORSHIP_CATEGORY_LABEL[draft.category ?? "otro"]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SPONSORSHIP_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{SPONSORSHIP_CATEGORY_LABEL[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Estado</Label>
          <Select value={draft.status ?? "identificada"} onValueChange={(v) => set({ status: v as Sponsorship["status"] })}>
            <SelectTrigger className="w-full cursor-pointer">
              <SelectValue>{SPONSORSHIP_STATUS_LABEL[draft.status ?? "identificada"]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SPONSORSHIP_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{SPONSORSHIP_STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Pedido (qué le pedimos)</Label>
        <Textarea rows={2} value={draft.request ?? ""} onChange={(e) => set({ request: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Contraprestación (qué damos)</Label>
        <Textarea rows={2} value={draft.counterpart ?? ""} onChange={(e) => set({ counterpart: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {text("city", "Ciudad", { placeholder: "Toda la gira" })}
        {text("responsibleName", "Responsable")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Valor estimado ($)</Label>
          <Input inputMode="numeric" value={pesos(draft.estimatedValue)} onChange={(e) => set({ estimatedValue: cents(e.target.value) })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Valor confirmado ($)</Label>
          <Input inputMode="numeric" value={pesos(draft.confirmedValue)} onChange={(e) => set({ confirmedValue: cents(e.target.value) })} />
        </div>
      </div>
      {budgetLines && budgetLines.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Partida que baja</Label>
          <Select value={draft.budgetLineId ?? "__none"} onValueChange={(v) => set({ budgetLineId: v && v !== "__none" ? v : null })}>
            <SelectTrigger className="w-full cursor-pointer">
              <SelectValue>{budgetLines.find((l) => l.id === draft.budgetLineId)?.label ?? "Según categoría"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Según categoría</SelectItem>
              {budgetLines.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {text("contactName", "Contacto")}
        {text("contactPhone", "Teléfono")}
      </div>
      {text("contactEmail", "Correo", { type: "email" })}
      <div className="grid grid-cols-2 gap-2">
        {text("instagramUrl", "Instagram")}
        {text("website", "Web")}
      </div>
      {text("dossierUrl", "Link del dossier (Canva /edit)")}
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox checked={Boolean(draft.dossierDone)} onCheckedChange={(v) => set({ dossierDone: Boolean(v) })} /> Dossier hecho
      </label>
      {text("nextFollowupAt", "Próximo seguimiento", { type: "date" })}
      <div className="space-y-1.5">
        <Label className="text-xs">Notas</Label>
        <Textarea rows={2} value={draft.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
      </div>
    </div>
  );
}

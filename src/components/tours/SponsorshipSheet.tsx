"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SponsorshipFields, type SponsorshipDraft } from "@/components/tours/SponsorshipFields";
import { SponsorshipFollowUp } from "@/components/tours/SponsorshipFollowUp";
import type { BudgetLine, Sponsorship } from "@/types/tours";

const EMPTY: SponsorshipDraft = { brand: "", category: "otro", status: "identificada", dossierDone: false };

// Ficha lateral de un auspicio: seguimiento + edición. Con `sp` null crea uno nuevo.
export function SponsorshipSheet({
  tourId,
  sp,
  open,
  canEdit,
  budgetLines,
  onClose,
  onSaved,
}: {
  tourId: string;
  sp: Sponsorship | null;
  open: boolean;
  canEdit: boolean;
  budgetLines: BudgetLine[] | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<SponsorshipDraft>(sp ?? EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(sp ?? EMPTY), [sp]);

  async function save() {
    if (!draft.brand?.trim()) return toast.error("La marca es obligatoria");
    setSaving(true);
    try {
      const url = sp ? `/api/giras/${tourId}/auspicios/${sp.id}` : `/api/giras/${tourId}/auspicios`;
      const res = await fetch(url, {
        method: sp ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "No se pudo guardar");
      toast.success(sp ? "Cambios guardados" : "Marca agregada");
      onSaved();
      if (!sp) onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!sp || !confirm(`¿Eliminar "${sp.brand}" y su historial? No se puede deshacer.`)) return;
    const res = await fetch(`/api/giras/${tourId}/auspicios/${sp.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("No se pudo eliminar");
    onSaved();
    onClose();
  }

  const form = (
    <div className="space-y-4">
      <SponsorshipFields draft={draft} onChange={setDraft} budgetLines={budgetLines} />
      {canEdit && (
        <div className="flex items-center justify-between gap-2">
          {sp ? (
            <Button variant="ghost" size="sm" onClick={remove} className="cursor-pointer text-destructive">
              <Trash2 className="h-4 w-4" /> Eliminar
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={save} disabled={saving} className="cursor-pointer">
            {sp ? "Guardar cambios" : "Agregar marca"}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{sp ? sp.brand : "Nueva marca"}</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6">
          {sp ? (
            <Tabs defaultValue="seguimiento">
              <TabsList>
                <TabsTrigger value="seguimiento">Seguimiento</TabsTrigger>
                <TabsTrigger value="datos">Datos</TabsTrigger>
              </TabsList>
              <TabsContent value="seguimiento" className="pt-3">
                <SponsorshipFollowUp tourId={tourId} sp={sp} canEdit={canEdit} onSaved={onSaved} />
              </TabsContent>
              <TabsContent value="datos" className="pt-3">
                {form}
              </TabsContent>
            </Tabs>
          ) : (
            form
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

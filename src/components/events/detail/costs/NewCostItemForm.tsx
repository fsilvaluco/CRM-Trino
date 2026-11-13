"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TypeaheadInput } from "@/components/events/TypeaheadInput";
import { BencinaCalculator } from "@/components/events/BencinaCalculator";
import { MoneyInput } from "@/components/shared/MoneyInput";
import { Plus } from "lucide-react";
import { COST_CATEGORIES } from "@/lib/cost-categories";
import type { SuggestionFetcher } from "../types";
import type { CostsSectionState } from "../hooks/useCostsSection";

// Formulario para agregar un ítem a mano a la Planilla de costos.
export function NewCostItemForm({
  costs,
  fetchCostTypeSuggestions,
  fetchResponsableSuggestions,
}: {
  costs: CostsSectionState;
  fetchCostTypeSuggestions: SuggestionFetcher;
  fetchResponsableSuggestions: SuggestionFetcher;
}) {
  const f = costs.newCost;
  return (
    <div className="space-y-1.5 pt-1 no-print">
      <TypeaheadInput
        placeholder="Ítem (ej. Transporte, Catering...)"
        value={f.label}
        onChange={f.setLabel}
        fetchSuggestions={fetchCostTypeSuggestions}
        className="h-7 text-xs w-full"
      />
      <div className="flex items-center gap-2">
        <Select value={f.category ?? undefined} onValueChange={(v) => f.setCategory(v ?? null)}>
          <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
            <SelectValue placeholder="Categoría">{f.category ?? "Categoría"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {COST_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="w-20 sm:w-28 shrink-0">
          <MoneyInput
            placeholder={f.esBhe ? "Líquido" : "$0"}
            value={f.amount}
            onChange={f.setAmount}
            className="h-7 text-xs"
          />
        </div>
      </div>

      {f.category === "Bencina" && (
        <BencinaCalculator
          km={f.km}
          kmRate={f.kmRate}
          onChange={({ km, kmRate, amountCents }) => {
            f.setKm(km);
            f.setKmRate(kmRate);
            if (amountCents != null) f.setAmount(String(Math.round(amountCents / 100)));
          }}
        />
      )}

      <div className="flex items-center gap-2">
        <TypeaheadInput
          placeholder="Responsable"
          value={f.responsable}
          onChange={(v) => { f.setResponsable(v); f.setResponsableContactId(null); }}
          onSelectSuggestion={(s) => { f.setResponsable(s.label); f.setResponsableContactId(s.value ?? null); }}
          fetchSuggestions={fetchResponsableSuggestions}
          className="h-7 text-xs flex-1"
        />
        <Input
          placeholder="Link comprobante"
          value={f.comprobante}
          onChange={(e) => f.setComprobante(e.target.value)}
          className="h-7 text-xs w-36 shrink-0"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 cursor-pointer">
          <Checkbox checked={f.esBhe} onCheckedChange={(v) => f.setEsBhe(Boolean(v))} />
          BHE
        </label>
        <Button aria-label="Agregar costo"
          size="sm"
          variant="outline"
          className="h-7 shrink-0 cursor-pointer"
          disabled={!f.label.trim()}
          onClick={costs.addFromForm}
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

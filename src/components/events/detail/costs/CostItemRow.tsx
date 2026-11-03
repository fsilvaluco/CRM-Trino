"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TypeaheadInput } from "@/components/events/TypeaheadInput";
import { BencinaCalculator } from "@/components/events/BencinaCalculator";
import { MoneyInput } from "@/components/shared/MoneyInput";
import { SignedFileLink } from "@/components/finances/SignedFileLink";
import { Banknote, Paperclip, Receipt, Trash2 } from "lucide-react";
import type { CostItem } from "@/types/shows";
import { liquidoToBruto, retencionFromBruto, BHE_RETENTION_RATE } from "@/lib/bhe";
import { COST_CATEGORIES } from "@/lib/cost-categories";
import type { SuggestionFetcher } from "../types";
import { formatCents } from "../utils";
import type { CostsSectionState } from "../hooks/useCostsSection";

// Una fila editable de la Planilla de costos (dentro del SortableList).
export function CostItemRow({
  item,
  costs,
  costSheetClosed,
  canEditCosts,
  fetchCostTypeSuggestions,
  fetchResponsableSuggestions,
}: {
  item: CostItem;
  costs: CostsSectionState;
  costSheetClosed: boolean;
  canEditCosts: boolean;
  fetchCostTypeSuggestions: SuggestionFetcher;
  fetchResponsableSuggestions: SuggestionFetcher;
}) {
  const bruto = item.esBhe ? (item.liquidoAmount != null ? liquidoToBruto(item.liquidoAmount) : item.amount) : item.amount;
  const retencion = item.esBhe ? retencionFromBruto(bruto) : 0;
  const displayAmount = item.esBhe ? item.liquidoAmount ?? 0 : item.amount;

  function updateItem(patch: Partial<CostItem>) {
    costs.updateItem(item.id, patch);
  }

  return (
    <div className="space-y-1.5 pb-2 border-b last:border-0">
      <TypeaheadInput
        placeholder="Detalle (ej. Pago sonidista)"
        value={item.label}
        disabled={costSheetClosed || !canEditCosts}
        onChange={(v) => updateItem({ label: v })}
        fetchSuggestions={fetchCostTypeSuggestions}
        className="h-7 text-xs w-full"
      />
      <div className="flex items-center gap-2">
        <Select
          value={item.category ?? undefined}
          onValueChange={(v) => updateItem({ category: v ?? null })}
          disabled={costSheetClosed || !canEditCosts}
        >
          <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
            <SelectValue placeholder="Categoría">{item.category ?? "Categoría"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {COST_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="w-20 sm:w-28 shrink-0">
          <MoneyInput
            placeholder={item.esBhe ? "Líquido" : "$0"}
            value={displayAmount ? String(displayAmount / 100) : ""}
            disabled={costSheetClosed || !canEditCosts}
            onChange={(digits) => {
              const cents = digits ? parseInt(digits, 10) * 100 : 0;
              if (item.esBhe) {
                updateItem({ liquidoAmount: cents, amount: liquidoToBruto(cents) });
              } else {
                updateItem({ amount: cents });
              }
            }}
            className="h-7 text-xs"
          />
        </div>
        <button aria-label={item.label ? `Eliminar costo ${item.label}` : "Eliminar costo"}
          onClick={() => costs.edit((prev) => prev.filter((c) => c.id !== item.id))}
          disabled={costSheetClosed || !canEditCosts}
          className="text-muted-foreground hover:text-destructive cursor-pointer p-1 shrink-0 disabled:opacity-30 no-print"
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      {item.category === "Bencina" && (
        <div className="no-print">
          <BencinaCalculator
            km={item.km}
            kmRate={item.kmRate}
            disabled={costSheetClosed || !canEditCosts}
            onChange={({ km, kmRate, amountCents }) =>
              updateItem({
                km,
                kmRate,
                ...(amountCents != null ? { amount: amountCents } : {}),
              })
            }
          />
        </div>
      )}

      <div className="flex items-center gap-2 pl-0.5 flex-wrap">
        <TypeaheadInput
          placeholder="Responsable (a quién se le paga)"
          value={item.responsable ?? ""}
          disabled={costSheetClosed || !canEditCosts}
          onChange={(v) => updateItem({ responsable: v, responsableContactId: null })}
          onSelectSuggestion={(s) => updateItem({ responsable: s.label, responsableContactId: s.value ?? null })}
          fetchSuggestions={fetchResponsableSuggestions}
          className="h-7 text-xs flex-1"
        />
        <div className="flex items-center gap-1 shrink-0">
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className="hidden"
            id={`comprobante-upload-${item.id}`}
            disabled={costSheetClosed || !canEditCosts}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              void costs.uploadItemComprobante(item.id, file);
            }}
          />
          <label
            htmlFor={`comprobante-upload-${item.id}`}
            className={`text-muted-foreground hover:text-foreground no-print ${(costSheetClosed || !canEditCosts) ? "opacity-40 pointer-events-none" : "cursor-pointer"}`}
            title="Subir comprobante (foto o PDF)"
          >
            <Paperclip className="h-3.5 w-3.5" />
          </label>
          {item.comprobanteUrl && (
            <SignedFileLink aria-label="Ver comprobante" path={item.comprobanteUrl} className="text-muted-foreground hover:text-foreground">
              <Receipt aria-hidden="true" className="h-3.5 w-3.5" />
            </SignedFileLink>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 cursor-pointer no-print">
          <Checkbox
            checked={item.esBhe}
            disabled={costSheetClosed || !canEditCosts}
            onCheckedChange={(checked) => {
              if (checked) {
                const liquido = item.amount;
                updateItem({ esBhe: true, liquidoAmount: liquido, amount: liquidoToBruto(liquido) });
              } else {
                updateItem({ esBhe: false, amount: item.liquidoAmount ?? item.amount, liquidoAmount: null });
              }
            }}
          />
          BHE
        </label>
      </div>

      {item.esBhe && (
        <p className="text-xs text-muted-foreground pl-0.5">
          Boleta (bruto): <span className="font-medium text-foreground">{formatCents(bruto)}</span>
          {" · "}Retención ({(BHE_RETENTION_RATE * 100).toFixed(2)}%): {formatCents(retencion)}
          {" · "}Recibe en efectivo: {formatCents(item.liquidoAmount)}
        </p>
      )}

      {/* Pago del ítem: el comprobante de arriba es la boleta/factura del
          GASTO (cuánto se debe); este es distinto -- comprobante de que
          YA SE LE PAGÓ (ej. captura de la transferencia), llega después. */}
      <div className="flex items-center gap-2 pl-0.5 flex-wrap no-print">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 cursor-pointer">
          <Checkbox
            checked={item.pagado}
            disabled={!canEditCosts}
            onCheckedChange={(checked) => costs.updateItemPayment(item.id, { pagado: Boolean(checked) })}
          />
          Pagado
        </label>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="hidden"
          id={`comprobante-pago-upload-${item.id}`}
          disabled={!canEditCosts}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            void costs.uploadItemPaymentProof(item.id, file);
          }}
        />
        <label
          htmlFor={`comprobante-pago-upload-${item.id}`}
          className={`flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ${!canEditCosts ? "opacity-40 pointer-events-none" : "cursor-pointer"}`}
          title="Subir comprobante de transferencia"
        >
          <Paperclip className="h-3.5 w-3.5" />
          {item.comprobantePagoUrl ? "Cambiar comprobante de pago" : "Adjuntar comprobante de pago"}
        </label>
        {item.comprobantePagoUrl && (
          <SignedFileLink aria-label="Ver comprobante de pago" path={item.comprobantePagoUrl} className="text-muted-foreground hover:text-foreground" title="Ver comprobante de pago">
            <Banknote aria-hidden="true" className="h-3.5 w-3.5" />
          </SignedFileLink>
        )}
      </div>
    </div>
  );
}

"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SignedFileLink } from "@/components/finances/SignedFileLink";
import { Loader2, Receipt } from "lucide-react";
import { profitSplitLabels, DEFAULT_TRINO_LABEL } from "@/lib/profit-split";
import type { EventDetail } from "../types";
import { formatCents, formatDateTime } from "../utils";
import type { CostsSectionState } from "../hooks/useCostsSection";

// Reparto de utilidad (porcentajes, nombres, nota), comprobante de la
// transferencia del reparto y la versión impresa del reparto con firmas.
export function ProfitSplitPanel({
  event,
  costs,
  utilidadCents,
  costSheetClosed,
  canEditCosts,
}: {
  event: EventDetail;
  costs: CostsSectionState;
  utilidadCents: number;
  costSheetClosed: boolean;
  canEditCosts: boolean;
}) {
  const transferProofInputRef = useRef<HTMLInputElement>(null);
  const { profitSplitNote, profitSplitProjectLabel, profitSplitTrinoLabel } = costs;
  // Default 70/30 si no se ha tocado el reparto de este evento puntual.
  const resolvedProjectPct = costs.profitSplitProjectPct ?? 70;
  const resolvedTrinoPct = costs.profitSplitTrinoPct ?? 30;
  const splitLabels = profitSplitLabels({
    profitSplitProjectLabel,
    profitSplitTrinoLabel,
    projectName: event?.projectName ?? null,
  });
  const projectSplitCents = Math.round((utilidadCents * resolvedProjectPct) / 100);
  const trinoSplitCents = Math.round((utilidadCents * resolvedTrinoPct) / 100);

  return (
    <>
      <div className="no-print space-y-2 pt-1">
        <Label className="text-xs text-muted-foreground">
          Reparto de utilidad ({formatCents(utilidadCents)})
        </Label>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              inputMode="numeric"
              disabled={costSheetClosed || !canEditCosts}
              value={resolvedProjectPct}
              onChange={(e) => costs.setProfitSplitProjectPct(e.target.value === "" ? null : Number(e.target.value))}
              className="h-8 w-16 text-sm"
            />
            <span className="text-sm text-muted-foreground">%</span>
            <Input
              disabled={costSheetClosed || !canEditCosts}
              value={profitSplitProjectLabel}
              placeholder={event.projectName || "Proyecto"}
              onChange={(e) => costs.setProfitSplitProjectLabel(e.target.value)}
              className="h-8 w-32 text-sm"
            />
            <span className="text-sm text-muted-foreground">=</span>
            <span className="text-sm font-semibold">{formatCents(projectSplitCents)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              inputMode="numeric"
              disabled={costSheetClosed || !canEditCosts}
              value={resolvedTrinoPct}
              onChange={(e) => costs.setProfitSplitTrinoPct(e.target.value === "" ? null : Number(e.target.value))}
              className="h-8 w-16 text-sm"
            />
            <span className="text-sm text-muted-foreground">%</span>
            <Input
              disabled={costSheetClosed || !canEditCosts}
              value={profitSplitTrinoLabel}
              placeholder={DEFAULT_TRINO_LABEL}
              onChange={(e) => costs.setProfitSplitTrinoLabel(e.target.value)}
              className="h-8 w-32 text-sm"
            />
            <span className="text-sm text-muted-foreground">=</span>
            <span className="text-sm font-semibold">{formatCents(trinoSplitCents)}</span>
          </div>
        </div>

        <Textarea
          id="profit-split-note"
          rows={2}
          disabled={costSheetClosed || !canEditCosts}
          placeholder="Nota opcional -- ej. toda la utilidad se va a cubrir un costo puntual"
          value={profitSplitNote}
          onChange={(e) => costs.setProfitSplitNote(e.target.value)}
          className="text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Estos porcentajes, nombres y montos los ven los firmantes al aprobar el cierre, para saber cuánto
          transferir. Los nombres sirven para eventos externos, donde el reparto no es con un proyecto de la
          cartera -- en blanco quedan los de siempre.
        </p>
      </div>

      {/* Comprobante de la transferencia del reparto -- el paso final
          del evento, después de que todos firmaron. */}
      <div className="no-print space-y-1.5 pt-1 border-t pt-3">
        <Label className="text-xs text-muted-foreground">Comprobante de transferencia del reparto</Label>
        <input
          ref={transferProofInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="hidden"
          disabled={costs.uploadingTransferProof}
          onChange={costs.handleTransferProofChange}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs cursor-pointer"
            disabled={costs.uploadingTransferProof}
            onClick={() => transferProofInputRef.current?.click()}
          >
            {costs.uploadingTransferProof ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            {costs.transferProofUrl ? "Cambiar comprobante" : "Subir comprobante de transferencia"}
          </Button>
          {costs.transferProofUrl && (
            <SignedFileLink path={costs.transferProofUrl} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              <Receipt className="h-3.5 w-3.5" /> Ver comprobante
            </SignedFileLink>
          )}
        </div>
        {costs.transferredAt && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Transferido el {formatDateTime(costs.transferredAt)} -- evento cerrado.
          </p>
        )}
      </div>

      <p className="hidden print:block text-sm pt-2">
        <span className="font-medium">Reparto de utilidad ({formatCents(utilidadCents)}):</span>{" "}
        {resolvedProjectPct}% {splitLabels.project} = {formatCents(projectSplitCents)} ·{" "}
        {resolvedTrinoPct}% {splitLabels.trino} = {formatCents(trinoSplitCents)}
        {profitSplitNote.trim() && (
          <>
            <br /><span className="font-medium">Nota:</span> {profitSplitNote.trim()}
          </>
        )}
      </p>

      <div className="hidden print:grid grid-cols-2 gap-8 pt-12">
        <div className="text-center text-sm">
          <div className="border-t border-foreground pt-1">Firma {splitLabels.trino}</div>
        </div>
        <div className="text-center text-sm">
          <div className="border-t border-foreground pt-1">
            Firma Rep. {splitLabels.project}
          </div>
        </div>
      </div>
    </>
  );
}

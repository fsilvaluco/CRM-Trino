"use client";

import { Card, CardContent } from "@/components/ui/card";
import { ImportCostsDialog } from "@/components/events/ImportCostsDialog";
import { SortableList } from "@/components/events/SortableList";
import { SignedFileLink } from "@/components/finances/SignedFileLink";
import { Button } from "@/components/ui/button";
import { Paperclip, Trash2 } from "lucide-react";
import type { EventDetail, PrintSection, SignatureData, SuggestionFetcher } from "../types";
import { formatCents, formatDateTime } from "../utils";
import type { CostsSectionState } from "../hooks/useCostsSection";
import type { CostClosingState } from "../hooks/useCostClosing";
import type { CostSubmissionsState } from "../hooks/useCostSubmissions";
import { CostsHeader } from "./CostsHeader";
import { CostSubmissionsPanel } from "./CostSubmissionsPanel";
import { CostItemRow } from "./CostItemRow";
import { NewCostItemForm } from "./NewCostItemForm";
import { ProfitSplitPanel } from "./ProfitSplitPanel";

async function fetchCostTypeSuggestions(query: string) {
  const res = await fetch(`/api/cost-item-types?search=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data: Array<{ id: string; name: string }> = await res.json();
  return data.map((t) => ({ label: t.name, value: t.id }));
}

// Sección "Planilla de costos" (data-section="costs"). La página solo la
// muestra si el rol puede ver costos (canViewCosts).
export function EventCostsSection({
  id,
  event,
  costs,
  closing,
  submissions,
  signatureData,
  costSheetClosed,
  canEditCosts,
  utilidadCents,
  printSection,
  fetchResponsableSuggestions,
}: {
  id: string;
  event: EventDetail;
  costs: CostsSectionState;
  closing: CostClosingState;
  submissions: CostSubmissionsState;
  signatureData: SignatureData | null;
  costSheetClosed: boolean;
  canEditCosts: boolean;
  utilidadCents: number;
  printSection: (section: PrintSection) => void;
  fetchResponsableSuggestions: SuggestionFetcher;
}) {
  const { costItems } = costs;
  const costsTotal = costItems.reduce((sum, c) => sum + (c.amount || 0), 0);
  return (
    <Card data-section="costs">
      <CostsHeader
        id={id}
        event={event}
        costs={costs}
        closing={closing}
        signatureData={signatureData}
        costSheetClosed={costSheetClosed}
        canEditCosts={canEditCosts}
        printSection={printSection}
      />
      <CardContent className="space-y-3">
        {costSheetClosed && (
          <p className="text-xs text-muted-foreground no-print">
            Caja cerrada{event.costSheetClosedAt ? ` el ${formatDateTime(event.costSheetClosedAt)}` : ""}.
            Reábrela si necesitas corregir algo.
            {event.costSheetInformedAt && (
              <> Cierre informado por correo el {formatDateTime(event.costSheetInformedAt)}.</>
            )}
          </p>
        )}

        {event.costSheetClosingFilePath && (
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 no-print">
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <SignedFileLink
              path={event.costSheetClosingFilePath}
              className="text-xs text-primary hover:underline truncate"
            >
              {event.costSheetClosingFileName ?? "Documento adjunto"}
            </SignedFileLink>
            <button aria-label="Quitar documento adjunto"
              onClick={closing.removeAttachment}
              className="text-muted-foreground hover:text-destructive cursor-pointer ml-auto shrink-0"
              title="Quitar"
            >
              <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {submissions.canReview && submissions.submissions.some((s) => s.status === "pending") && (
          <CostSubmissionsPanel state={submissions} />
        )}

        {costItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin items de costo agregados todavía.</p>
        ) : (
          <table className="hidden print:table w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="text-left py-1 pr-3 font-medium">Detalle</th>
                <th className="text-left py-1 pr-3 font-medium">Categoría</th>
                <th className="text-left py-1 pr-3 font-medium">Responsable</th>
                <th className="text-right py-1 pr-3 font-medium">Monto</th>
                <th className="text-left py-1 font-medium">Pagado</th>
              </tr>
            </thead>
            <tbody>
              {costItems.map((item) => (
                <tr key={item.id} className="border-b border-slate-200">
                  <td className="py-1 pr-3">{item.label}</td>
                  <td className="py-1 pr-3">{item.category || "—"}</td>
                  <td className="py-1 pr-3">{item.responsable || "—"}</td>
                  <td className="py-1 pr-3 text-right">{formatCents(item.amount)}</td>
                  <td className="py-1">{item.pagado ? "Sí" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="no-print space-y-3">
        {costItems.length === 0 ? null : (
          <SortableList
            items={costItems}
            onReorder={(items) => costs.edit(() => items)}
            renderItem={(item) => (
              <CostItemRow
                item={item}
                costs={costs}
                costSheetClosed={costSheetClosed}
                canEditCosts={canEditCosts}
                fetchCostTypeSuggestions={fetchCostTypeSuggestions}
                fetchResponsableSuggestions={fetchResponsableSuggestions}
              />
            )}
          />
        )}

        {!costSheetClosed && canEditCosts && (
          <NewCostItemForm
            costs={costs}
            fetchCostTypeSuggestions={fetchCostTypeSuggestions}
            fetchResponsableSuggestions={fetchResponsableSuggestions}
          />
        )}
        </div>

        {canEditCosts && !costSheetClosed && (
          <ImportCostsDialog
            eventId={id}
            open={costs.importOpen}
            onOpenChange={costs.setImportOpen}
            onImport={costs.handleImported}
          />
        )}

        {costItems.length > 0 && (
          <div className="flex items-center justify-between border-t pt-2">
            <p className="text-sm text-muted-foreground">
              Total planilla: <span className="font-semibold text-foreground">{formatCents(costsTotal)}</span>
            </p>
            {!costSheetClosed && canEditCosts && (
              <Button size="sm" variant="ghost" className="h-7 text-xs cursor-pointer no-print" onClick={costs.applyToExpenses}>
                Usar como Egresos del evento
              </Button>
            )}
          </div>
        )}

        <ProfitSplitPanel
          event={event}
          costs={costs}
          utilidadCents={utilidadCents}
          costSheetClosed={costSheetClosed}
          canEditCosts={canEditCosts}
        />
      </CardContent>
    </Card>
  );
}

"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCents } from "./utils";
import type { EventDetail } from "./types";
import type { TicketsSectionState } from "./hooks/useTicketsSection";

// Descuentos sobre la venta de entradas (IVA / comisión / SCD / % del
// proyecto) y el desglose bruto -> neto -> monto del proyecto.
export function TicketDiscountsPanel({ event, state }: { event: EventDetail; state: TicketsSectionState }) {
  const { breakdown: ticketBreakdown } = state;
  return (
    <div className="border-t pt-3 space-y-2 no-print">
      <p className="text-xs font-medium text-muted-foreground">
        Descuentos sobre la venta (opcional -- se configuran evento a evento)
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">IVA %</Label>
          <Input
            type="number"
            step="0.1"
            placeholder="19"
            value={state.ivaPct}
            onChange={(e) => state.setIvaPct(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Comisión venta %</Label>
          <Input
            type="number"
            step="0.1"
            placeholder="2,5"
            value={state.comisionPct}
            onChange={(e) => state.setComisionPct(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Derechos SCD %</Label>
          <Input
            type="number"
            step="0.1"
            placeholder="5"
            value={state.scdPct}
            onChange={(e) => state.setScdPct(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            % que llega a {event.projectName || "el proyecto"}
          </Label>
          <Input
            type="number"
            step="0.1"
            placeholder="70"
            value={state.splitProjectPct}
            onChange={(e) => state.setSplitProjectPct(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      </div>
      {ticketBreakdown.hasDescuentos && (
        <div className="text-xs text-muted-foreground space-y-0.5 bg-muted/40 rounded-md p-2">
          <p>Bruto: <span className="font-medium text-foreground">{formatCents(ticketBreakdown.bruto)}</span></p>
          <p>
            Descuentos (IVA {ticketBreakdown.ivaPct}% incluido · comisión {ticketBreakdown.comisionPct}% · SCD {ticketBreakdown.scdPct}%):{" "}
            <span className="font-medium text-foreground">-{formatCents(ticketBreakdown.descuentos)}</span>
          </p>
          <p>Neto: <span className="font-medium text-foreground">{formatCents(ticketBreakdown.neto)}</span></p>
          <p>
            {event.projectName || "Proyecto"} ({ticketBreakdown.splitPct}%):{" "}
            <span className="font-semibold text-foreground">{formatCents(ticketBreakdown.montoProyecto)}</span>
            {ticketBreakdown.splitPct < 100 && (
              <span className="text-muted-foreground"> · venue/productora ({(100 - ticketBreakdown.splitPct).toFixed(1)}%): {formatCents(ticketBreakdown.neto - ticketBreakdown.montoProyecto)}</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

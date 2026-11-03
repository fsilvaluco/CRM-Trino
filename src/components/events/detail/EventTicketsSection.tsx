"use client";

import { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SortableList } from "@/components/events/SortableList";
import { MoneyInput } from "@/components/shared/MoneyInput";
import { Clock, Loader2, Plus, RefreshCw, Ticket, Trash2, Upload } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import type { TicketTier } from "@/types/shows";
import { formatCents, TICKETS_SOURCE_LABEL } from "./utils";
import type { EventDetail } from "./types";
import type { TicketsSectionState } from "./hooks/useTicketsSection";
import { TicketDiscountsPanel } from "./TicketDiscountsPanel";

// Sección "Venta de entradas" (data-section="tickets"). El link de la
// ticketera es estado de "detalles" (se guarda junto a los riders), por eso
// llega aparte como valor + setter.
export function EventTicketsSection({
  event,
  state,
  ticketSalesUrl,
  setTicketSalesUrl,
  canEditCosts,
}: {
  event: EventDetail;
  state: TicketsSectionState;
  ticketSalesUrl: string;
  setTicketSalesUrl: (value: string) => void;
  canEditCosts: boolean;
}) {
  const { ticketTiers, breakdown: ticketBreakdown, updatedAt: ticketsUpdatedAt } = state;
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <Card data-section="tickets">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <Ticket className="h-4 w-4" />
          Venta de entradas
        </CardTitle>
        <div className="flex items-center gap-2 no-print">
          {state.dirty && (
            <Button size="sm" className="h-7 text-xs cursor-pointer" disabled={state.saving} onClick={state.save}>
              {state.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar entradas"}
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void state.handleScreenshot(file);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs cursor-pointer"
            disabled={state.extracting}
            onClick={() => fileInputRef.current?.click()}
          >
            {state.extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1" /> : <Upload className="h-3.5 w-3.5 sm:mr-1" />}
            <span className="hidden sm:inline">{state.extracting ? "Leyendo..." : "Subir pantallazo"}</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Marca de frescura: fecha y hora de la última actualización de los
            tramos y por qué vía. Sale también en la impresión, para que quien
            lea la planilla sepa a qué momento corresponden los números. */}
        {ticketsUpdatedAt ? (
          <p className={`text-xs flex items-center gap-1.5 ${state.stale ? "text-amber-600" : "text-muted-foreground"}`}>
            <Clock className="h-3 w-3 shrink-0" />
            <span>
              Última actualización: {format(new Date(ticketsUpdatedAt), "d MMM yyyy, HH:mm", { locale: es })} hrs
              {" · "}
              {formatDistanceToNow(new Date(ticketsUpdatedAt), { locale: es, addSuffix: true })}
              {" · "}
              {TICKETS_SOURCE_LABEL[state.source]}
            </span>
          </p>
        ) : ticketTiers.length > 0 ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3 w-3 shrink-0" />
            <span>Sin registro de actualización todavía — se marca al guardar las entradas.</span>
          </p>
        ) : null}
        <div className="flex items-center gap-2 no-print">
          <Input
            placeholder="Link de estadísticas de la ticketera (PortalTickets, etc.)"
            value={ticketSalesUrl}
            onChange={(e) => setTicketSalesUrl(e.target.value)}
            className="h-8 text-sm flex-1"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs cursor-pointer shrink-0"
            disabled={state.syncing}
            onClick={state.handleSync}
          >
            {state.syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1" /> : <RefreshCw className="h-3.5 w-3.5 sm:mr-1" />}
            <span className="hidden sm:inline">{state.syncing ? "Sincronizando..." : "Sincronizar"}</span>
          </Button>
        </div>

        {/* Version limpia, solo para "Imprimir todo" -- sin inputs editables */}
        {ticketTiers.length > 0 && (
          <table className="hidden print:table w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="text-left py-1 pr-3 font-medium">Tramo</th>
                <th className="text-right py-1 pr-3 font-medium">Precio</th>
                <th className="text-right py-1 pr-3 font-medium">Vendidas</th>
                <th className="text-right py-1 font-medium">Cupos</th>
              </tr>
            </thead>
            <tbody>
              {ticketTiers.map((tier) => (
                <tr key={tier.id} className="border-b border-slate-200">
                  <td className="py-1 pr-3">{tier.label}</td>
                  <td className="py-1 pr-3 text-right">{formatCents(tier.unitPrice)}</td>
                  <td className="py-1 pr-3 text-right">{tier.quantitySold}</td>
                  <td className="py-1 text-right">{tier.capacity ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="no-print space-y-3">
        {ticketTiers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin tramos agregados todavía. Puedes agregarlos a mano o subir un pantallazo de tu plataforma de
            tickets (PortalTickets, Passline, etc.) para que se lean solos.
          </p>
        ) : (
          <SortableList
            items={ticketTiers}
            onReorder={(items) => state.edit(() => items)}
            renderItem={(tier) => {
              function updateTier(patch: Partial<TicketTier>) {
                state.edit((prev) => prev.map((t) => (t.id === tier.id ? { ...t, ...patch } : t)));
              }
              return (
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    placeholder="Tramo (ej. Preventa 1)"
                    value={tier.label}
                    onChange={(e) => updateTier({ label: e.target.value })}
                    className="h-7 text-xs w-full sm:flex-1 sm:w-auto"
                  />
                  <div className="w-20 sm:w-28 shrink-0">
                    <MoneyInput
                      placeholder="Precio"
                      value={tier.unitPrice ? String(tier.unitPrice / 100) : ""}
                      onChange={(digits) => updateTier({ unitPrice: digits ? parseInt(digits, 10) * 100 : 0 })}
                      className="h-7 text-xs"
                    />
                  </div>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="Vendidas"
                    value={tier.quantitySold || ""}
                    onChange={(e) => updateTier({ quantitySold: parseInt(e.target.value, 10) || 0 })}
                    className="h-7 text-xs w-16 sm:w-24 shrink-0"
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="Cupos"
                    value={tier.capacity ?? ""}
                    onChange={(e) => updateTier({ capacity: e.target.value ? parseInt(e.target.value, 10) : null })}
                    className="h-7 text-xs w-14 sm:w-20 shrink-0"
                  />
                  <Input
                    placeholder="Estado"
                    value={tier.statusLabel ?? ""}
                    onChange={(e) => updateTier({ statusLabel: e.target.value || null })}
                    className="h-7 text-xs w-16 sm:w-28 shrink-0"
                  />
                  <button aria-label={tier.label ? `Eliminar entrada ${tier.label}` : "Eliminar entrada"}
                    onClick={() => state.edit((prev) => prev.filter((t) => t.id !== tier.id))}
                    className="text-muted-foreground hover:text-destructive cursor-pointer p-1 shrink-0"
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              );
            }}
          />
        )}

        <div className="flex items-center gap-2 flex-wrap pt-1">
          <Input
            placeholder="Tramo nuevo"
            value={state.newTierLabel}
            onChange={(e) => state.setNewTierLabel(e.target.value)}
            className="h-7 text-xs w-full sm:flex-1 sm:w-auto"
          />
          <div className="w-20 sm:w-28 shrink-0">
            <MoneyInput placeholder="Precio" value={state.newTierPrice} onChange={state.setNewTierPrice} className="h-7 text-xs" />
          </div>
          <Input
            type="number"
            inputMode="numeric"
            placeholder="Vendidas"
            value={state.newTierQty}
            onChange={(e) => state.setNewTierQty(e.target.value)}
            className="h-7 text-xs w-16 sm:w-24 shrink-0"
          />
          <Input
            type="number"
            inputMode="numeric"
            placeholder="Cupos"
            value={state.newTierCapacity}
            onChange={(e) => state.setNewTierCapacity(e.target.value)}
            className="h-7 text-xs w-14 sm:w-20 shrink-0"
          />
          <Button aria-label="Agregar entrada"
            size="sm"
            variant="outline"
            className="h-8 shrink-0 cursor-pointer"
            disabled={!state.newTierLabel.trim()}
            onClick={state.addTier}
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
        </div>


        {ticketTiers.length > 0 && canEditCosts && (
          <TicketDiscountsPanel event={event} state={state} />
        )}

        {ticketTiers.length > 0 && (
          <div className="flex items-center justify-between border-t pt-2">
            <p className="text-sm text-muted-foreground">
              {ticketTiers.reduce((sum, t) => sum + t.quantitySold, 0)} entradas vendidas · Total:{" "}
              <span className="font-semibold text-foreground">
                {formatCents(ticketBreakdown.bruto)}
              </span>
              {ticketBreakdown.hasDescuentos && (
                <>
                  {" "}· Neto a {event.projectName || "proyecto"}:{" "}
                  <span className="font-semibold text-foreground">{formatCents(ticketBreakdown.montoProyecto)}</span>
                </>
              )}
            </p>
            <Button size="sm" variant="ghost" className="h-7 text-xs cursor-pointer no-print" onClick={state.applyToIncome}>
              Usar como Entradas del evento
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

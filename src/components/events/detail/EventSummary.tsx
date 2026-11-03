import { Card, CardContent } from "@/components/ui/card";
import type { EventDetail } from "./types";
import { formatCents } from "./utils";

// Resumen financiero (Fee / Entradas / Egresos / Utilidad). La página solo lo
// muestra si el rol puede ver costos (canViewCosts).
export function EventSummary({ event, utilidadCents }: { event: EventDetail; utilidadCents: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 print:grid-cols-4 gap-3" data-section="summary">
      <Card><CardContent className="p-3 print:p-1.5"><p className="text-xs print:text-[9px] text-muted-foreground">Fee</p><p className="font-semibold print:text-xs print:whitespace-nowrap">{formatCents(event.fee)}</p></CardContent></Card>
      <Card><CardContent className="p-3 print:p-1.5"><p className="text-xs print:text-[9px] text-muted-foreground">Entradas</p><p className="font-semibold print:text-xs print:whitespace-nowrap">{formatCents(event.ticketIncome)}</p></CardContent></Card>
      <Card><CardContent className="p-3 print:p-1.5"><p className="text-xs print:text-[9px] text-muted-foreground">Egresos</p><p className="font-semibold print:text-xs print:whitespace-nowrap">{formatCents(event.expenses)}</p></CardContent></Card>
      <Card>
        <CardContent className="p-3 print:p-1.5">
          <p className="text-xs print:text-[9px] text-muted-foreground">Utilidad</p>
          <p className={`font-semibold print:text-xs print:whitespace-nowrap ${utilidadCents >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
            {formatCents(utilidadCents)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

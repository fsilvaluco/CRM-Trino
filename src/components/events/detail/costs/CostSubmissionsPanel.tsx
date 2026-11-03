"use client";

import { Button } from "@/components/ui/button";
import { SignedFileLink } from "@/components/finances/SignedFileLink";
import { Loader2, Receipt } from "lucide-react";
import { formatCents, formatDateTime } from "../utils";
import type { CostSubmissionsState } from "../hooks/useCostSubmissions";

// Gastos reportados por el equipo pendientes de aprobar.
//
// Colores hardcodeados a propósito (no text-foreground/text-muted-foreground):
// este panel siempre se ve sobre fondo claro (amber/blanco), pero esos son
// variables de tema -- en modo oscuro resuelven a un color casi blanco y el
// texto queda invisible sobre el fondo claro. Mismo tipo de bug que el de los
// tooltips de los gráficos (ver BITACORA).
export function CostSubmissionsPanel({ state }: { state: CostSubmissionsState }) {
  const { reviewingId: reviewingSubmissionId } = state;
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 space-y-2 no-print">
      <p className="text-xs font-medium text-amber-900">Gastos reportados pendientes de aprobar</p>
      {state.submissions
        .filter((s) => s.status === "pending")
        .map((s) => (
          <div key={s.id} className="flex items-start justify-between gap-2 bg-white rounded-md p-2 border border-amber-200">
            <div className="min-w-0 text-xs space-y-0.5">
              <p className="font-medium text-slate-900">{s.label} · {formatCents(s.amount)}</p>
              <p className="text-slate-500">
                {formatDateTime(s.createdAt)}
              </p>
              <p className="text-slate-600">
                {s.category ? <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 mr-1 text-slate-700">{s.category}</span> : null}
                Reportado por {s.submitterName ?? "alguien"}{s.responsable ? ` · Responsable: ${s.responsable}` : ""}
              </p>
              {s.notes && <p className="text-slate-500 italic">{s.notes}</p>}
              {s.comprobanteUrl && (
                <SignedFileLink path={s.comprobanteUrl} className="text-emerald-700 hover:underline inline-flex items-center gap-1 mt-0.5">
                  <Receipt className="h-3 w-3" /> Ver comprobante
                </SignedFileLink>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs cursor-pointer border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                disabled={reviewingSubmissionId === s.id}
                onClick={() => {
                  const note = window.prompt(
                    `¿Rechazar "${s.label}" (${formatCents(s.amount)})? Este envío se elimina y ${s.submitterName ?? "quien lo reportó"} puede volver a enviarlo corregido.\n\nMotivo (opcional, se le avisa a la persona):`,
                    ""
                  );
                  if (note === null) return;
                  void state.review(s.id, "reject", note);
                }}
              >
                Rechazar
              </Button>
              <Button
                size="sm"
                className="h-6 px-2 text-xs cursor-pointer"
                disabled={reviewingSubmissionId === s.id}
                onClick={() => state.review(s.id, "approve")}
              >
                {reviewingSubmissionId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Aprobar"}
              </Button>
            </div>
          </div>
        ))}
    </div>
  );
}

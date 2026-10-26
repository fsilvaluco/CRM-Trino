"use client";

import { CheckCircle2, ChevronRight } from "lucide-react";
import { SEVERITY_CLASS, SEVERITY_LABEL } from "@/components/tours/labels";
import type { TourAlert } from "@/types/tours";

const TAB_FOR: Record<TourAlert["entityType"], "auspicios" | "fechas" | "tareas" | "presupuesto"> = {
  sponsorship: "auspicios",
  tour: "auspicios",
  show: "fechas",
  task: "tareas",
  budget: "presupuesto",
};

interface Props {
  alerts: TourAlert[];
  onNavigate: (tab: "auspicios" | "fechas" | "tareas" | "presupuesto") => void;
}

// Lista de "qué está atrasado o lento" -- viene calculada de v_tour_alerts.
export function AlertsList({ alerts, onNavigate }: Props) {
  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Nada atrasado por ahora.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {alerts.map((a, i) => (
        <li key={`${a.kind}-${a.entityId ?? i}`}>
          <button
            type="button"
            onClick={() => onNavigate(TAB_FOR[a.entityType])}
            className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border border-l-4 bg-card px-3 py-2 text-left hover:bg-muted/50 ${SEVERITY_CLASS[a.severity]}`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{a.title}</p>
              {a.detail && <p className="text-xs text-muted-foreground">{a.detail}</p>}
            </div>
            <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">{SEVERITY_LABEL[a.severity]}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  );
}

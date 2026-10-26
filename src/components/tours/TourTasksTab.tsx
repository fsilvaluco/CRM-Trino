"use client";

import Link from "next/link";
import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { shortDate } from "@/components/tours/labels";
import type { TourDetail } from "@/types/tours";

const STATUS_LABEL: Record<string, string> = {
  sin_empezar: "Sin empezar",
  en_curso: "En curso",
  revisar: "Revisar",
  listo: "Listo",
  descartado: "Descartado",
};

// Tareas del subproyecto de la gira. Se crean y editan en Tareas.
export function TourTasksTab({ data }: { data: TourDetail }) {
  const today = new Date().toISOString().slice(0, 10);
  const open = data.tasks.filter((t) => !["listo", "descartado"].includes(t.status));
  const done = data.tasks.filter((t) => ["listo", "descartado"].includes(t.status));

  if (!data.tour.subprojectId) {
    return <p className="text-sm text-muted-foreground">Esta gira no tiene un subproyecto de tareas asociado.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{open.length} abiertas · {done.length} cerradas</p>
        <Link href="/tasks" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          Ir a Tareas <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <ul className="divide-y rounded-xl border">
        {[...open, ...done].map((t) => {
          const overdue = t.dueDate && t.dueDate.slice(0, 10) < today && !["listo", "descartado"].includes(t.status);
          const closed = ["listo", "descartado"].includes(t.status);
          return (
            <li key={t.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${closed ? "opacity-60" : ""}`}>
              {closed ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
              <span className={`flex-1 ${closed ? "line-through" : ""}`}>{t.title}</span>
              <span className="text-xs text-muted-foreground">{STATUS_LABEL[t.status] ?? t.status}</span>
              <span className={`w-16 text-right text-xs ${overdue ? "font-medium text-red-600" : "text-muted-foreground"}`}>{shortDate(t.dueDate)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { THEME_PALETTES, type ThemeColorKey } from "@/lib/theme-palettes";
import type { TaskStatus, TaskPriority } from "@/types";

// ─── Vista Gantt de Tareas, agrupada por Campaña ─────────────────────────────
// v1: cada tarea es un punto/barra en su fecha de vencimiento (no hay fecha
// de inicio en el modelo de datos hoy, solo due_date) -- por eso se dibuja
// como una barra corta centrada en ese día, no un rango largo. Agrupa por
// subproyecto (Campaña); las tareas sin campaña van a "Sin campaña". Las
// tareas sin fecha de vencimiento no se pueden ubicar en la línea de tiempo,
// se cuentan aparte.

export interface GanttTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: number | Date | null;
  subprojectId: string | null;
  subprojectName: string | null;
  tagProjectName?: string | null;
  tagProjectColor?: string | null;
}

const DONE_STATUSES: TaskStatus[] = ["listo", "descartado"];

function toDate(d: number | Date | null): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  return new Date(d < 1e12 ? d * 1000 : d);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString("es-CL", { month: "short", year: "numeric" });
}

function dayWidthFor(totalDays: number): number {
  if (totalDays <= 45) return 32;
  if (totalDays <= 90) return 18;
  if (totalDays <= 200) return 9;
  return 5;
}

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  high: "#ef4444",
  medium: "#3b82f6",
  low: "#94a3b8",
};

function resolveProjectHex(color?: string | null): string | null {
  if (!color || !(color in THEME_PALETTES)) return null;
  return THEME_PALETTES[color as ThemeColorKey].primary;
}

const LABEL_WIDTH = 260;
const ROW_HEIGHT = 36;

export function TaskGanttView({
  tasks,
  onTaskClick,
}: {
  tasks: GanttTask[];
  onTaskClick?: (id: string) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const { withDate, withoutDateCount } = useMemo(() => {
    const withDate = tasks
      .map((t) => ({ ...t, _due: toDate(t.dueDate) }))
      .filter((t): t is GanttTask & { _due: Date } => t._due !== null);
    return { withDate, withoutDateCount: tasks.length - withDate.length };
  }, [tasks]);

  const groups = useMemo(() => {
    const byKey = new Map<string, { key: string; name: string; items: (GanttTask & { _due: Date })[] }>();
    for (const t of withDate) {
      const key = t.subprojectId ?? "__none__";
      const name = t.subprojectName ?? "Sin campaña";
      if (!byKey.has(key)) byKey.set(key, { key, name, items: [] });
      byKey.get(key)!.items.push(t);
    }
    const list = [...byKey.values()];
    for (const g of list) g.items.sort((a, b) => a._due.getTime() - b._due.getTime());
    list.sort((a, b) => {
      if (a.key === "__none__") return 1;
      if (b.key === "__none__") return -1;
      return a.items[0]._due.getTime() - b.items[0]._due.getTime();
    });
    return list;
  }, [withDate]);

  const { rangeStart, totalDays, dayWidth, months, todayX } = useMemo(() => {
    const today = startOfDay(new Date());
    let min = today;
    let max = addDays(today, 14);
    for (const t of withDate) {
      const d = startOfDay(t._due);
      if (d < min) min = d;
      if (d > max) max = d;
    }
    const rangeStart = addDays(min, -4);
    const rangeEnd = addDays(max, 4);
    const totalDays = Math.max(daysBetween(rangeStart, rangeEnd), 14);
    const dayWidth = dayWidthFor(totalDays);

    const months: { x: number; label: string }[] = [];
    const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    while (cursor <= rangeEnd) {
      months.push({ x: Math.max(0, daysBetween(rangeStart, cursor)) * dayWidth, label: monthLabel(cursor) });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const todayX = daysBetween(rangeStart, today) * dayWidth;

    return { rangeStart, totalDays, dayWidth, months, todayX };
  }, [withDate]);

  const timelineWidth = totalDays * dayWidth;
  const totalWidth = LABEL_WIDTH + timelineWidth;

  if (withDate.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        No hay tareas con fecha de vencimiento para mostrar en la línea de tiempo.
        {withoutDateCount > 0 && (
          <p className="mt-1">{withoutDateCount} tarea{withoutDateCount > 1 ? "s" : ""} sin fecha no se muestra{withoutDateCount > 1 ? "n" : ""} aquí.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border overflow-auto max-h-[70vh]" style={{ width: "100%" }}>
        <div style={{ width: totalWidth, position: "relative" }}>
          <div className="sticky top-0 z-20 flex bg-background border-b" style={{ height: 32 }}>
            <div className="sticky left-0 z-30 bg-background border-r shrink-0" style={{ width: LABEL_WIDTH }} />
            <div className="relative" style={{ width: timelineWidth }}>
              {months.map((m, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full border-l text-xs text-muted-foreground px-1.5 flex items-center capitalize"
                  style={{ left: m.x }}
                >
                  {m.label}
                </div>
              ))}
            </div>
          </div>

          {groups.map((group) => (
            <div key={group.key}>
              <div className="flex bg-muted/40 border-b" style={{ height: 30 }}>
                <div
                  className="sticky left-0 z-10 bg-muted/40 border-r shrink-0 flex items-center px-3 text-xs font-semibold truncate"
                  style={{ width: LABEL_WIDTH }}
                  title={group.name}
                >
                  {group.name}
                  <span className="ml-1.5 text-muted-foreground font-normal">({group.items.length})</span>
                </div>
                <div className="relative" style={{ width: timelineWidth }} />
              </div>

              {group.items.map((task) => {
                const isOverdue = !DONE_STATUSES.includes(task.status) && startOfDay(task._due) < startOfDay(new Date());
                const x = daysBetween(rangeStart, task._due) * dayWidth;
                const barWidth = Math.max(dayWidth * 0.85, 6);
                const hex = resolveProjectHex(task.tagProjectColor) ?? PRIORITY_COLOR[task.priority];
                const isHovered = hoveredId === task.id;

                return (
                  <div key={task.id} className="flex border-b hover:bg-muted/30 transition-colors" style={{ height: ROW_HEIGHT }}>
                    <div
                      className="sticky left-0 z-10 bg-background border-r shrink-0 flex items-center gap-1.5 px-3 text-xs truncate cursor-pointer"
                      style={{ width: LABEL_WIDTH }}
                      title={task.title}
                      onClick={() => onTaskClick?.(task.id)}
                    >
                      {isOverdue && <AlertCircle className="h-3 w-3 text-destructive shrink-0" />}
                      <span className="truncate">{task.title}</span>
                    </div>
                    <div className="relative" style={{ width: timelineWidth }}>
                      <div
                        className="absolute top-1/2 -translate-y-1/2 rounded-full cursor-pointer"
                        style={{
                          left: x - barWidth / 2,
                          width: barWidth,
                          height: 12,
                          backgroundColor: hex,
                          boxShadow: isOverdue ? "0 0 0 2px #ef4444" : undefined,
                          opacity: isHovered ? 1 : 0.9,
                        }}
                        onMouseEnter={() => setHoveredId(task.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={() => onTaskClick?.(task.id)}
                        title={`${task.title} — ${task._due.toLocaleDateString("es-CL")}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          <div
            className="absolute top-8 bottom-0 border-l border-dashed border-red-400 pointer-events-none z-10"
            style={{ left: LABEL_WIDTH + todayX }}
          />
        </div>
      </div>
      {withoutDateCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {withoutDateCount} tarea{withoutDateCount > 1 ? "s" : ""} sin fecha de vencimiento no se muestra{withoutDateCount > 1 ? "n" : ""} aquí.
        </p>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/EmptyState";
import { TaskForm } from "@/components/tasks/TaskForm";
import { TaskKanbanBoard, STATUS_LABELS } from "@/components/tasks/TaskKanbanBoard";
import type { TaskCard } from "@/components/tasks/TaskKanbanBoard";
import { TaskDetailSheet, DEFAULT_PANEL_WIDTH } from "@/components/tasks/TaskDetailSheet";
import type { TaskPatch } from "@/components/tasks/TaskDetailSheet";
import {
  TaskFilterBar,
  DEFAULT_FILTERS,
  countActiveFilters,
} from "@/components/tasks/TaskFilterBar";
import type { TaskFilters, SortKey, FilterOptions } from "@/components/tasks/TaskFilterBar";
import {
  CheckSquare, Plus, Circle, CheckCircle2, Clock,
  Trash2, AlertCircle, Layers,
} from "lucide-react";
import { formatDate } from "@/lib/constants";
import { toast } from "sonner";
import type { TaskStatus, TaskPriority } from "@/types";
import { useProject } from "@/lib/project-context";

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; className: string }> = {
  low:    { label: "Baja",  className: "bg-slate-100 text-slate-600" },
  medium: { label: "Media", className: "bg-blue-100 text-blue-700" },
  high:   { label: "Alta",  className: "bg-red-100 text-red-700" },
};

const DONE_STATUSES: TaskStatus[] = ["listo", "descartado"];

interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: number | Date | null;
  contactId: string | null;
  companyId: string | null;
  dealId: string | null;
  projectId: string | null;
  subprojectId: string | null;
  completedAt: number | Date | null;
  createdAt: number | Date;
  contactName?: string | null;
  companyName?: string | null;
  dealTitle?: string | null;
  projectName?: string | null;
  subprojectName?: string | null;
}

function toMs(d: number | Date | null | undefined): number {
  if (!d) return 0;
  if (d instanceof Date) return d.getTime();
  return d < 1e12 ? d * 1000 : d;
}

function isOverdue(dueDate: number | Date | null, status: TaskStatus): boolean {
  if (!dueDate || DONE_STATUSES.includes(status)) return false;
  return new Date(toMs(dueDate)) < new Date();
}

const PANEL_STORAGE_KEY = "task-panel-width";
const MIN_PANEL_WIDTH = 420;
const MAX_PANEL_FRACTION = 0.65;
const MAX_KANBAN_PANEL_FRACTION = 0.70;

// ─── Sort comparator ──────────────────────────────────────────────────────────

function sortTasks(tasks: TaskItem[], sortBy: SortKey): TaskItem[] {
  if (sortBy === "default") return tasks;
  return [...tasks].sort((a, b) => {
    switch (sortBy) {
      case "alpha_asc":    return a.title.localeCompare(b.title);
      case "alpha_desc":   return b.title.localeCompare(a.title);
      case "due_asc": {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return toMs(a.dueDate) - toMs(b.dueDate);
      }
      case "due_desc": {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return toMs(b.dueDate) - toMs(a.dueDate);
      }
      case "created_asc":  return toMs(a.createdAt) - toMs(b.createdAt);
      case "created_desc": return toMs(b.createdAt) - toMs(a.createdAt);
      case "priority": {
        const order: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
        return order[a.priority] - order[b.priority];
      }
      case "status": {
        const order: Record<TaskStatus, number> = {
          sin_empezar: 0, en_curso: 1, revisar: 2, listo: 3, descartado: 4,
        };
        return order[a.status] - order[b.status];
      }
      default: return 0;
    }
  });
}

// ─── Filter predicate ─────────────────────────────────────────────────────────

function applyFilters(tasks: TaskItem[], f: TaskFilters): TaskItem[] {
  return tasks.filter((t) => {
    if (f.status !== "all" && t.status !== f.status) return false;
    if (f.priority !== "all" && t.priority !== f.priority) return false;
    if (f.projectId !== "all" && t.projectId !== f.projectId) return false;
    if (f.subprojectId !== "all" && t.subprojectId !== f.subprojectId) return false;
    if (f.companyId !== "all" && t.companyId !== f.companyId) return false;
    if (f.contactId !== "all" && t.contactId !== f.contactId) return false;
    if (f.dealId !== "all" && t.dealId !== f.dealId) return false;
    if (f.overdue && !isOverdue(t.dueDate, t.status)) return false;
    if (f.hasDueDate && !t.dueDate) return false;
    if (f.hasNoDate && t.dueDate) return false;
    if (f.completed === "yes" && !DONE_STATUSES.includes(t.status)) return false;
    if (f.completed === "no" && DONE_STATUSES.includes(t.status)) return false;
    return true;
  });
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function TasksPage() {
  const { activeProject } = useProject();
  const [taskList, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState<"kanban" | "lista">("kanban");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Filters & sort
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS);
  const [sortBy, setSortBy] = useState<SortKey>("default");

  // ── Resizable panel ──────────────────────────────────────────────────────
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_PANEL_WIDTH;
    const saved = localStorage.getItem(PANEL_STORAGE_KEY);
    const parsed = saved ? parseInt(saved, 10) : DEFAULT_PANEL_WIDTH;
    return Math.min(
      Math.max(MIN_PANEL_WIDTH, isNaN(parsed) ? DEFAULT_PANEL_WIDTH : parsed),
      Math.round(window.innerWidth * MAX_PANEL_FRACTION)
    );
  });
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  const rafRef = useRef<number>(0);
  const [isResizingActive, setIsResizingActive] = useState(false);

  // Resize para vista Lista (relativo al contenedor split)
  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isResizing.current = true;
    setIsResizingActive(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onPointerMove = (ev: PointerEvent) => {
      if (!isResizing.current || !splitContainerRef.current) return;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const rect = splitContainerRef.current!.getBoundingClientRect();
        const newWidth = Math.round(rect.right - ev.clientX);
        const maxWidth = Math.round(rect.width * MAX_PANEL_FRACTION);
        setPanelWidth(Math.min(Math.max(newWidth, MIN_PANEL_WIDTH), maxWidth));
      });
    };

    const onPointerUp = () => {
      isResizing.current = false;
      setIsResizingActive(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      cancelAnimationFrame(rafRef.current);
      setPanelWidth((w) => { localStorage.setItem(PANEL_STORAGE_KEY, String(w)); return w; });
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }, []);

  // Resize para vista Kanban (panel fixed → relativo a window.innerWidth)
  const handleKanbanResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isResizing.current = true;
    setIsResizingActive(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onPointerMove = (ev: PointerEvent) => {
      if (!isResizing.current) return;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const newWidth = Math.round(window.innerWidth - ev.clientX);
        const maxWidth = Math.round(window.innerWidth * MAX_KANBAN_PANEL_FRACTION);
        setPanelWidth(Math.min(Math.max(newWidth, MIN_PANEL_WIDTH), maxWidth));
      });
    };

    const onPointerUp = () => {
      isResizing.current = false;
      setIsResizingActive(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      cancelAnimationFrame(rafRef.current);
      setPanelWidth((w) => { localStorage.setItem(PANEL_STORAGE_KEY, String(w)); return w; });
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }, []);

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadTasks = useCallback(() => {
    const url = activeProject ? `/api/tasks?projectId=${activeProject.id}` : "/api/tasks";
    fetch(url)
      .then((r) => r.json())
      .then((data) => { setTasks(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [activeProject]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // ── Filter options derived from task list ────────────────────────────────

  const filterOptions: FilterOptions = useMemo(() => {
    const projects = new Map<string, string>();
    const subprojects = new Map<string, string>();
    const companies = new Map<string, string>();
    const contacts = new Map<string, string>();
    const deals = new Map<string, string>();

    for (const t of taskList) {
      if (t.projectId && t.projectName)       projects.set(t.projectId, t.projectName);
      if (t.subprojectId && t.subprojectName) subprojects.set(t.subprojectId, t.subprojectName);
      if (t.companyId && t.companyName)       companies.set(t.companyId, t.companyName);
      if (t.contactId && t.contactName)       contacts.set(t.contactId, t.contactName);
      if (t.dealId && t.dealTitle)            deals.set(t.dealId, t.dealTitle);
    }

    const toArr = (m: Map<string, string>) =>
      [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));

    return {
      projects:    toArr(projects),
      subprojects: toArr(subprojects),
      companies:   toArr(companies),
      contacts:    toArr(contacts),
      deals:       toArr(deals),
    };
  }, [taskList]);

  // ── Filtered + sorted tasks (used by both List and Kanban) ───────────────

  const filteredAndSortedTasks = useMemo(
    () => sortTasks(applyFilters(taskList, filters), sortBy),
    [taskList, filters, sortBy]
  );

  // ── Actions ──────────────────────────────────────────────────────────────

  const updateStatus = async (id: string, status: TaskStatus) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      loadTasks();
    } catch {
      toast.error("Error al actualizar tarea");
    }
  };

  const handleTaskUpdated = useCallback((patch: TaskPatch) => {
    setTasks((prev) =>
      prev.map((t) => t.id === patch.id ? { ...t, ...(patch as Partial<TaskItem>) } : t)
    );
    loadTasks();
  }, [loadTasks]);

  const deleteTask = async (id: string) => {
    try {
      await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      toast.success("Tarea eliminada");
      loadTasks();
    } catch {
      toast.error("Error al eliminar tarea");
    }
  };

  // ── Derived values ───────────────────────────────────────────────────────

  const kanbanCards: TaskCard[] = filteredAndSortedTasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate,
    contactName: t.contactName,
    projectName: t.projectName,
  }));

  const pendingCount = taskList.filter((t) => !DONE_STATUSES.includes(t.status)).length;
  const overdueCount = taskList.filter((t) => isOverdue(t.dueDate, t.status)).length;
  const activeFilterCount = countActiveFilters(filters);

  // ── Loading skeleton ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Tareas</h1>
        <div className="flex gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="w-64 h-48 bg-muted rounded-lg animate-pulse shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  // ── Shared JSX pieces ────────────────────────────────────────────────────

  const pageHeader = (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tareas</h1>
        <p className="text-muted-foreground">
          {pendingCount} pendiente{pendingCount !== 1 ? "s" : ""}
          {overdueCount > 0 && (
            <span className="text-destructive ml-2">
              · {overdueCount} vencida{overdueCount !== 1 ? "s" : ""}
            </span>
          )}
        </p>
      </div>
      <Button onClick={() => setShowForm(true)} className="cursor-pointer">
        <Plus className="h-4 w-4 mr-2" />
        Nueva Tarea
      </Button>
    </div>
  );

  const filterBar = (
    <TaskFilterBar
      filters={filters}
      sortBy={sortBy}
      onFiltersChange={setFilters}
      onSortChange={setSortBy}
      options={filterOptions}
      totalCount={taskList.length}
      filteredCount={filteredAndSortedTasks.length}
    />
  );

  const tabsContent = (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "kanban" | "lista")}>
      <TabsList>
        <TabsTrigger value="kanban" className="cursor-pointer">Kanban</TabsTrigger>
        <TabsTrigger value="lista" className="cursor-pointer">Lista</TabsTrigger>
      </TabsList>

      {/* ── KANBAN VIEW ── */}
      <TabsContent value="kanban" className="mt-4">
        {filteredAndSortedTasks.length === 0 ? (
          <EmptyState
            icon={CheckSquare}
            title={activeFilterCount > 0 ? "Sin resultados" : "Sin tareas"}
            description={
              activeFilterCount > 0
                ? "Ninguna tarea coincide con los filtros activos."
                : "Crea tu primera tarea para empezar."
            }
            actionLabel={activeFilterCount > 0 ? undefined : "Nueva Tarea"}
            onAction={activeFilterCount > 0 ? undefined : () => setShowForm(true)}
          />
        ) : (
          <TaskKanbanBoard
            tasks={kanbanCards}
            onTaskMoved={async (taskId, newStatus) => { await updateStatus(taskId, newStatus); }}
            onTaskClick={(id) => setSelectedTaskId(id)}
          />
        )}
      </TabsContent>

      {/* ── LIST VIEW ── */}
      <TabsContent value="lista" className="mt-4">
        <Card>
          <CardContent className="p-0">
            {filteredAndSortedTasks.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={CheckSquare}
                  title={activeFilterCount > 0 ? "Sin resultados" : "Sin tareas"}
                  description={
                    activeFilterCount > 0
                      ? "Ninguna tarea coincide con los filtros activos."
                      : "No hay tareas que mostrar."
                  }
                />
              </div>
            ) : (
              <ul className="divide-y">
                {filteredAndSortedTasks.map((task) => {
                  const overdue = isOverdue(task.dueDate, task.status);
                  const done = DONE_STATUSES.includes(task.status);
                  const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;

                  return (
                    <li
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`flex items-start gap-3 p-4 hover:bg-muted/30 transition-colors cursor-pointer ${done ? "opacity-60" : ""}`}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextStatus: TaskStatus = done
                            ? "sin_empezar"
                            : task.status === "sin_empezar"
                            ? "en_curso"
                            : "listo";
                          updateStatus(task.id, nextStatus);
                        }}
                        className="mt-0.5 shrink-0 cursor-pointer text-muted-foreground hover:text-primary transition-colors"
                        title="Cambiar estado"
                      >
                        {done ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : task.status === "en_curso" || task.status === "revisar" ? (
                          <Clock className="h-5 w-5 text-blue-500" />
                        ) : (
                          <Circle className="h-5 w-5" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>
                            {task.title}
                          </span>
                          <Badge className={`text-xs ${priority.className}`} variant="secondary">
                            {priority.label}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {STATUS_LABELS[task.status]}
                          </Badge>
                          {overdue && (
                            <span className="flex items-center gap-1 text-xs text-destructive">
                              <AlertCircle className="h-3 w-3" />
                              Vencida
                            </span>
                          )}
                        </div>

                        {task.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.description}</p>
                        )}

                        <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
                          {task.dueDate && (
                            <span className={overdue ? "text-destructive" : ""}>
                              Vence: {formatDate(task.dueDate)}
                            </span>
                          )}
                          {task.contactName && <span>{task.contactName}</span>}
                          {task.companyName && <span>{task.companyName}</span>}
                          {task.projectName && (
                            <span className="flex items-center gap-1">
                              <Layers className="h-3 w-3" />
                              {task.projectName}
                              {task.subprojectName && ` › ${task.subprojectName}`}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                        className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer shrink-0"
                        title="Eliminar tarea"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );

  const taskFormDialog = (
    <TaskForm open={showForm} onClose={() => { setShowForm(false); loadTasks(); }} />
  );

  // ── Vista Lista con tarea seleccionada: split layout ─────────────────────

  if (selectedTaskId && activeTab === "lista") {
    return (
      <>
        {taskFormDialog}
        <div
          ref={splitContainerRef}
          className="-m-4 md:-m-6 flex overflow-hidden"
          style={{ height: "calc(100vh - 4rem)" }}
        >
          <div className="flex-1 min-w-0 overflow-auto p-4 md:p-6">
            <div className="space-y-4">
              {pageHeader}
              {filterBar}
              {tabsContent}
            </div>
          </div>

          <div
            onPointerDown={handleResizeStart}
            style={{ width: 6, flexShrink: 0, touchAction: "none" }}
            className={`cursor-col-resize transition-colors duration-75 ${
              isResizingActive ? "bg-primary" : "bg-border hover:bg-primary/50"
            }`}
          />

          <div
            style={{ width: panelWidth, flexShrink: 0 }}
            className="flex flex-col overflow-hidden border-l bg-background"
          >
            <TaskDetailSheet
              taskId={selectedTaskId}
              open={true}
              onClose={() => setSelectedTaskId(null)}
              onUpdated={handleTaskUpdated}
              panelMode={true}
              panelWidth={panelWidth}
            />
          </div>
        </div>
      </>
    );
  }

  // ── Layout normal (Kanban con o sin tarea, Lista sin tarea) ──────────────

  return (
    <div className="space-y-4">
      {taskFormDialog}
      {pageHeader}
      {filterBar}
      {tabsContent}

      {/* Kanban con tarea: overlay superpuesto + redimensionable */}
      {selectedTaskId && activeTab === "kanban" && (
        <>
          {/* Capa 2: overlay sin blur */}
          <div
            onClick={() => setSelectedTaskId(null)}
            style={{
              position: "fixed",
              inset: 0,
              top: 64,
              zIndex: 30,
              backgroundColor: "rgba(0,0,0,0.25)",
            }}
          />

          {/* Handle de resize (z-index 50) */}
          <div
            onPointerDown={handleKanbanResizeStart}
            style={{
              position: "fixed",
              top: 64,
              bottom: 0,
              right: panelWidth,
              width: 6,
              zIndex: 50,
              cursor: "col-resize",
              touchAction: "none",
              backgroundColor: isResizingActive ? "var(--primary)" : "transparent",
              transition: "background-color 75ms",
            }}
            onMouseEnter={(e) => {
              if (!isResizingActive)
                e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--primary) 50%, transparent)";
            }}
            onMouseLeave={(e) => {
              if (!isResizingActive)
                e.currentTarget.style.backgroundColor = "transparent";
            }}
          />

          {/* Capa 3: panel sólido (z-index 40, encima del overlay) */}
          <div
            style={{
              position: "fixed",
              top: 64,
              bottom: 0,
              right: 0,
              width: panelWidth,
              zIndex: 40,
              display: "flex",
              flexDirection: "column",
              isolation: "isolate",
              backgroundColor: "var(--background)",
              borderLeft: "1px solid var(--border)",
              boxShadow: "-8px 0 32px rgba(0,0,0,0.12)",
            }}
          >
            <TaskDetailSheet
              taskId={selectedTaskId}
              open={true}
              onClose={() => setSelectedTaskId(null)}
              onUpdated={handleTaskUpdated}
              panelMode={true}
              panelWidth={panelWidth}
            />
          </div>
        </>
      )}
    </div>
  );
}

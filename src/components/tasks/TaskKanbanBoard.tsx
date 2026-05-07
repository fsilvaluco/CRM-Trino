"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/constants";
import type { TaskStatus, TaskPriority } from "@/types";

// ─── Column definitions ──────────────────────────────────────────────────────

export interface TaskKanbanColumn {
  id: string;         // column ID = group key
  label: string;      // display name
  statuses: TaskStatus[];
  color: string;
}

export const TASK_COLUMNS: TaskKanbanColumn[] = [
  { id: "sin_empezar", label: "Sin empezar", statuses: ["sin_empezar"], color: "#64748b" },
  { id: "en_curso",    label: "En curso",    statuses: ["en_curso"],    color: "#2563eb" },
  { id: "revisar",     label: "Revisar",     statuses: ["revisar"],     color: "#3b82f6" },
  { id: "listo",       label: "Listo",       statuses: ["listo"],       color: "#16a34a" },
  { id: "descartado",  label: "Descartado",  statuses: ["descartado"],  color: "#f59e0b" },
];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  sin_empezar: "Sin empezar",
  en_curso:    "En curso",
  revisar:     "Revisar",
  listo:       "Listo",
  descartado:  "Descartado",
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; className: string }> = {
  low:    { label: "Baja",  className: "bg-slate-100 text-slate-600" },
  medium: { label: "Media", className: "bg-blue-100 text-blue-700" },
  high:   { label: "Alta",  className: "bg-red-100 text-red-700" },
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TaskCard {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: number | Date | null;
  contactName?: string | null;
  projectName?: string | null;
  assignees?: Array<{
    userId: string;
    profile?: {
      fullName: string | null;
      avatarUrl: string | null;
      email: string | null;
    } | null;
  }>;
}

// ─── Draggable task card ──────────────────────────────────────────────────────

function DraggableTaskCard({
  task,
  isDragging = false,
  onTaskClick,
}: {
  task: TaskCard;
  isDragging?: boolean;
  onTaskClick?: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: task.id });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const isOverdue =
    task.dueDate &&
    task.status !== "listo" &&
    task.status !== "descartado" &&
    new Date(typeof task.dueDate === "number" ? task.dueDate * 1000 : task.dueDate) < new Date();

  const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onTaskClick?.(task.id)}
      className={`bg-card border rounded-lg p-3 shadow-sm cursor-pointer active:cursor-grabbing select-none ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <p className="text-sm font-medium leading-snug">{task.title}</p>

      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <Badge className={`text-xs ${priority.className}`} variant="secondary">
          {priority.label}
        </Badge>
        <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">
          {STATUS_LABELS[task.status]}
        </Badge>
      </div>

      {(task.dueDate || task.contactName || task.projectName || (task.assignees && task.assignees.length > 0)) && (
        <div className="mt-2 space-y-0.5">
          {task.dueDate && (
            <p className={`text-xs flex items-center gap-1 ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}>
              {isOverdue ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              {formatDate(task.dueDate)}
            </p>
          )}
          {task.contactName && (
            <p className="text-xs text-muted-foreground">{task.contactName}</p>
          )}
          {task.projectName && (
            <p className="text-xs text-muted-foreground">{task.projectName}</p>
          )}
          {task.assignees && task.assignees.length > 0 && (
            <div className="flex items-center gap-1 mt-1">
              {task.assignees.slice(0, 3).map((assignee, idx) => {
                const displayName = assignee.profile?.fullName || assignee.profile?.email || "?";
                const initials = displayName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2);
                return (
                  <div
                    key={assignee.userId}
                    className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium"
                    style={{ marginLeft: idx > 0 ? "-8px" : "0" }}
                    title={displayName}
                  >
                    {initials}
                  </div>
                );
              })}
              {task.assignees.length > 3 && (
                <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs flex items-center justify-center font-medium" style={{ marginLeft: "-8px" }}>
                  +{task.assignees.length - 3}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Droppable column ─────────────────────────────────────────────────────────

function DroppableColumn({
  column,
  tasks,
  activeId,
  onTaskClick,
}: {
  column: TaskKanbanColumn;
  tasks: TaskCard[];
  activeId: string | null;
  onTaskClick?: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div className="flex flex-col w-64 shrink-0">
      <div
        className="flex items-center justify-between mb-3 px-1"
      >
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: column.color }}
          />
          <span className="text-sm font-semibold">{column.label}</span>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {tasks.length}
          </span>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={`flex flex-col gap-2 min-h-32 p-2 rounded-lg border-2 border-dashed transition-colors ${
          isOver ? "border-primary/50 bg-primary/5" : "border-transparent bg-muted/30"
        }`}
      >
        {tasks.map((task) => (
          <DraggableTaskCard
            key={task.id}
            task={task}
            isDragging={activeId === task.id}
            onTaskClick={onTaskClick}
          />
        ))}
        {tasks.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Sin tareas
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main board ───────────────────────────────────────────────────────────────

interface TaskKanbanBoardProps {
  tasks: TaskCard[];
  onTaskMoved: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  onTaskClick?: (taskId: string) => void;
}

export function TaskKanbanBoard({ tasks, onTaskMoved, onTaskClick }: TaskKanbanBoardProps) {
  const [localTasks, setLocalTasks] = useState(tasks);
  const snapshot = useRef(tasks);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Sync with parent whenever tasks prop changes, but not during an active drag
  useEffect(() => {
    if (!activeId) {
      setLocalTasks(tasks);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const getColumnForTask = useCallback(
    (status: TaskStatus) =>
      TASK_COLUMNS.find((col) => col.statuses.includes(status)),
    []
  );

  const getTasksForColumn = useCallback(
    (col: TaskKanbanColumn) =>
      localTasks.filter((t) => col.statuses.includes(t.status)),
    [localTasks]
  );

  const activeTask = activeId ? localTasks.find((t) => t.id === activeId) : null;

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveId(event.active.id as string);
      snapshot.current = localTasks;
    },
    [localTasks]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over) return;

      const taskId = active.id as string;
      const targetColumnId = over.id as string;
      const targetColumn = TASK_COLUMNS.find((c) => c.id === targetColumnId);

      if (!targetColumn) return;

      const task = localTasks.find((t) => t.id === taskId);
      if (!task) return;

      const currentColumn = getColumnForTask(task.status);
      if (currentColumn?.id === targetColumn.id) return;

      // Pick the first status of the target column
      const newStatus = targetColumn.statuses[0];

      // Optimistic update
      setLocalTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      );

      try {
        await onTaskMoved(taskId, newStatus);
      } catch {
        setLocalTasks(snapshot.current);
        toast.error("Error al mover la tarea");
      }
    },
    [localTasks, getColumnForTask, onTaskMoved]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {TASK_COLUMNS.map((col) => (
          <DroppableColumn
            key={col.id}
            column={col}
            tasks={getTasksForColumn(col)}
            activeId={activeId}
            onTaskClick={onTaskClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <DraggableTaskCard task={activeTask} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,  // still used for Status and Priority selects
} from "@/components/ui/select";
import { toast } from "sonner";
import { Send, User, Calendar, X } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { TaskStatus, TaskPriority, TaskComment } from "@/types";
import { STATUS_LABELS } from "@/components/tasks/TaskKanbanBoard";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TaskDetail {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | number | null;
  contactId: string | null;
  companyId: string | null;
  dealId: string | null;
  projectId: string | null;
  subprojectId: string | null;
  completedAt: string | number | null;
  contactName: string | null;
  companyName: string | null;
  dealTitle: string | null;
  projectName: string | null;
  subprojectName: string | null;
  comments: TaskComment[];
}

interface Relation {
  id: string;
  name: string;
}

// Fields the parent needs to apply immediate optimistic updates
export interface TaskPatch {
  id: string;
  title?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | number | null;
  contactId?: string | null;
  companyId?: string | null;
  dealId?: string | null;
  projectId?: string | null;
  subprojectId?: string | null;
}

export const DEFAULT_PANEL_WIDTH = 520;

interface TaskDetailSheetProps {
  taskId: string | null;
  open: boolean;
  onClose: () => void;
  onUpdated: (patch: TaskPatch) => void;
  /** When true, renders as an inline resizable panel instead of a Sheet overlay */
  panelMode?: boolean;
  panelWidth?: number;
}

// ─── Priority config ─────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; className: string }> = {
  low:    { label: "Baja",  className: "bg-slate-100 text-slate-600" },
  medium: { label: "Media", className: "bg-blue-100 text-blue-700" },
  high:   { label: "Alta",  className: "bg-red-100 text-red-700" },
};

const ALL_STATUSES: TaskStatus[] = [
  "sin_empezar", "en_curso", "revisar", "listo", "descartado",
];

// ─── Comment item ─────────────────────────────────────────────────────────────

function CommentItem({ comment }: { comment: TaskComment }) {
  const date = comment.createdAt instanceof Date
    ? comment.createdAt
    : new Date(
        typeof comment.createdAt === "number" && comment.createdAt < 1e12
          ? comment.createdAt * 1000
          : comment.createdAt
      );

  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <User className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">{comment.author}</span>
          <span className="text-xs text-muted-foreground">
            {format(date, "d MMM yyyy, HH:mm", { locale: es })}
          </span>
        </div>
        <p className="text-sm text-foreground whitespace-pre-wrap break-words">{comment.content}</p>
      </div>
    </div>
  );
}

// ─── Field wrappers ───────────────────────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-start gap-2 py-2 border-b last:border-0">
      <span className="text-xs text-muted-foreground pt-2 font-medium">{label}</span>
      <div>{children}</div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TaskDetailSheet({ taskId, open, onClose, onUpdated, panelMode = false, panelWidth = DEFAULT_PANEL_WIDTH }: TaskDetailSheetProps) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  // Relation options
  const [contacts, setContacts] = useState<Relation[]>([]);
  const [companies, setCompanies] = useState<Relation[]>([]);
  const [deals, setDeals] = useState<Relation[]>([]);
  const [subprojects, setSubprojects] = useState<Relation[]>([]);

  // Description auto-save
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadTask = useCallback(() => {
    if (!taskId) return;
    setLoading(true);
    fetch(`/api/tasks/${taskId}`)
      .then((r) => r.json())
      .then((data) => {
        setTask(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [taskId]);

  useEffect(() => {
    if (open && taskId) loadTask();
  }, [open, taskId, loadTask]);

  // Cargar contactos/empresas/deals filtrados por el proyecto de la tarea
  useEffect(() => {
    if (!task?.projectId) return;
    const pid = task.projectId;
    Promise.all([
      fetch(`/api/contacts?projectId=${pid}`).then((r) => r.json()),
      fetch(`/api/companies?projectId=${pid}`).then((r) => r.json()),
      fetch(`/api/deals?projectId=${pid}`).then((r) => r.json()),
    ]).then(([c, co, d]) => {
      setContacts((c as Array<{ id: string; name: string }>).map((x) => ({ id: x.id, name: x.name })));
      setCompanies((co as Array<{ id: string; name: string }>).map((x) => ({ id: x.id, name: x.name })));
      setDeals((d as Array<{ id: string; title: string }>).map((x) => ({ id: x.id, name: x.title })));
    }).catch(() => {});
  }, [task?.projectId]);

  // Pre-seed relation arrays with the task's current relation names so the
  // Select shows a readable label immediately (before the full list loads)
  useEffect(() => {
    if (!task) return;
    if (task.contactId && task.contactName) {
      setContacts((prev) =>
        prev.some((c) => c.id === task.contactId)
          ? prev
          : [{ id: task.contactId!, name: task.contactName! }, ...prev]
      );
    }
    if (task.companyId && task.companyName) {
      setCompanies((prev) =>
        prev.some((c) => c.id === task.companyId)
          ? prev
          : [{ id: task.companyId!, name: task.companyName! }, ...prev]
      );
    }
    if (task.dealId && task.dealTitle) {
      setDeals((prev) =>
        prev.some((d) => d.id === task.dealId)
          ? prev
          : [{ id: task.dealId!, name: task.dealTitle! }, ...prev]
      );
    }
    if (task.projectId && task.projectName) {
      // projects state removed — projectName shown directly from task
    }
    if (task.subprojectId && task.subprojectName) {
      setSubprojects((prev) =>
        prev.some((s) => s.id === task.subprojectId)
          ? prev
          : [{ id: task.subprojectId!, name: task.subprojectName! }, ...prev]
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  // Load subprojects when projectId changes
  useEffect(() => {
    if (!task?.projectId) {
      setSubprojects([]);
      return;
    }
    fetch(`/api/subprojects?projectId=${task.projectId}`)
      .then((r) => r.json())
      .then((data: Array<{ id: string; name: string }>) => {
        setSubprojects(data.map((x) => ({ id: x.id, name: x.name })));
      })
      .catch(() => {});
  }, [task?.projectId]);

  const patch = useCallback(async (fields: Record<string, unknown>) => {
    if (!taskId) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setTask((prev) => prev ? { ...prev, ...updated } : prev);
      // Notify parent with the updated fields so it can update Kanban immediately
      onUpdated({ id: taskId, ...updated });
    } catch {
      toast.error("Error al guardar cambios");
    }
  }, [taskId, onUpdated]);

  const handleDescriptionBlur = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (!task) return;
    const val = descriptionRef.current?.value ?? task.description ?? "";
    if (val !== (task.description ?? "")) {
      patch({ description: val || null });
    }
  };

  const handleDescriptionChange = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (!task) return;
      const val = descriptionRef.current?.value ?? "";
      if (val !== (task.description ?? "")) {
        patch({ description: val || null });
      }
    }, 1500);
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !taskId) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment.trim() }),
      });
      if (!res.ok) throw new Error();
      const comment = await res.json();
      setTask((prev) =>
        prev ? { ...prev, comments: [...prev.comments, comment] } : prev
      );
      setNewComment("");
    } catch {
      toast.error("Error al agregar comentario");
    } finally {
      setSubmittingComment(false);
    }
  };

  const formatDueDate = (val: string | number | null) => {
    if (!val) return "";
    const d = typeof val === "number"
      ? new Date(val < 1e12 ? val * 1000 : val)
      : new Date(val);
    return format(d, "yyyy-MM-dd");
  };

  if (!panelMode && !open) return null;

  const panelContent = (
    <>
      {loading || !task ? (
        <div className="p-6 space-y-4">
          <div className="h-6 bg-muted rounded animate-pulse w-3/4" />
          <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
          <div className="h-32 bg-muted rounded animate-pulse" />
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="px-6 pt-5 pb-4 border-b shrink-0 flex items-start gap-2">
            <Input
              key={task.id}
              defaultValue={task.title}
              className="text-lg font-semibold border-0 shadow-none p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 flex-1"
              onBlur={(e) => {
                const val = e.target.value.trim();
                if (val && val !== task.title) patch({ title: val });
              }}
            />
            <button
              onClick={onClose}
              className="mt-1 shrink-0 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {/* Fields */}
              <div className="px-6 py-4 border-b">
                <FieldRow label="Estado">
                  <Select
                    value={task.status}
                    onValueChange={(v) => patch({ status: v })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldRow>

                <FieldRow label="Prioridad">
                  <Select
                    value={task.priority}
                    onValueChange={(v) => patch({ priority: v })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["low", "medium", "high"] as TaskPriority[]).map((p) => (
                        <SelectItem key={p} value={p}>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${PRIORITY_CONFIG[p].className}`}>
                            {PRIORITY_CONFIG[p].label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldRow>

                <FieldRow label="Vencimiento">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Input
                      type="date"
                      defaultValue={formatDueDate(task.dueDate)}
                      className="h-8 text-sm"
                      onBlur={(e) => {
                        const val = e.target.value;
                        patch({ dueDate: val ? new Date(val).toISOString() : null });
                      }}
                    />
                  </div>
                </FieldRow>

                <FieldRow label="Contacto">
                  <Select
                    value={task.contactId ?? "__none__"}
                    onValueChange={(v) => patch({ contactId: v === "__none__" ? null : v })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      {task.contactId
                        ? <span>{contacts.find((c) => c.id === task.contactId)?.name ?? task.contactName ?? task.contactId}</span>
                        : <span className="text-muted-foreground">Sin contacto</span>}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin contacto</SelectItem>
                      {contacts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldRow>

                <FieldRow label="Empresa">
                  <Select
                    value={task.companyId ?? "__none__"}
                    onValueChange={(v) => patch({ companyId: v === "__none__" ? null : v })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      {task.companyId
                        ? <span>{companies.find((c) => c.id === task.companyId)?.name ?? task.companyName ?? task.companyId}</span>
                        : <span className="text-muted-foreground">Sin empresa</span>}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin empresa</SelectItem>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldRow>

                <FieldRow label="Deal">
                  <Select
                    value={task.dealId ?? "__none__"}
                    onValueChange={(v) => patch({ dealId: v === "__none__" ? null : v })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      {task.dealId
                        ? <span>{deals.find((d) => d.id === task.dealId)?.name ?? task.dealTitle ?? task.dealId}</span>
                        : <span className="text-muted-foreground">Sin deal</span>}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin deal</SelectItem>
                      {deals.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldRow>

                <FieldRow label="Campaña">
                  <Select
                    value={task.subprojectId ?? "__none__"}
                    onValueChange={(v) => patch({ subprojectId: v === "__none__" ? null : v })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      {task.subprojectId
                        ? <span>{subprojects.find((s) => s.id === task.subprojectId)?.name ?? task.subprojectName ?? task.subprojectId}</span>
                        : <span className="text-muted-foreground">Sin campaña</span>}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin campaña</SelectItem>
                      {subprojects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldRow>
              </div>

              {/* Description */}
              <div className="px-6 py-4 border-b">
                <p className="text-xs font-medium text-muted-foreground mb-2">Descripción</p>
                <Textarea
                  key={task.id}
                  ref={descriptionRef}
                  defaultValue={task.description ?? ""}
                  placeholder="Agrega una descripción..."
                  className="min-h-[100px] text-sm resize-none border-0 shadow-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                  onChange={handleDescriptionChange}
                  onBlur={handleDescriptionBlur}
                />
              </div>

              {/* Metadata badges */}
              <div className="px-6 py-3 border-b flex flex-wrap gap-2">
                {task.contactName && (
                  <Badge variant="outline" className="text-xs">{task.contactName}</Badge>
                )}
                {task.companyName && (
                  <Badge variant="outline" className="text-xs">{task.companyName}</Badge>
                )}
                {task.dealTitle && (
                  <Badge variant="outline" className="text-xs">{task.dealTitle}</Badge>
                )}
                {task.projectName && (
                  <Badge variant="outline" className="text-xs">
                    {task.projectName}
                    {task.subprojectName && ` › ${task.subprojectName}`}
                  </Badge>
                )}
              </div>

              {/* Comments */}
              <div className="px-6 py-4">
                <p className="text-xs font-medium text-muted-foreground mb-4">
                  Comentarios ({task.comments.length})
                </p>

                <div className="space-y-4 mb-4">
                  {task.comments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin comentarios aún.</p>
                  ) : (
                    task.comments.map((c) => <CommentItem key={c.id} comment={c} />)
                  )}
                </div>

                {/* New comment input */}
                <div className="flex gap-2 mt-2">
                  <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Escribe un comentario..."
                    className="text-sm min-h-[60px] resize-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleAddComment();
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    className="shrink-0 self-end cursor-pointer"
                    disabled={!newComment.trim() || submittingComment}
                    onClick={handleAddComment}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Cmd+Enter para enviar</p>
              </div>
            </div>
          </>
        )}
    </>
  );

  // ── Panel mode: llena el contenedor fijo que provee el padre ──────────────
  if (panelMode) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {panelContent}
      </div>
    );
  }

  // ── Sheet mode: slide-over overlay (default / mobile) ────────────────────
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl flex flex-col gap-0 p-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto flex flex-col">
          {panelContent}
        </div>
      </SheetContent>
    </Sheet>
  );
}

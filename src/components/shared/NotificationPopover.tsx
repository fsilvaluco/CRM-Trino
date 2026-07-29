"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Bell, AlertCircle, Clock, ArrowRight, AtSign, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface TaskNotification {
  id: string;
  title: string;
  dueDate: string;
  priority: string;
  projectName: string | null;
  subprojectName: string | null;
  daysOverdue?: number;
  daysUntilDue?: number;
  read: boolean;
}

interface Mention {
  id: string;
  taskId: string | null;
  taskTitle: string | null;
  dealId: string | null;
  dealTitle: string | null;
  mentionedByName: string;
  snippet: string | null;
  createdAt: string;
  readAt: string | null;
}

interface NotificationData {
  overdue: TaskNotification[];
  upcoming: TaskNotification[];
  total: number;
  unreadCount: number;
}

// Fecha + hora corta, para mostrar debajo de cada notificación.
function formatDateTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "d MMM, HH:mm", { locale: es });
}

// Estilo tipo Facebook: no leído se ve mas "presente" (fondo + texto fuerte),
// leído se ve atenuado -- pero ninguno desaparece de la lista.
function rowClassName(read: boolean) {
  return `block px-4 py-3 hover:bg-muted/50 transition-colors border-b last:border-b-0 ${
    read ? "opacity-60" : "bg-blue-50/60 dark:bg-blue-950/10"
  }`;
}

export function NotificationPopover() {
  const [data, setData] = useState<NotificationData | null>(null);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
      fetchMentions();
    }
  }, [isOpen]);

  useEffect(() => {
    fetchNotifications();
    fetchMentions();
  }, []);

  function fetchNotifications() {
    fetch("/api/task-notifications")
      .then((r) => r.json())
      .then((json) => {
        if (json?.total !== undefined) setData(json);
      })
      .catch(() => {});
  }

  function fetchMentions() {
    fetch("/api/mentions")
      .then((r) => r.json())
      .then((json) => setMentions(Array.isArray(json) ? json : []))
      .catch(() => {});
  }

  const handleMentionClick = (mentionId: string) => {
    setIsOpen(false);
    setMentions((prev) =>
      prev.map((m) => (m.id === mentionId ? { ...m, readAt: m.readAt ?? new Date().toISOString() } : m))
    );
    fetch(`/api/mentions/${mentionId}/read`, { method: "POST" }).catch(() => {});
  };

  const handleMarkAllRead = async () => {
    setMarkingAllRead(true);
    try {
      const res = await fetch("/api/notifications/mark-all-read", { method: "POST" });
      if (!res.ok) throw new Error();
      const now = new Date().toISOString();
      setMentions((prev) => prev.map((m) => ({ ...m, readAt: m.readAt ?? now })));
      setData((prev) =>
        prev
          ? {
              ...prev,
              overdue: prev.overdue.map((n) => ({ ...n, read: true })),
              upcoming: prev.upcoming.map((n) => ({ ...n, read: true })),
              unreadCount: 0,
            }
          : prev
      );
    } catch {
      // Silencioso: si falla, el badge simplemente no baja y se puede reintentar.
    } finally {
      setMarkingAllRead(false);
    }
  };

  const unreadMentions = mentions.filter((m) => !m.readAt).length;
  const totalCount = (data?.unreadCount || 0) + unreadMentions;
  const hasAnything = mentions.length > 0 || (data?.overdue.length ?? 0) > 0 || (data?.upcoming.length ?? 0) > 0;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger>
        <Button variant="ghost" size="icon" className="relative cursor-pointer">
          <Bell className="h-5 w-5" />
          {totalCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs font-medium flex items-center justify-center">
              {totalCount > 9 ? "9+" : totalCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="border-b px-4 py-3">
          <h3 className="font-semibold text-sm">Notificaciones</h3>
          {!hasAnything && (
            <p className="text-xs text-muted-foreground mt-1">
              No hay alertas pendientes
            </p>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {/* Menciones */}
          {mentions.length > 0 && (
            <div className="border-b">
              <div className="px-4 py-2 bg-blue-50 dark:bg-blue-950/20">
                <h4 className="text-xs font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                  <AtSign className="h-3.5 w-3.5" />
                  Menciones ({mentions.length})
                </h4>
              </div>
              {mentions.map((mention) => (
                <Link
                  key={mention.id}
                  href={mention.dealId ? `/deals/${mention.dealId}` : `/tasks?taskId=${mention.taskId}`}
                  onClick={() => handleMentionClick(mention.id)}
                  className={rowClassName(Boolean(mention.readAt))}
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium line-clamp-1">
                      {mention.mentionedByName} te etiquetó
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {mention.snippet}
                    </p>
                    {mention.dealTitle ? (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        En trato: {mention.dealTitle}
                      </p>
                    ) : mention.taskTitle && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        En: {mention.taskTitle}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/80">
                      {formatDateTime(mention.createdAt)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Tareas atrasadas */}
          {data?.overdue && data.overdue.length > 0 && (
            <div className="border-b">
              <div className="px-4 py-2 bg-red-50 dark:bg-red-950/20">
                <h4 className="text-xs font-semibold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Tareas atrasadas ({data.overdue.length})
                </h4>
              </div>
              {data.overdue.map((task) => (
                <Link
                  key={task.id}
                  href={`/tasks?taskId=${task.id}`}
                  onClick={() => setIsOpen(false)}
                  className={rowClassName(task.read)}
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium line-clamp-1">
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-red-600 dark:text-red-400 font-medium">
                        {task.daysOverdue === 1
                          ? "Venció ayer"
                          : `${task.daysOverdue} días de atraso`}
                      </span>
                      {task.projectName && (
                        <>
                          <span>•</span>
                          <span className="line-clamp-1">{task.projectName}</span>
                        </>
                      )}
                    </div>
                    {task.subprojectName && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {task.subprojectName}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/80">
                      Vencía: {formatDateTime(task.dueDate)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Deadlines cercanos */}
          {data?.upcoming && data.upcoming.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-orange-50 dark:bg-orange-950/20">
                <h4 className="text-xs font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Próximos deadlines ({data.upcoming.length})
                </h4>
              </div>
              {data.upcoming.map((task) => (
                <Link
                  key={task.id}
                  href={`/tasks?taskId=${task.id}`}
                  onClick={() => setIsOpen(false)}
                  className={rowClassName(task.read)}
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium line-clamp-1">
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-orange-600 dark:text-orange-400 font-medium">
                        {task.daysUntilDue === 0
                          ? "Vence hoy"
                          : task.daysUntilDue === 1
                          ? "Vence mañana"
                          : `Vence en ${task.daysUntilDue} días`}
                      </span>
                      {task.projectName && (
                        <>
                          <span>•</span>
                          <span className="line-clamp-1">{task.projectName}</span>
                        </>
                      )}
                    </div>
                    {task.subprojectName && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {task.subprojectName}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/80">
                      Vence: {formatDateTime(task.dueDate)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Estado vacío */}
          {!hasAnything && (
            <div className="px-4 py-8 text-center">
              <Bell className="h-12 w-12 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                Todas tus tareas están al día
              </p>
            </div>
          )}
        </div>

        {/* Footer: marcar todo leído + ver todas */}
        {hasAnything && (
          <div className="border-t px-4 py-2 space-y-2">
            {totalCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center text-xs cursor-pointer"
                disabled={markingAllRead}
                onClick={() => void handleMarkAllRead()}
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
                Marcar todo como leído
              </Button>
            )}
            <Link
              href="/tasks"
              onClick={() => setIsOpen(false)}
              className="text-xs text-primary hover:underline flex items-center gap-1 justify-center"
            >
              Ver todas las tareas
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

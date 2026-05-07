"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Bell, AlertCircle, Clock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDate } from "@/lib/constants";

interface TaskNotification {
  id: string;
  title: string;
  dueDate: string;
  priority: string;
  projectName: string | null;
  subprojectName: string | null;
  daysOverdue?: number;
  daysUntilDue?: number;
}

interface NotificationData {
  overdue: TaskNotification[];
  upcoming: TaskNotification[];
  total: number;
}

export function NotificationPopover() {
  const [data, setData] = useState<NotificationData | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Cargar notificaciones al abrir el popover
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  // Cargar notificaciones inicialmente para mostrar el badge
  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = () => {
    fetch("/api/task-notifications")
      .then((r) => r.json())
      .then((json) => {
        if (json?.total !== undefined) setData(json);
      })
      .catch(() => {});
  };

  const totalCount = data?.total || 0;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
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
          <h3 className="font-semibold text-sm">Notificaciones de Tareas</h3>
          {totalCount === 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              No hay alertas pendientes
            </p>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
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
                  className="block px-4 py-3 hover:bg-muted/50 transition-colors border-b last:border-b-0"
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
                  className="block px-4 py-3 hover:bg-muted/50 transition-colors border-b last:border-b-0"
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
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Estado vacío */}
          {totalCount === 0 && (
            <div className="px-4 py-8 text-center">
              <Bell className="h-12 w-12 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                Todas tus tareas están al día
              </p>
            </div>
          )}
        </div>

        {/* Footer con link a ver todas las tareas */}
        {totalCount > 0 && (
          <div className="border-t px-4 py-2">
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

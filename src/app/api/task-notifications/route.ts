import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

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

export async function GET() {
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  // Obtener todas las tareas asignadas al usuario actual (no completadas)
  let query = supabase
    .from("tasks")
    .select(`
      id,
      title,
      due_date,
      priority,
      status,
      projects ( name ),
      subprojects ( name ),
      task_assignees!task_assignees_task_id_fkey ( user_id )
    `)
    .neq("status", "done")
    .not("due_date", "is", null);

  // Filtrar por proyectos accesibles
  if (allowedProjectIds !== null) {
    if (allowedProjectIds.length === 0) {
      return NextResponse.json({ overdue: [], upcoming: [] });
    }
    query = query.in("project_id", allowedProjectIds);
  }

  const { data: tasks, error: tasksError } = await query;

  if (tasksError) {
    console.error("Error fetching tasks:", tasksError);
    return NextResponse.json(
      { error: "Error al obtener tareas" },
      { status: 500 }
    );
  }

  // Filtrar solo las tareas donde el usuario está asignado
  const myTasks = (tasks || []).filter((task: any) =>
    task.task_assignees?.some((ta: any) => ta.user_id === user!.id)
  );

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const threeDaysFromNow = new Date(today);
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  const overdue: TaskNotification[] = [];
  const upcoming: TaskNotification[] = [];

  for (const task of myTasks) {
    const dueDate = new Date(task.due_date);
    const dueDateOnly = new Date(
      dueDate.getFullYear(),
      dueDate.getMonth(),
      dueDate.getDate()
    );

    const notification: TaskNotification = {
      id: task.id,
      title: task.title,
      dueDate: task.due_date,
      priority: task.priority,
      projectName: task.projects?.name ?? null,
      subprojectName: task.subprojects?.name ?? null,
    };

    if (dueDateOnly < today) {
      // Tarea atrasada
      const diffTime = today.getTime() - dueDateOnly.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      notification.daysOverdue = diffDays;
      overdue.push(notification);
    } else if (dueDateOnly <= threeDaysFromNow) {
      // Deadline cercano (hoy o próximos 3 días)
      const diffTime = dueDateOnly.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      notification.daysUntilDue = diffDays;
      upcoming.push(notification);
    }
  }

  // Ordenar por urgencia
  overdue.sort((a, b) => (b.daysOverdue || 0) - (a.daysOverdue || 0));
  upcoming.sort((a, b) => (a.daysUntilDue || 0) - (b.daysUntilDue || 0));

  return NextResponse.json({
    overdue,
    upcoming,
    total: overdue.length + upcoming.length,
  });
}

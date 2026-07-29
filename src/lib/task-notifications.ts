import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Tareas atrasadas / próximas de un usuario ───────────────────────────────
// Compartido por /api/task-notifications (GET, para listarlas) y
// /api/notifications/mark-all-read (POST, para saber cuales marcar como
// vistas). Vive aca para que ambos endpoints calculen exactamente lo mismo
// -- que la logica de "que cuenta como atrasada/proxima" nunca se
// desincronice entre los dos lugares que la usan.

export interface MyTaskNotification {
  id: string;
  title: string;
  dueDate: string;
  priority: string;
  projectName: string | null;
  subprojectName: string | null;
  daysOverdue?: number;
  daysUntilDue?: number;
}

export async function getMyTaskNotifications(
  supabase: SupabaseClient,
  userId: string,
  allowedProjectIds: string[] | null
): Promise<{ overdue: MyTaskNotification[]; upcoming: MyTaskNotification[] }> {
  let query = supabase
    .from("tasks")
    .select(`
      id,
      title,
      due_date,
      priority,
      status,
      projects!tasks_project_id_fkey ( name ),
      subprojects ( name ),
      task_assignees!task_assignees_task_id_fkey ( user_id )
    `)
    .not("status", "in", "(listo,descartado)")
    .not("due_date", "is", null)
    .is("deleted_at", null);

  if (allowedProjectIds !== null) {
    if (allowedProjectIds.length === 0) return { overdue: [], upcoming: [] };
    query = query.in("project_id", allowedProjectIds);
  }

  const { data: tasks, error } = await query;
  if (error || !tasks) return { overdue: [], upcoming: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const myTasks = (tasks as any[]).filter((task) =>
    task.task_assignees?.some((ta: { user_id: string }) => ta.user_id === userId)
  );

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const threeDaysFromNow = new Date(today);
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  const overdue: MyTaskNotification[] = [];
  const upcoming: MyTaskNotification[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const task of myTasks as any[]) {
    const dueDate = new Date(task.due_date);
    const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

    const projectName = Array.isArray(task.projects) ? (task.projects[0]?.name ?? null) : (task.projects?.name ?? null);
    const subprojectName = Array.isArray(task.subprojects) ? (task.subprojects[0]?.name ?? null) : (task.subprojects?.name ?? null);

    const notification: MyTaskNotification = {
      id: task.id,
      title: task.title,
      dueDate: task.due_date,
      priority: task.priority,
      projectName,
      subprojectName,
    };

    if (dueDateOnly < today) {
      const diffDays = Math.ceil((today.getTime() - dueDateOnly.getTime()) / (1000 * 60 * 60 * 24));
      notification.daysOverdue = diffDays;
      overdue.push(notification);
    } else if (dueDateOnly <= threeDaysFromNow) {
      const diffDays = Math.ceil((dueDateOnly.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      notification.daysUntilDue = diffDays;
      upcoming.push(notification);
    }
  }

  overdue.sort((a, b) => (b.daysOverdue || 0) - (a.daysOverdue || 0));
  upcoming.sort((a, b) => (a.daysUntilDue || 0) - (b.daysUntilDue || 0));

  return { overdue, upcoming };
}

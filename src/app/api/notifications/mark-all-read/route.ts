import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getMyTaskNotifications } from "@/lib/task-notifications";

export async function POST() {
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  // Menciones: marcar como leidas todas las que aun no lo estaban.
  await supabase
    .from("mentions")
    .update({ read_at: new Date().toISOString() })
    .eq("mentioned_user_id", user!.id)
    .is("read_at", null);

  // Notificaciones de tareas: no son filas persistidas, se recalculan aca
  // mismo (mismo helper que usa el GET) para saber cuales marcar como
  // vistas -- upsert de un ack por tarea, nunca se borra el historico.
  const { overdue, upcoming } = await getMyTaskNotifications(supabase, user!.id, allowedProjectIds);
  const taskIds = [...overdue, ...upcoming].map((n) => n.id);

  if (taskIds.length > 0) {
    await supabase
      .from("task_notification_reads")
      .upsert(
        taskIds.map((taskId) => ({
          user_id: user!.id,
          task_id: taskId,
          read_at: new Date().toISOString(),
        })),
        { onConflict: "user_id,task_id" }
      );
  }

  return NextResponse.json({ success: true });
}

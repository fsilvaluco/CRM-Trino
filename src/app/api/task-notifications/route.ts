import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getMyTaskNotifications, type MyTaskNotification } from "@/lib/task-notifications";

export interface TaskNotificationWithRead extends MyTaskNotification {
  read: boolean;
}

export async function GET() {
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { overdue, upcoming } = await getMyTaskNotifications(supabase, user!.id, allowedProjectIds);

  const allIds = [...overdue, ...upcoming].map((n) => n.id);
  const readIds = new Set<string>();
  if (allIds.length > 0) {
    const { data: reads } = await supabase
      .from("task_notification_reads")
      .select("task_id")
      .eq("user_id", user!.id)
      .in("task_id", allIds);
    for (const r of reads ?? []) readIds.add(r.task_id as string);
  }

  const withRead = (n: MyTaskNotification): TaskNotificationWithRead => ({ ...n, read: readIds.has(n.id) });
  const overdueWithRead = overdue.map(withRead);
  const upcomingWithRead = upcoming.map(withRead);
  const unreadCount = [...overdueWithRead, ...upcomingWithRead].filter((n) => !n.read).length;

  return NextResponse.json({
    overdue: overdueWithRead,
    upcoming: upcomingWithRead,
    total: overdue.length + upcoming.length,
    unreadCount,
  });
}

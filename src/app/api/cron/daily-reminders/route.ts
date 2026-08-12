import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendPushToUsers } from "@/lib/push";
import { claimReminder } from "@/lib/reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DONE_TASK_STATUSES = ["listo", "descartado"];
const TASK_DEAL_THRESHOLDS = [5, 2, 1] as const;

function siteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}${path}`;
}

// Rango [inicio, fin) del dia calendario "hoy + offsetDays", en la zona
// horaria del servidor (Railway corre en UTC). No es timezone-perfecto para
// Chile -- un evento/tarea con fecha justo en el borde de medianoche podria
// calcular el dia +/-1 segun cuando corra el cron. Aceptable para un
// recordatorio (no es data critica), se puede ajustar mas adelante si se
// nota desfasado.
function dayRange(offsetDays: number): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Cron DIARIO (mismo patron que sync-instagram/detect-leads: Railway Cron
 * llama esto todos los dias via POST con Authorization: Bearer
 * <CRON_SECRET>). Cubre 3 tipos de recordatorio en una sola pasada:
 *   - Tareas a 5/2/1 dias de vencer (y no estan listo/descartado)
 *   - Deals a 5/2/1 dias de la fecha de cierre esperada (y no estan
 *     ganados/perdidos)
 *   - Eventos confirmados para mañana (avisa a todo el proyecto)
 * Dedup via reminder_log (claimReminder) -- si el cron se reintenta el
 * mismo dia no se manda el aviso de nuevo.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const summary = { tasksNotified: 0, dealsNotified: 0, eventsNotified: 0, errors: [] as string[] };

  // ── Tareas por vencer ─────────────────────────────────────────────────
  for (const days of TASK_DEAL_THRESHOLDS) {
    const { start, end } = dayRange(days);
    const { data: tasks, error: tasksErr } = await supabase
      .from("tasks")
      .select("id, title, due_date, task_assignees!task_assignees_task_id_fkey ( user_id )")
      .gte("due_date", start)
      .lt("due_date", end)
      .is("deleted_at", null)
      .not("status", "in", `(${DONE_TASK_STATUSES.join(",")})`);

    if (tasksErr) {
      summary.errors.push(`tareas ${days}d: ${tasksErr.message}`);
      continue;
    }

    for (const task of tasks ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const assigneeIds = ((task as any).task_assignees ?? []).map((a: { user_id: string }) => a.user_id);
      if (assigneeIds.length === 0) continue;

      const claimed = await claimReminder(supabase, "task_due", task.id as string, `${days}d`);
      if (!claimed) continue;

      await sendPushToUsers(assigneeIds, {
        title: days === 1 ? "Tarea vence mañana" : `Tarea vence en ${days} días`,
        body: task.title as string,
        url: siteUrl(`/tasks?taskId=${task.id}`),
      });
      summary.tasksNotified++;
    }
  }

  // ── Deals por vencer ───────────────────────────────────────────────────
  const { data: wonLostStageRows } = await supabase
    .from("pipeline_stages")
    .select("id, is_won, is_lost")
    .or("is_won.eq.true,is_lost.eq.true");
  const closedStageIds = new Set((wonLostStageRows ?? []).map((s) => s.id as string));

  for (const days of TASK_DEAL_THRESHOLDS) {
    const { start, end } = dayRange(days);
    const { data: deals, error: dealsErr } = await supabase
      .from("deals")
      .select("id, title, stage_id, expected_close, deal_assignees!deal_assignees_deal_id_fkey ( user_id )")
      .gte("expected_close", start)
      .lt("expected_close", end)
      .is("deleted_at", null);

    if (dealsErr) {
      summary.errors.push(`deals ${days}d: ${dealsErr.message}`);
      continue;
    }

    for (const deal of deals ?? []) {
      if (closedStageIds.has(deal.stage_id as string)) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const assigneeIds = ((deal as any).deal_assignees ?? []).map((a: { user_id: string }) => a.user_id);
      if (assigneeIds.length === 0) continue;

      const claimed = await claimReminder(supabase, "deal_close", deal.id as string, `${days}d`);
      if (!claimed) continue;

      await sendPushToUsers(assigneeIds, {
        title: days === 1 ? "Deal vence mañana" : `Deal vence en ${days} días`,
        body: deal.title as string,
        url: siteUrl(`/deals/${deal.id}`),
      });
      summary.dealsNotified++;
    }
  }

  // ── Eventos de mañana ──────────────────────────────────────────────────
  const tomorrow = dayRange(1);
  const { data: events, error: eventsErr } = await supabase
    .from("shows")
    .select("id, name, venue, project_id")
    .eq("status", "confirmado")
    .gte("date", tomorrow.start)
    .lt("date", tomorrow.end);

  if (eventsErr) {
    summary.errors.push(`eventos: ${eventsErr.message}`);
  } else {
    for (const event of events ?? []) {
      if (!event.project_id) continue;
      const claimed = await claimReminder(supabase, "event_tomorrow", event.id as string, "1d");
      if (!claimed) continue;

      const { data: members } = await supabase
        .from("project_members")
        .select("user_id")
        .eq("project_id", event.project_id as string);
      const memberIds = (members ?? []).map((m) => m.user_id as string);
      if (memberIds.length === 0) continue;

      await sendPushToUsers(memberIds, {
        title: "Evento mañana",
        body: (event.name as string) || (event.venue as string) || "Evento sin nombre",
        url: siteUrl(`/eventos/${event.id}`),
      });
      summary.eventsNotified++;
    }
  }

  return NextResponse.json(summary);
}

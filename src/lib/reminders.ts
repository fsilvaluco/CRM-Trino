import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Dedup de recordatorios automáticos ───────────────────────────────────
// El cron diario (/api/cron/daily-reminders) corre una vez al día, pero
// nada garantiza que no se reintente (error de red, retry manual, etc.) --
// sin esto un mismo aviso ("5 días para vencer") se mandaría de nuevo.
//
// `claimReminder` intenta insertar la fila; si ya existe (UNIQUE
// reminder_type+entity_id+threshold_key) la insercion falla con 23505 y
// devuelve false ("ya se mando, no reenviar"). Es atomico -- no hay race
// condition entre "verificar" y "marcar como enviado".
export type ReminderType = "task_due" | "deal_close" | "event_tomorrow";

export async function claimReminder(
  supabase: SupabaseClient,
  type: ReminderType,
  entityId: string,
  thresholdKey: string
): Promise<boolean> {
  const { error } = await supabase
    .from("reminder_log")
    .insert({ reminder_type: type, entity_id: entityId, threshold_key: thresholdKey });

  if (!error) return true;
  // 23505 = unique_violation (Postgres) -- ya se habia mandado este aviso.
  if (error.code === "23505") return false;

  console.error("[reminders] error al reclamar recordatorio:", error.message);
  return false;
}

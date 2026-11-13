import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendPushToUsers } from "@/lib/push";
import { claimReminder } from "@/lib/reminders";
import { verifyCronSecret } from "@/lib/cron-auth";
import { purgeExpiredPreescuchas } from "@/lib/preescuchas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WARN_DAYS_BEFORE = 3;

/**
 * Cron DIARIO de Preescuchas (mismo patron que daily-reminders: Railway
 * Cron llama via POST con Authorization: Bearer <CRON_SECRET>). Hace dos
 * cosas:
 *   1. Borra del bucket los audios y caratulas de las preescuchas que ya
 *      vencieron (la fila queda como historial, marcada con purged_at).
 *   2. Avisa por push a quien la creo cuando faltan 3 dias o menos para
 *      que venza -- una sola vez por preescucha (dedup via reminder_log).
 *
 * El link publico deja de funcionar apenas pasa `expires_at`, sin depender
 * de este cron; aqui solo se libera el espacio. Como respaldo, el listado
 * de la app tambien purga lo vencido del proyecto que se abre.
 */
export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const purge = await purgeExpiredPreescuchas(supabase);
  const summary = { purged: purge.purged, warned: 0, errors: [...purge.errors] };

  const now = new Date();
  const warnLimit = new Date(now.getTime() + WARN_DAYS_BEFORE * 24 * 60 * 60 * 1000);
  const { data: expiring, error: expiringError } = await supabase
    .from("preescuchas")
    .select("id, title, expires_at, created_by")
    .is("purged_at", null)
    .gt("expires_at", now.toISOString())
    .lte("expires_at", warnLimit.toISOString());

  if (expiringError) {
    summary.errors.push(`aviso de vencimiento: ${expiringError.message}`);
  } else {
    const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    for (const p of expiring ?? []) {
      if (!p.created_by) continue;
      const claimed = await claimReminder(supabase, "preescucha_expiring", p.id as string, `${WARN_DAYS_BEFORE}d`);
      if (!claimed) continue;

      const daysLeft = Math.max(1, Math.ceil((new Date(p.expires_at as string).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
      await sendPushToUsers([p.created_by as string], {
        title: daysLeft === 1 ? "Una preescucha se elimina mañana" : `Una preescucha se elimina en ${daysLeft} días`,
        body: `"${p.title}" y sus archivos se borrarán automáticamente al vencer.`,
        url: `${base}/preescuchas`,
      });
      summary.warned++;
    }
  }

  if (summary.errors.length > 0) console.error("[cron purge-preescuchas] errores:", summary.errors);
  return NextResponse.json({ ok: summary.errors.length === 0, ...summary });
}

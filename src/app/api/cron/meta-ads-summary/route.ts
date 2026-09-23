import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { runDailySummary } from "@/lib/meta-ads/summary";
import { runSisoyDailySummary } from "@/lib/leads/daily-summary";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron 1x/día (9:00 Santiago = 12:00 UTC en horario de verano, 13:00 en
 * invierno) — manda a Telegram el resumen del día. Solo lee lo ya guardado en
 * ad_metrics_daily + ad_actions_log; no llama a Meta. Invocado por Railway
 * Cron vía POST con Authorization: Bearer <CRON_SECRET>.
 */
export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  // El resumen de tratos de SiSoy viaja en este mismo cron diario (9:00
  // Santiago) para no crear otro servicio de Railway Cron. Va aparte en su
  // propio try: si falla, no bloquea el resumen de ads (ni al reves).
  let sisoy: unknown;
  try {
    sisoy = await runSisoyDailySummary();
  } catch (err) {
    sisoy = { ok: false, error: err instanceof Error ? err.message : String(err) };
    console.error("[cron/meta-ads-summary] resumen SiSoy fallo:", sisoy);
  }

  try {
    const result = await runDailySummary();
    return NextResponse.json({ ok: true, result, sisoy });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("[cron/meta-ads-summary] fallo:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

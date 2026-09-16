import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { runDailySummary } from "@/lib/meta-ads/summary";

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

  try {
    const result = await runDailySummary();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("[cron/meta-ads-summary] fallo:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

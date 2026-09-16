import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { BOT_ENABLED } from "@/lib/meta-ads/config";
import { runMetaAdsBot } from "@/lib/meta-ads/bot";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Cron cada 6h — baja insights de la campaña CP_LUR, hace upsert de métricas y
 * evalúa las reglas. Invocado por Railway Cron vía POST con
 * Authorization: Bearer <CRON_SECRET>. Mismo patrón que /api/cron/sync-*.
 *
 * Seguridad: arranca en dry-run (BOT_DRY_RUN != "false"); aunque esté en real,
 * los guardrails duros (mín. impresiones, cooldown 24h, tope de presupuesto)
 * viven en el motor de reglas, no acá.
 */
export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  if (!BOT_ENABLED) {
    return NextResponse.json({ skipped: true, reason: "BOT_ENABLED=false" });
  }

  try {
    const summary = await runMetaAdsBot();
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("[cron/meta-ads-bot] fallo:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { runLeadDetectionForAllConnections } from "@/lib/lead-detector";
import { verifyCronSecret } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron que corre el detector de leads sobre TODAS las cuentas de Gmail
 * conectadas. Invocado por Railway Cron via POST con
 * Authorization: Bearer <CRON_SECRET> -- mismo patron que sync-instagram.
 */
export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const results = await runLeadDetectionForAllConnections();

  return NextResponse.json({
    connectionsProcessed: results.length,
    totalLeadsCreated: results.reduce((sum, r) => sum + r.leadsCreated, 0),
    results,
  });
}

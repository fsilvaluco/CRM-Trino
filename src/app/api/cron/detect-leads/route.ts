import { NextRequest, NextResponse } from "next/server";
import { runLeadDetectionForAllConnections } from "@/lib/lead-detector";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron que corre el detector de leads sobre TODAS las cuentas de Gmail
 * conectadas. Invocado por Railway Cron via POST con
 * Authorization: Bearer <CRON_SECRET> -- mismo patron que sync-instagram.
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

  const results = await runLeadDetectionForAllConnections();

  return NextResponse.json({
    connectionsProcessed: results.length,
    totalLeadsCreated: results.reduce((sum, r) => sum + r.leadsCreated, 0),
    results,
  });
}

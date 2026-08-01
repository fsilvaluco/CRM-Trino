import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { captureGoalSnapshot, type GoalRow } from "@/lib/goals";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron DIARIO (mismo patron que sync-instagram/detect-leads: Railway
 * Cron llama esto todos los dias via POST con Authorization: Bearer
 * <CRON_SECRET>) que, salvo en el dia 1 de cada mes, no hace nada.
 *
 * Es deliberado que corra diario en vez de tener su propio cron
 * mensual en Railway -- reusa el mismo job/horario que ya existe, y el
 * propio endpoint decide si hoy corresponde capturar algo. Tambien es
 * idempotente (ver captureGoalSnapshot), asi que no pasa nada si se
 * llama de mas.
 *
 * Query params opcionales para correr a mano / backfill puntual:
 *   ?year=2026&month=6   -> fuerza la foto mensual de julio 2026 (month es 1-indexed)
 *   ?year=2026&type=annual -> fuerza la foto anual de 2026
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
  const { searchParams } = new URL(request.url);
  const forcedYear = searchParams.get("year") ? Number(searchParams.get("year")) : null;
  const forcedMonth = searchParams.get("month") ? Number(searchParams.get("month")) : null; // 1-indexed
  const forcedType = searchParams.get("type"); // 'annual' si se fuerza anual

  const now = new Date();
  const isFirstOfMonth = now.getDate() === 1;
  const isFirstOfYear = isFirstOfMonth && now.getMonth() === 0;

  const jobs: Array<{ periodType: "monthly" | "annual"; year: number; month?: number }> = [];

  if (forcedYear) {
    if (forcedType === "annual") {
      jobs.push({ periodType: "annual", year: forcedYear });
    } else if (forcedMonth) {
      jobs.push({ periodType: "monthly", year: forcedYear, month: forcedMonth - 1 });
    }
  } else {
    if (isFirstOfMonth) {
      // El mes que recien termino: si hoy es 1 de enero, es diciembre del año pasado.
      const endedMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const endedYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      jobs.push({ periodType: "monthly", year: endedYear, month: endedMonth });
    }
    if (isFirstOfYear) {
      jobs.push({ periodType: "annual", year: now.getFullYear() - 1 });
    }
  }

  if (jobs.length === 0) {
    return NextResponse.json({ ran: false, reason: "Hoy no corresponde capturar ningun periodo" });
  }

  let goalsSnapshotted = 0;
  const results: Array<{ periodType: string; periodLabel: string; goalsSnapshotted: number }> = [];

  for (const job of jobs) {
    const { data: goals, error } = await supabase
      .from("goals")
      .select("*")
      .eq("period_type", job.periodType);

    if (error || !goals) continue;

    for (const goal of goals as GoalRow[]) {
      await captureGoalSnapshot(supabase, goal, job.periodType, job.year, job.month);
      goalsSnapshotted += 1;
    }

    const periodLabel =
      job.periodType === "annual" ? String(job.year) : `${job.year}-${String((job.month ?? 0) + 1).padStart(2, "0")}`;
    results.push({ periodType: job.periodType, periodLabel, goalsSnapshotted: goals.length });
  }

  return NextResponse.json({ ran: true, goalsSnapshotted, results });
}

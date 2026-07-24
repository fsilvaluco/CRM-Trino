import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { parseFlexibleDate, parseFlexibleNumber } from "@/lib/spreadsheet";
import { IMPORT_TARGETS, type ImportTargetType } from "@/lib/import-schemas";
import type { SocialPlatform } from "@/types/analytics";

const BATCH_SIZE = 500;

interface RowError {
  row: number;
  reason: string;
}

function getField(
  row: Record<string, string>,
  mapping: Record<string, string | null>,
  fieldType: "text" | "number" | "date",
  fieldKey: string
): string | number | null {
  const column = mapping[fieldKey];
  if (!column) return null;
  const raw = row[column];
  if (fieldType === "number") return parseFlexibleNumber(raw);
  if (fieldType === "date") return parseFlexibleDate(raw);
  const trimmed = (raw ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export async function POST(request: NextRequest) {
  const { supabase, user, orgId, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) {
    return NextResponse.json({ error: "Solo administradores pueden importar datos masivos" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const {
    targetType,
    mapping,
    rows,
    projectId,
    platform,
  } = body as {
    targetType?: ImportTargetType;
    mapping?: Record<string, string | null>;
    rows?: Record<string, string>[];
    projectId?: string;
    platform?: SocialPlatform;
  };

  if (!targetType || !IMPORT_TARGETS[targetType]) {
    return NextResponse.json({ error: "Tipo de dato inválido" }, { status: 400 });
  }
  if (!mapping || !rows || rows.length === 0) {
    return NextResponse.json({ error: "Faltan datos para importar" }, { status: 400 });
  }
  if (targetType !== "companies" && !projectId) {
    return NextResponse.json({ error: "Selecciona un proyecto antes de importar" }, { status: 400 });
  }
  if (targetType === "social_followers" && !platform) {
    return NextResponse.json({ error: "Selecciona la plataforma antes de importar" }, { status: 400 });
  }

  const fields = IMPORT_TARGETS[targetType].fields;
  const rowErrors: RowError[] = [];
  const validRows: Record<string, string | number | null>[] = [];

  rows.forEach((row, idx) => {
    const extracted: Record<string, string | number | null> = {};
    let missingRequired: string | null = null;

    for (const field of fields) {
      const value = getField(row, mapping, field.type, field.key);
      if (field.required && value == null) {
        missingRequired = field.label;
      }
      extracted[field.key] = value;
    }

    if (missingRequired) {
      rowErrors.push({ row: idx + 2, reason: `Falta o no se pudo leer "${missingRequired}"` }); // +2: fila 1 es encabezado
      return;
    }
    validRows.push(extracted);
  });

  if (validRows.length === 0) {
    return NextResponse.json(
      { error: "Ninguna fila pasó la validación", rowErrors: rowErrors.slice(0, 20), totalErrors: rowErrors.length },
      { status: 400 }
    );
  }

  let insertedCount = 0;
  const dbErrors: string[] = [];

  const insertBatch = async (table: string, records: Record<string, unknown>[]) => {
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const { error: dbError, count } = await supabase.from(table).insert(batch, { count: "exact" });
      if (dbError) {
        console.error(`[admin/import/commit] batch insert failed (${table})`, dbError);
        dbErrors.push(dbError.message);
      } else {
        insertedCount += count ?? batch.length;
      }
    }
  };

  if (targetType === "social_followers") {
    const records = validRows.map((r) => ({
      organization_id: orgId,
      project_id: projectId,
      platform,
      followers: r.followers,
      recorded_at: r.recordedAt,
    }));
    await insertBatch("social_metrics", records);
  } else if (targetType === "contacts") {
    const records = validRows.map((r) => ({
      organization_id: orgId,
      project_id: projectId,
      name: r.name,
      email: r.email,
      phone: r.phone,
      company: r.company,
      source: "import",
      temperature: "cold",
      score: 0,
      notes: r.notes,
    }));
    await insertBatch("contacts", records);
  } else if (targetType === "companies") {
    const records = validRows.map((r) => ({
      organization_id: orgId,
      project_id: projectId ?? null,
      name: r.name,
      industry: r.industry,
      website: r.website,
      email: r.email,
      phone: r.phone,
      address: r.address,
      notes: r.notes,
      created_by: user?.id ?? null,
    }));
    await insertBatch("companies", records);
  } else if (targetType === "spotify_stats") {
    const records = validRows.map((r) => ({
      organization_id: orgId,
      project_id: projectId,
      period_start: r.periodStart,
      period_end: r.periodEnd,
      listeners: r.listeners,
      monthly_active_listeners: r.monthlyActiveListeners,
      streams: r.streams,
      streams_per_listener: r.streamsPerListener,
      saves: r.saves,
      playlist_adds: r.playlistAdds,
      followers: r.followers,
      source: "manual",
      created_by: user?.id ?? null,
    }));
    await insertBatch("spotify_stats_snapshots", records);

    // Espejo de seguidores a social_metrics, igual que en el registro
    // individual — así el histórico importado también alimenta el gráfico
    // compartido de seguidores.
    const followerRecords = validRows
      .filter((r) => r.followers != null)
      .map((r) => ({
        organization_id: orgId,
        project_id: projectId,
        platform: "spotify" as const,
        followers: r.followers,
        recorded_at: r.periodEnd,
      }));
    if (followerRecords.length > 0) {
      await insertBatch("social_metrics", followerRecords);
    }
  } else if (targetType === "shows") {
    const records = validRows.map((r) => ({
      organization_id: orgId,
      project_id: projectId,
      date: r.date,
      venue: r.venue,
      city: r.city,
      fee: r.fee ?? 0,
      ticket_income: r.ticketIncome ?? 0,
      expenses: r.expenses ?? 0,
      notes: r.notes,
    }));
    await insertBatch("shows", records);
  }

  return NextResponse.json({
    ok: dbErrors.length === 0,
    insertedCount,
    skippedCount: rowErrors.length,
    rowErrors: rowErrors.slice(0, 20),
    totalRowErrors: rowErrors.length,
    dbErrors,
  });
}

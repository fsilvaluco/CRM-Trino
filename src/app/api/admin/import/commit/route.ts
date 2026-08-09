import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { parseFlexibleDate, parseFlexibleNumber } from "@/lib/spreadsheet";
import { IMPORT_TARGETS, type ImportTargetType } from "@/lib/import-schemas";
import type { SocialPlatform } from "@/types/analytics";

const BATCH_SIZE = 500;

/** Normaliza el texto libre de la columna "Tipo" (como viene en planillas
 * reales: "Digital", "Digital / RRSS", "TV", "Radio") al enum que exige la
 * base. Todo lo que no calce cae en "digital" por ser el más genérico. */
function normalizePressType(raw: string | null | undefined): "radio" | "tv" | "digital" | "digital_rrss" {
  const text = (raw ?? "").toLowerCase();
  if (text.includes("tv")) return "tv";
  if (text.includes("radio")) return "radio";
  if (text.includes("rrss") || text.includes("redes")) return "digital_rrss";
  return "digital";
}

/** Normaliza el texto libre de la columna "Estado" al enum que exige la
 * base. Vacío/no reconocido cae en "realizado" -- una importacion masiva
 * de historico es casi siempre de eventos que ya pasaron. */
function normalizeShowStatus(raw: string | null | undefined): "cotizando" | "confirmado" | "realizado" | "cancelado" {
  const text = (raw ?? "").toLowerCase().trim();
  if (text.includes("cotiz")) return "cotizando";
  if (text.includes("confirm")) return "confirmado";
  if (text.includes("cancel")) return "cancelado";
  if (text.includes("realiz")) return "realizado";
  return "realizado";
}

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

    // Fila con todos los campos requeridos OK pero ningún dato opcional
    // real (ej. una fila de fechas futuras sin métricas todavía en el
    // archivo fuente) — no aporta nada, se descarta en vez de crear un
    // registro vacío que después hay que borrar a mano.
    const optionalFields = fields.filter((f) => !f.required);
    const hasAnyOptionalValue = optionalFields.some((f) => extracted[f.key] != null);
    if (optionalFields.length > 0 && !hasAnyOptionalValue) {
      rowErrors.push({ row: idx + 2, reason: "Fila sin ningún dato además de los campos requeridos — omitida" });
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
    // artist_name no tiene relacion real con projectId -- su columna en
    // la base quedo con un default viejo ("Gamuza") de cuando se probo la
    // primera vez, asi que si no se fija a mano acá, cualquier importacion
    // para otro proyecto quedaria con el artista equivocado.
    let artistName = "Sin artista";
    if (projectId) {
      const { data: project } = await supabase.from("projects").select("name").eq("id", projectId).single();
      if (project?.name) artistName = project.name;
    }

    const records = validRows.map((r) => ({
      organization_id: orgId,
      project_id: projectId,
      artist_name: artistName,
      name: (r.name as string) || (r.venue as string) || "Sin título",
      date: r.date,
      event_time: r.eventTime || null,
      venue: r.venue,
      address: r.address || null,
      city: r.city || "",
      status: normalizeShowStatus(r.status as string | null),
      tour: r.tour || null,
      // OJO: fee/ticketIncome/expenses vienen del CSV en pesos planos --
      // toda la app (Eventos) guarda estos montos en centavos (x100), asi
      // que hay que convertir antes de insertar. Sin esto quedaban
      // guardados 100 veces mas chicos que el valor real.
      fee: Math.round((r.fee as number) * 100) || 0,
      ticket_income: Math.round((r.ticketIncome as number) * 100) || 0,
      expenses: Math.round((r.expenses as number) * 100) || 0,
      notes: r.notes,
    }));
    await insertBatch("shows", records);
  } else if (targetType === "press_mentions") {
    const records = validRows.map((r) => ({
      organization_id: orgId,
      project_id: projectId,
      mention_date: r.mentionDate,
      outlet: r.outlet,
      type: normalizePressType(r.type as string),
      // Heurística: "Prensa propia..." es autopublicado, no cobertura
      // ganada — el resto se marca 'earned' por defecto y se puede
      // corregir a mano (ej. partners de ticketing) desde el módulo.
      source: String(r.outlet ?? "").toLowerCase().includes("propia") ? "own" : "earned",
      title: r.title,
      reference_url: r.referenceUrl,
      social_url: r.socialUrl,
      notes: r.notes,
    }));
    await insertBatch("press_mentions", records);
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

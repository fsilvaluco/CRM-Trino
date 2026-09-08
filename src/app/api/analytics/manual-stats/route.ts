import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createManualPlatformStatsSchema, type ManualPlatformStats } from "@/types/analytics";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): ManualPlatformStats {
  return {
    id: row.id,
    projectId: row.project_id,
    platform: row.platform,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    metrics: row.metrics ?? {},
    source: row.source,
    createdAt: row.created_at,
  };
}

// GET /api/analytics/manual-stats?projectId=...&platform=tiktok|youtube --
// carga manual de TikTok/YouTube (sin integración en vivo todavía, ver
// migración 091). Mismo patrón que /api/analytics/spotify.
export async function GET(request: NextRequest) {
  const { supabase, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const platform = searchParams.get("platform");

  if (!projectId || !allowedProjectIds.includes(projectId)) {
    return NextResponse.json([]);
  }

  let query = supabase
    .from("manual_platform_stats")
    .select("*")
    .eq("organization_id", orgId!)
    .eq("project_id", projectId)
    .order("period_end", { ascending: false });

  if (platform === "tiktok" || platform === "youtube") {
    query = query.eq("platform", platform);
  }

  const { data, error: dbError } = await query;
  if (dbError) {
    return NextResponse.json({ error: "No se pudieron listar las estadísticas" }, { status: 500 });
  }

  return NextResponse.json((data ?? []).map(mapRow));
}

export async function POST(request: NextRequest) {
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = createManualPlatformStatsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId, platform, periodStart, periodEnd, metrics } = parsed.data;

  if (!allowedProjectIds.includes(projectId)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }

  const { data, error: dbError } = await supabase
    .from("manual_platform_stats")
    .insert({
      organization_id: orgId,
      project_id: projectId,
      platform,
      period_start: periodStart,
      period_end: periodEnd,
      metrics,
      source: "manual",
      created_by: user?.id ?? null,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: "No se pudo guardar", details: dbError.message }, { status: 500 });
  }

  // Espejo de "seguidores"/"suscriptores" a social_metrics -- mismo patrón
  // que Spotify, para que aparezcan en el gráfico compartido de
  // crecimiento de Resumen.
  const followersKey = platform === "tiktok" ? "followers" : "subscribers";
  const followers = metrics[followersKey];
  if (typeof followers === "number") {
    const { error: mirrorError } = await supabase.from("social_metrics").insert({
      organization_id: orgId,
      project_id: projectId,
      platform,
      followers,
      recorded_at: periodEnd,
    });
    if (mirrorError) {
      console.error("[manual-stats] social_metrics mirror failed", { orgId, projectId, mirrorError });
    }
  }

  return NextResponse.json(mapRow(data), { status: 201 });
}

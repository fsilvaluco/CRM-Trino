import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createSpotifyStatsSchema, type SpotifyStatsSnapshot } from "@/types/analytics";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSnapshot(row: any): SpotifyStatsSnapshot {
  return {
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    listeners: row.listeners,
    monthlyActiveListeners: row.monthly_active_listeners,
    streams: row.streams,
    streamsPerListener: row.streams_per_listener != null ? Number(row.streams_per_listener) : null,
    saves: row.saves,
    playlistAdds: row.playlist_adds,
    followers: row.followers,
    source: row.source,
    createdAt: row.created_at,
  };
}

export async function GET(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const isAllProjects = searchParams.get("isAllProjects") === "true";

  if (!isAllProjects && !projectId) {
    return NextResponse.json([]);
  }

  let query = supabase
    .from("spotify_stats_snapshots")
    .select("*")
    .eq("organization_id", orgId!)
    .order("period_end", { ascending: false });

  if (!isAllProjects && projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error: dbError } = await query;

  if (dbError) {
    return NextResponse.json({ error: "No se pudieron listar las estadísticas de Spotify" }, { status: 500 });
  }

  return NextResponse.json((data ?? []).map(mapSnapshot));
}

// Este endpoint SOLO guarda lo que el usuario ya confirmó (venga de un
// pantallazo leído por IA o tecleado a mano) — el paso de extracción con
// IA (/api/analytics/spotify/extract) es completamente separado y nunca
// escribe acá directo.
export async function POST(request: NextRequest) {
  const { supabase, user, orgId, error } = await requireAuth();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = createSpotifyStatsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const {
    projectId,
    periodStart,
    periodEnd,
    listeners,
    monthlyActiveListeners,
    streams,
    streamsPerListener,
    saves,
    playlistAdds,
    followers,
    source,
  } = parsed.data;

  const { data, error: dbError } = await supabase
    .from("spotify_stats_snapshots")
    .insert({
      organization_id: orgId,
      project_id: projectId,
      period_start: periodStart,
      period_end: periodEnd,
      listeners: listeners ?? null,
      monthly_active_listeners: monthlyActiveListeners ?? null,
      streams: streams ?? null,
      streams_per_listener: streamsPerListener ?? null,
      saves: saves ?? null,
      playlist_adds: playlistAdds ?? null,
      followers: followers ?? null,
      source,
      created_by: user?.id ?? null,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: "No se pudo guardar", details: dbError.message }, { status: 500 });
  }

  // Espejo a social_metrics: así los seguidores de Spotify aparecen en el
  // mismo gráfico compartido con las demás plataformas.
  if (followers != null) {
    const { error: mirrorError } = await supabase.from("social_metrics").insert({
      organization_id: orgId,
      project_id: projectId,
      platform: "spotify",
      followers,
      recorded_at: periodEnd,
    });
    if (mirrorError) {
      console.error("[spotify/stats] social_metrics mirror failed", { orgId, projectId, mirrorError });
    }
  }

  return NextResponse.json(mapSnapshot(data), { status: 201 });
}

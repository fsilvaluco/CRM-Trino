import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createSpotifyStatsSchema } from "@/types/analytics";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

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

  const { data: existing, error: fetchError } = await supabase
    .from("spotify_stats_snapshots")
    .select("period_end, followers")
    .eq("id", id)
    .eq("organization_id", orgId!)
    .maybeSingle();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "No se encontró el registro" }, { status: 404 });
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
  } = parsed.data;

  const { error: updateError } = await supabase
    .from("spotify_stats_snapshots")
    .update({
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
    })
    .eq("id", id)
    .eq("organization_id", orgId!);

  if (updateError) {
    return NextResponse.json({ error: "No se pudo actualizar", details: updateError.message }, { status: 500 });
  }

  // Mantener el espejo en social_metrics consistente: si la fecha o el
  // valor de seguidores cambió, se borra el registro viejo (por la fecha
  // anterior) y se inserta uno nuevo con los datos actuales.
  if (existing.period_end) {
    await supabase
      .from("social_metrics")
      .delete()
      .eq("organization_id", orgId!)
      .eq("project_id", projectId)
      .eq("platform", "spotify")
      .eq("recorded_at", existing.period_end);
  }
  if (followers != null) {
    await supabase.from("social_metrics").insert({
      organization_id: orgId,
      project_id: projectId,
      platform: "spotify",
      followers,
      recorded_at: periodEnd,
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  const { data: existing, error: fetchError } = await supabase
    .from("spotify_stats_snapshots")
    .select("project_id, period_end")
    .eq("id", id)
    .eq("organization_id", orgId!)
    .maybeSingle();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "No se encontró el registro" }, { status: 404 });
  }

  const { error: deleteError } = await supabase
    .from("spotify_stats_snapshots")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId!);

  if (deleteError) {
    return NextResponse.json({ error: "No se pudo eliminar", details: deleteError.message }, { status: 500 });
  }

  // Borra también el espejo en social_metrics de esa misma fecha, si
  // existe — evita dejar un punto huérfano en el gráfico de seguidores.
  await supabase
    .from("social_metrics")
    .delete()
    .eq("organization_id", orgId!)
    .eq("project_id", existing.project_id)
    .eq("platform", "spotify")
    .eq("recorded_at", existing.period_end);

  return NextResponse.json({ ok: true });
}

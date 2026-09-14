import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// DELETE /api/analytics/manual-stats/[id] -- borra un registro manual de
// TikTok/YouTube. Mismo patrón que /api/analytics/spotify/[id]: borra
// también el espejo en social_metrics de esa fecha (si aportaba
// followers/subscribers) para no dejar un punto huérfano en el gráfico de
// seguidores compartido.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  const { data: existing, error: fetchError } = await supabase
    .from("manual_platform_stats")
    .select("project_id, platform, period_end")
    .eq("id", id)
    .eq("organization_id", orgId!)
    .maybeSingle();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "No se encontró el registro" }, { status: 404 });
  }

  const { error: deleteError } = await supabase
    .from("manual_platform_stats")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId!);

  if (deleteError) {
    return NextResponse.json({ error: "No se pudo eliminar", details: deleteError.message }, { status: 500 });
  }

  await supabase
    .from("social_metrics")
    .delete()
    .eq("organization_id", orgId!)
    .eq("project_id", existing.project_id)
    .eq("platform", existing.platform)
    .eq("recorded_at", existing.period_end);

  return NextResponse.json({ ok: true });
}

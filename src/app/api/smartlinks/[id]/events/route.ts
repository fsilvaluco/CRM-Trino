import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// GET /api/smartlinks/[id]/events -- eventos crudos (view/click) para el
// panel de detalle: grafico por dia + desglose de clicks por plataforma.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, isAdmin, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: smartlink } = await supabase.from("smartlinks").select("project_id").eq("id", id).single();
  if (!smartlink) return NextResponse.json({ error: "Smartlink no encontrado" }, { status: 404 });
  if (!isAdmin && (!allowedProjectIds || !allowedProjectIds.includes(smartlink.project_id))) {
    return NextResponse.json({ error: "Sin acceso a este smartlink" }, { status: 403 });
  }

  const { data, error: dbError } = await supabase
    .from("smartlink_events")
    .select("event_type, platform, occurred_at")
    .eq("smartlink_id", id)
    .order("occurred_at", { ascending: false });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({
    events: (data ?? []).map((e) => ({ eventType: e.event_type, platform: e.platform, occurredAt: e.occurred_at })),
  });
}

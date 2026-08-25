import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissions, canEditEventCosts } from "@/lib/project-roles";
import { logActivity } from "@/lib/activity-logs";

// POST /api/eventos/[id]/costs/close -- marca la planilla de costos como
// cerrada: fecha + quien la cerró. Desde ahí queda de solo lectura (el
// PUT de /costs la rechaza) hasta que se reabra.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, error } = await requireAuth();
  if (error) return error;

  const { data: show } = await supabase.from("shows").select("name, project_id").eq("id", id).single();
  const role = await getProjectPermissions(supabase, user!.id, show?.project_id ?? null);
  if (!canEditEventCosts(role)) {
    return NextResponse.json({ error: "Tu rol no puede editar los costos de este evento" }, { status: 403 });
  }

  const { data, error: dbError } = await supabase
    .from("shows")
    .update({ cost_sheet_closed_at: new Date().toISOString(), cost_sheet_closed_by: user!.id })
    .eq("id", id)
    .select("cost_sheet_closed_at")
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  await logActivity({
    supabase,
    userId: user!.id,
    userEmail: user!.email,
    action: "close_cost_sheet",
    entityType: "event",
    entityId: id,
    entityName: show?.name ?? null,
    projectId: show?.project_id ?? null,
  });

  return NextResponse.json({ closedAt: data.cost_sheet_closed_at });
}

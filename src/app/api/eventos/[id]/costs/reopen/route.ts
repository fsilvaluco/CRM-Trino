import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getProjectRole, canEditEventCosts } from "@/lib/project-roles";

// POST /api/eventos/[id]/costs/reopen -- deshace el cierre, por si hay que
// corregir algo despues. Borra tambien las firmas de aprobacion que ya se
// hayan juntado -- si se reabre es porque algo va a cambiar, las firmas
// viejas quedarian aprobando una planilla que ya no es la que se va a
// volver a cerrar. Hay que volver a juntarlas. Tambien limpia
// cost_sheet_informed_at: si ya se habia mandado el correo de "Informar
// cierre" con numeros viejos, hay que volver a mandarlo despues del
// proximo cierre -- el boton solo aparece cuando allSigned de nuevo.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, isAdmin, error } = await requireAuth();
  if (error) return error;

  const { data: show } = await supabase.from("shows").select("project_id").eq("id", id).single();
  const role = await getProjectRole(supabase, user!.id, show?.project_id ?? null);
  if (!canEditEventCosts(isAdmin, role)) {
    return NextResponse.json({ error: "Tu rol no puede editar los costos de este evento" }, { status: 403 });
  }

  const { error: dbError } = await supabase
    .from("shows")
    .update({ cost_sheet_closed_at: null, cost_sheet_closed_by: null, cost_sheet_informed_at: null, cost_sheet_informed_by: null })
    .eq("id", id);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // RLS no tiene policy de DELETE para esta tabla a propósito (una firma no
  // se borra "a mano" desde ningún lado) -- este es el único caso legítimo
  // que la limpia, y lo hace con el service role, no con el cliente del
  // usuario.
  await createAdminClient().from("event_closing_signatures").delete().eq("show_id", id);

  return NextResponse.json({ ok: true });
}

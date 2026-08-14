import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

// POST /api/eventos/[id]/costs/reopen -- deshace el cierre, por si hay que
// corregir algo despues. Borra tambien las firmas de aprobacion que ya se
// hayan juntado -- si se reabre es porque algo va a cambiar, las firmas
// viejas quedarian aprobando una planilla que ya no es la que se va a
// volver a cerrar. Hay que volver a juntarlas.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { error: dbError } = await supabase
    .from("shows")
    .update({ cost_sheet_closed_at: null, cost_sheet_closed_by: null })
    .eq("id", id);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // RLS no tiene policy de DELETE para esta tabla a propósito (una firma no
  // se borra "a mano" desde ningún lado) -- este es el único caso legítimo
  // que la limpia, y lo hace con el service role, no con el cliente del
  // usuario.
  await createAdminClient().from("event_closing_signatures").delete().eq("show_id", id);

  return NextResponse.json({ ok: true });
}

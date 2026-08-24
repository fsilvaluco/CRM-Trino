import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectRole, canEditEventCosts } from "@/lib/project-roles";

// PATCH /api/eventos/[id]/costs/[itemId]/payment -- registra que un item de
// costo YA SE PAGÓ (checkbox "Pagado" + comprobante de transferencia).
// A propósito NO respeta el bloqueo de "caja cerrada" que sí aplica el PUT
// completo en costs/route.ts: el flujo real es cerrar caja -> el equipo
// firma -> RECIÉN AHÍ se hacen las transferencias a los trabajadores/gastos
// -> se sube el comprobante de pago. Bloquear esto dejaría a la planilla
// sin forma de registrar pagos hechos después del cierre. Lo que sí sigue
// bloqueado tras el cierre es la definición del gasto en sí (monto,
// categoría, comprobante de cobro, etc.), vía el PUT de costs/route.ts.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id, itemId } = await params;
  const { supabase, user, error } = await requireAuth();
  if (error) return error;

  const { data: show } = await supabase.from("shows").select("project_id").eq("id", id).single();
  const role = await getProjectRole(supabase, user!.id, show?.project_id ?? null);
  if (!canEditEventCosts(role)) {
    return NextResponse.json({ error: "Tu rol no puede editar los costos de este evento" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const patch: { pagado?: boolean; comprobante_pago_url?: string | null } = {};
  if (typeof body.pagado === "boolean") patch.pagado = body.pagado;
  if ("comprobantePagoUrl" in body) patch.comprobante_pago_url = body.comprobantePagoUrl || null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const { error: dbError } = await supabase
    .from("event_cost_items")
    .update(patch)
    .eq("id", itemId)
    .eq("show_id", id);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

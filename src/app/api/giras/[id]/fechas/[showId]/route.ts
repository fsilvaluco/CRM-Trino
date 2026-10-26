import { NextRequest, NextResponse } from "next/server";
import { requireTourAccess } from "@/lib/tours/access";

type Ctx = { params: Promise<{ id: string; showId: string }> };

const STATUS = ["cotizando", "confirmado", "cancelado", "realizado"];

// PATCH /api/giras/[id]/fechas/[showId] -- datos de la fecha que se manejan
// desde la gira: estado (confirmada / en conversación / caída), tramo e
// inicio de venta (para la curva de ritmo). El resto del evento se edita en
// /eventos/[id].
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id, showId } = await params;
  const { access, error } = await requireTourAccess(id, "edit");
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  if ("status" in body) {
    if (!STATUS.includes(body.status)) return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    update.status = body.status;
  }
  if ("salesStartDate" in body) update.sales_start_date = body.salesStartDate || null;
  if ("tourLegId" in body) {
    if (body.tourLegId) {
      const { data: leg } = await access.supabase.from("tour_legs").select("id").eq("id", body.tourLegId).eq("tour_id", id).maybeSingle();
      if (!leg) return NextResponse.json({ error: "Tramo inválido" }, { status: 400 });
    }
    update.tour_leg_id = body.tourLegId || null;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });

  const { data, error: dbError } = await access.supabase
    .from("shows")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", showId)
    .eq("tour_id", id)
    .select("id")
    .maybeSingle();
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "La fecha no es de esta gira" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// DELETE -- saca el evento de la gira (el evento no se borra).
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id, showId } = await params;
  const { access, error } = await requireTourAccess(id, "edit");
  if (error) return error;

  const { error: dbError } = await access.supabase
    .from("shows")
    .update({ tour_id: null, tour_leg_id: null, updated_at: new Date().toISOString() })
    .eq("id", showId)
    .eq("tour_id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

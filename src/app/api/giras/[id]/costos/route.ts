import { NextRequest, NextResponse } from "next/server";
import { requireTourAccess } from "@/lib/tours/access";
import { mapCostItem } from "@/lib/tours/map";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/giras/[id]/costos -- gasto real de la gira que no es de una
// fecha (van, carro, bencina, peajes...). Los de cada fecha siguen en la
// Planilla del evento y se suman solos al presupuesto de la gira.
export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { access, error } = await requireTourAccess(id, "editCosts");
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const label = (body.label ?? "").trim();
  const amount = Math.round(Number(body.amount));
  if (!label || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Falta descripción o monto" }, { status: 400 });
  }
  if (body.budgetLineId) {
    const { data: line } = await access.supabase.from("tour_budget_lines").select("id").eq("id", body.budgetLineId).eq("tour_id", id).maybeSingle();
    if (!line) return NextResponse.json({ error: "Partida inválida" }, { status: 400 });
  }

  const { data, error: dbError } = await access.supabase
    .from("tour_cost_items")
    .insert({
      tour_id: id,
      budget_line_id: body.budgetLineId || null,
      label,
      amount,
      spent_on: body.spentOn || null,
      responsable: body.responsable?.trim() || null,
      pagado: Boolean(body.pagado),
      notes: body.notes?.trim() || null,
      created_by: access.userId,
    })
    .select("*")
    .single();
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(mapCostItem(data), { status: 201 });
}

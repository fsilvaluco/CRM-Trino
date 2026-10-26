import { NextRequest, NextResponse } from "next/server";
import { requireTourAccess } from "@/lib/tours/access";

type Ctx = { params: Promise<{ id: string }> };

// GET -- eventos del proyecto que se pueden sumar a la gira (sin gira asignada).
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { access, error } = await requireTourAccess(id, "view");
  if (error) return error;

  const { data, error: dbError } = await access.supabase
    .from("shows")
    .select("id, date, city, venue, name, status")
    .eq("project_id", access.tour.project_id)
    .is("tour_id", null)
    .gte("date", new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10))
    .order("date");
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST { showId, tourLegId? } -- suma un evento existente a la gira.
export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { access, error } = await requireTourAccess(id, "edit");
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  if (!body.showId) return NextResponse.json({ error: "Falta el evento" }, { status: 400 });

  const { data, error: dbError } = await access.supabase
    .from("shows")
    .update({ tour_id: id, tour_leg_id: body.tourLegId || null, tour: access.tour.name, updated_at: new Date().toISOString() })
    .eq("id", body.showId)
    .eq("project_id", access.tour.project_id)
    .is("tour_id", null)
    .select("id")
    .maybeSingle();
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "El evento no existe o ya está en otra gira" }, { status: 404 });
  return NextResponse.json({ ok: true }, { status: 201 });
}

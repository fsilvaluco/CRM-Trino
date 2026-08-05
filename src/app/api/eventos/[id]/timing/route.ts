import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any) {
  return {
    id: r.id,
    position: r.position,
    timeLabel: r.time_label ?? null,
    activity: r.activity,
    responsable: r.responsable ?? null,
    responsableContactId: r.responsable_contact_id ?? null,
    notes: r.notes ?? null,
  };
}

// GET /api/eventos/[id]/timing -- cronograma ordenado por posicion.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data, error: dbError } = await supabase
    .from("event_timing_items")
    .select("*")
    .eq("show_id", id)
    .order("position");

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json((data ?? []).map(mapRow));
}

// PUT /api/eventos/[id]/timing -- guardado completo de la lista (mismo
// patron que setlist/costos: agrega los sin id, actualiza los que tienen,
// borra los que ya no vienen).
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];

  const { data: existing } = await supabase
    .from("event_timing_items")
    .select("id")
    .eq("show_id", id);

  const existingIds = new Set((existing ?? []).map((r) => r.id));
  const keptIds = new Set(
    items.filter((it: { id?: string }) => it.id).map((it: { id: string }) => it.id)
  );
  const toDelete = [...existingIds].filter((eid) => !keptIds.has(eid));

  if (toDelete.length > 0) {
    await supabase.from("event_timing_items").delete().in("id", toDelete);
  }

  const rows = items.map(
    (
      it: {
        id?: string;
        timeLabel?: string | null;
        activity: string;
        responsable?: string | null;
        responsableContactId?: string | null;
        notes?: string | null;
      },
      index: number
    ) => ({
      ...(it.id ? { id: it.id } : {}),
      show_id: id,
      position: index,
      time_label: it.timeLabel || null,
      activity: (it.activity ?? "").trim() || "Sin detalle",
      responsable: it.responsable || null,
      responsable_contact_id: it.responsableContactId || null,
      notes: it.notes || null,
    })
  );

  if (rows.length > 0) {
    const { error: upsertError } = await supabase.from("event_timing_items").upsert(rows);
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

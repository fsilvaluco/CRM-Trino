import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// GET /api/eventos/[id]/setlist -- lista ordenada por posicion.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data, error: dbError } = await supabase
    .from("event_setlist_items")
    .select("*")
    .eq("show_id", id)
    .order("position");

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json(
    (data ?? []).map((r) => ({ id: r.id, position: r.position, title: r.title, notes: r.notes ?? null }))
  );
}

// PUT /api/eventos/[id]/setlist -- { items: [{id?, title, notes?}] } guarda
// la lista completa de una: agrega los que no tengan id, actualiza los que
// si, y borra los que ya no vienen en la lista. Mas simple que endpoints
// separados de reorder/add/delete para un drag-and-drop que ya trae el
// arreglo completo en cada cambio.
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
    .from("event_setlist_items")
    .select("id")
    .eq("show_id", id);

  const existingIds = new Set((existing ?? []).map((r) => r.id));
  const keptIds = new Set(
    items.filter((it: { id?: string }) => it.id).map((it: { id: string }) => it.id)
  );
  const toDelete = [...existingIds].filter((eid) => !keptIds.has(eid));

  if (toDelete.length > 0) {
    await supabase.from("event_setlist_items").delete().in("id", toDelete);
  }

  const rows = items.map((it: { id?: string; title: string; notes?: string | null }, index: number) => ({
    ...(it.id ? { id: it.id } : { id: crypto.randomUUID() }),
    show_id: id,
    position: index,
    title: (it.title ?? "").trim() || "Sin título",
    notes: it.notes || null,
  }));

  if (rows.length > 0) {
    const { error: upsertError } = await supabase.from("event_setlist_items").upsert(rows);
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data, error: dbError } = await supabase
    .from("event_cost_items")
    .select("*")
    .eq("show_id", id)
    .order("position");

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json(
    (data ?? []).map((r) => ({ id: r.id, position: r.position, label: r.label, amount: r.amount, notes: r.notes ?? null }))
  );
}

// PUT /api/eventos/[id]/costs -- misma lógica de guardado completo que el
// setlist (ver ese archivo para el porqué).
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
    .from("event_cost_items")
    .select("id")
    .eq("show_id", id);

  const existingIds = new Set((existing ?? []).map((r) => r.id));
  const keptIds = new Set(
    items.filter((it: { id?: string }) => it.id).map((it: { id: string }) => it.id)
  );
  const toDelete = [...existingIds].filter((eid) => !keptIds.has(eid));

  if (toDelete.length > 0) {
    await supabase.from("event_cost_items").delete().in("id", toDelete);
  }

  const rows = items.map(
    (it: { id?: string; label: string; amount?: number; notes?: string | null }, index: number) => ({
      ...(it.id ? { id: it.id } : {}),
      show_id: id,
      position: index,
      label: (it.label ?? "").trim() || "Sin título",
      amount: typeof it.amount === "number" ? it.amount : 0,
      notes: it.notes || null,
    })
  );

  if (rows.length > 0) {
    const { error: upsertError } = await supabase.from("event_cost_items").upsert(rows);
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

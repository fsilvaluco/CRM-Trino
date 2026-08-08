import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any) {
  return {
    id: r.id,
    position: r.position,
    label: r.label,
    unitPrice: r.unit_price,
    quantitySold: r.quantity_sold,
    capacity: r.capacity ?? null,
    statusLabel: r.status_label ?? null,
  };
}

// GET /api/eventos/[id]/tickets -- tramos de venta ordenados por posicion.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data, error: dbError } = await supabase
    .from("event_ticket_tiers")
    .select("*")
    .eq("show_id", id)
    .order("position");

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json((data ?? []).map(mapRow));
}

// PUT /api/eventos/[id]/tickets -- guardado completo de la lista (mismo
// patron que setlist/costos/timing).
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
    .from("event_ticket_tiers")
    .select("id")
    .eq("show_id", id);

  const existingIds = new Set((existing ?? []).map((r) => r.id));
  const keptIds = new Set(
    items.filter((it: { id?: string }) => it.id).map((it: { id: string }) => it.id)
  );
  const toDelete = [...existingIds].filter((eid) => !keptIds.has(eid));

  if (toDelete.length > 0) {
    await supabase.from("event_ticket_tiers").delete().in("id", toDelete);
  }

  const rows = items.map(
    (
      it: {
        id?: string;
        label: string;
        unitPrice?: number;
        quantitySold?: number;
        capacity?: number | null;
        statusLabel?: string | null;
      },
      index: number
    ) => ({
      ...(it.id ? { id: it.id } : { id: crypto.randomUUID() }),
      show_id: id,
      position: index,
      label: (it.label ?? "").trim() || "Sin título",
      unit_price: typeof it.unitPrice === "number" ? it.unitPrice : 0,
      quantity_sold: typeof it.quantitySold === "number" ? it.quantitySold : 0,
      capacity: typeof it.capacity === "number" ? it.capacity : null,
      status_label: it.statusLabel || null,
    })
  );

  if (rows.length > 0) {
    const { error: upsertError } = await supabase.from("event_ticket_tiers").upsert(rows);
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any) {
  return {
    id: r.id,
    position: r.position,
    role: r.role ?? null,
    name: r.name,
    contactId: r.contact_id ?? null,
    phone: r.phone ?? null,
    visibleOnShare: r.visible_on_share ?? false,
  };
}

// GET /api/eventos/[id]/contacts -- lista ordenada por posicion.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data, error: dbError } = await supabase
    .from("event_contacts")
    .select("*")
    .eq("show_id", id)
    .order("position");

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json((data ?? []).map(mapRow));
}

// PUT /api/eventos/[id]/contacts -- guardado completo de la lista (mismo
// patron que setlist/timing/costos/entradas).
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
    .from("event_contacts")
    .select("id")
    .eq("show_id", id);

  const existingIds = new Set((existing ?? []).map((r) => r.id));
  const keptIds = new Set(
    items.filter((it: { id?: string }) => it.id).map((it: { id: string }) => it.id)
  );
  const toDelete = [...existingIds].filter((eid) => !keptIds.has(eid));

  if (toDelete.length > 0) {
    await supabase.from("event_contacts").delete().in("id", toDelete);
  }

  const rows = items.map(
    (
      it: {
        id?: string;
        role?: string | null;
        name: string;
        contactId?: string | null;
        phone?: string | null;
        visibleOnShare?: boolean;
      },
      index: number
    ) => ({
      ...(it.id ? { id: it.id } : {}),
      show_id: id,
      position: index,
      role: it.role || null,
      name: (it.name ?? "").trim() || "Sin nombre",
      contact_id: it.contactId || null,
      phone: it.phone || null,
      visible_on_share: it.visibleOnShare ?? false,
    })
  );

  if (rows.length > 0) {
    const { error: upsertError } = await supabase.from("event_contacts").upsert(rows);
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

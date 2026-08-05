import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import type { ShowStatus } from "@/types/shows";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLiveShow(row: any) {
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    artistName: row.artist_name,
    dealId: row.deal_id ?? null,
    venueId: row.venue_id ?? null,
    date: row.date,
    eventTime: row.event_time ?? null,
    venue: row.venue,
    address: row.address ?? null,
    city: row.city ?? null,
    status: (row.status ?? "confirmado") as ShowStatus,
    notes: row.notes ?? null,
    fee: row.fee ?? null,
    ticketIncome: row.ticket_income ?? null,
    expenses: row.expenses ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    projectName: row.projects?.name ?? row.artist_name ?? null,
    dealTitle: row.deals?.title ?? null,
    name: row.name ?? row.venue,
    eventLink: row.event_link ?? null,
    riderLocal: row.rider_local ?? null,
    riderBanda: row.rider_banda ?? null,
    costSheetClosedAt: row.cost_sheet_closed_at ?? null,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data, error: dbError } = await supabase
    .from("shows")
    .select("*, projects ( name ), deals ( title )")
    .eq("id", id)
    .single();

  if (dbError || !data) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }

  const [{ data: setlistRows }, { data: costRows }, { data: timingRows }] = await Promise.all([
    supabase.from("event_setlist_items").select("*").eq("show_id", id).order("position"),
    supabase.from("event_cost_items").select("*").eq("show_id", id).order("position"),
    supabase.from("event_timing_items").select("*").eq("show_id", id).order("position"),
  ]);

  return NextResponse.json({
    ...mapLiveShow(data),
    setlist: (setlistRows ?? []).map((r) => ({
      id: r.id,
      position: r.position,
      title: r.title,
      notes: r.notes ?? null,
    })),
    costItems: (costRows ?? []).map((r) => ({
      id: r.id,
      position: r.position,
      label: r.label,
      responsable: r.responsable ?? null,
      responsableContactId: r.responsable_contact_id ?? null,
      comprobanteUrl: r.comprobante_url ?? null,
      esBhe: r.es_bhe ?? false,
      liquidoAmount: r.liquido_amount ?? null,
      amount: r.amount,
      notes: r.notes ?? null,
    })),
    timing: (timingRows ?? []).map((r) => ({
      id: r.id,
      position: r.position,
      timeLabel: r.time_label ?? null,
      activity: r.activity,
      responsable: r.responsable ?? null,
      responsableContactId: r.responsable_contact_id ?? null,
      notes: r.notes ?? null,
    })),
  });
}

// PUT /api/eventos/[id] -- edita cualquier campo, incluyendo status
// (Cotizando -> Confirmado -> Realizado -> Cancelado) y los campos
// financieros (fee/ticketIncome/expenses) -- son los mismos que lee
// Metricas > Eventos, es el mismo registro.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const {
    date, eventTime, venue, address, city, notes, status,
    fee, ticketIncome, expenses, venueId, name,
    eventLink, riderLocal, riderBanda,
  } = body as {
    date?: string;
    eventTime?: string | null;
    venue?: string;
    address?: string | null;
    city?: string | null;
    notes?: string | null;
    status?: ShowStatus;
    fee?: number | null;
    ticketIncome?: number | null;
    expenses?: number | null;
    venueId?: string | null;
    name?: string;
    eventLink?: string | null;
    riderLocal?: string | null;
    riderBanda?: string | null;
  };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (name !== undefined) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return NextResponse.json({ error: "El nombre del evento es requerido" }, { status: 400 });
    }
    updates.name = trimmedName;
  }

  if (venueId !== undefined) {
    updates.venue_id = venueId || null;
    if (venueId) {
      const { data: venueRow } = await supabase
        .from("venues")
        .select("name, address, comuna")
        .eq("id", venueId)
        .single();
      if (venueRow) {
        updates.venue = venueRow.name;
        updates.address = venueRow.address;
        updates.city = venueRow.comuna ?? "";
      }
    }
  }

  if (date !== undefined) updates.date = date;
  if (eventTime !== undefined) updates.event_time = eventTime || null;
  if (venue !== undefined && venueId === undefined) updates.venue = venue;
  if (address !== undefined && venueId === undefined) updates.address = address || null;
  if (city !== undefined && venueId === undefined) updates.city = city || "";
  if (notes !== undefined) updates.notes = notes || null;
  if (status !== undefined) updates.status = status;
  if (fee !== undefined) updates.fee = fee ?? 0;
  if (ticketIncome !== undefined) updates.ticket_income = ticketIncome ?? 0;
  if (expenses !== undefined) updates.expenses = expenses ?? 0;
  if (eventLink !== undefined) updates.event_link = eventLink || null;
  if (riderLocal !== undefined) updates.rider_local = riderLocal || null;
  if (riderBanda !== undefined) updates.rider_banda = riderBanda || null;

  const { data, error: dbError } = await supabase
    .from("shows")
    .update(updates)
    .eq("id", id)
    .select("*, projects ( name ), deals ( title )")
    .single();

  if (dbError) {
    return NextResponse.json({ error: `Error al actualizar el evento: ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json(mapLiveShow(data));
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { error: dbError } = await supabase.from("shows").delete().eq("id", id);
  if (dbError) {
    return NextResponse.json({ error: `Error al eliminar el evento: ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

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

  return NextResponse.json(mapLiveShow(data));
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
    fee, ticketIncome, expenses,
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
  };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (date !== undefined) updates.date = date;
  if (eventTime !== undefined) updates.event_time = eventTime || null;
  if (venue !== undefined) updates.venue = venue;
  if (address !== undefined) updates.address = address || null;
  if (city !== undefined) updates.city = city || "";
  if (notes !== undefined) updates.notes = notes || null;
  if (status !== undefined) updates.status = status;
  if (fee !== undefined) updates.fee = fee ?? 0;
  if (ticketIncome !== undefined) updates.ticket_income = ticketIncome ?? 0;
  if (expenses !== undefined) updates.expenses = expenses ?? 0;

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

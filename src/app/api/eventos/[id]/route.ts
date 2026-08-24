import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { logActivity } from "@/lib/activity-logs";
import type { ShowStatus } from "@/types/shows";
import { getProjectRole, canViewEventCosts, canEditEventCosts } from "@/lib/project-roles";

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
    financialsUntracked: row.financials_untracked ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    projectName: row.projects?.name ?? row.artist_name ?? null,
    dealTitle: row.deals?.title ?? null,
    name: row.name ?? row.venue,
    eventLink: row.event_link ?? null,
    riderLocal: row.rider_local ?? null,
    riderBanda: row.rider_banda ?? null,
    costSheetClosedAt: row.cost_sheet_closed_at ?? null,
    costSheetClosingFilePath: row.cost_sheet_closing_file_path ?? null,
    costSheetClosingFileName: row.cost_sheet_closing_file_name ?? null,
    costSheetInformedAt: row.cost_sheet_informed_at ?? null,
    ticketSalesUrl: row.ticket_sales_url ?? null,
    tour: row.tour ?? null,
    ticketIvaPct: row.ticket_iva_pct ?? null,
    ticketComisionPct: row.ticket_comision_pct ?? null,
    ticketScdPct: row.ticket_scd_pct ?? null,
    ticketSplitProjectPct: row.ticket_split_project_pct ?? null,
    profitSplitNote: row.profit_split_note ?? null,
    profitSplitProjectPct: row.profit_split_project_pct ?? null,
    profitSplitTrinoPct: row.profit_split_trino_pct ?? null,
    profitSplitTransferProofUrl: row.profit_split_transfer_proof_url ?? null,
    profitSplitTransferredAt: row.profit_split_transferred_at ?? null,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, isAdmin, error } = await requireAuth();
  if (error) return error;

  const { data, error: dbError } = await supabase
    .from("shows")
    .select("*, projects ( name ), deals ( title )")
    .eq("id", id)
    .single();

  if (dbError || !data) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }

  // "staff" no ve nada de plata de este evento (ni el resumen ni el
  // detalle de la Planilla). "artist" SÍ la ve (de solo lectura -- es
  // firmante requerido del cierre de caja, tiene que poder ver los
  // números que está aprobando) pero no puede editarla. El resto del
  // evento (Setlist, Timing, Contactos) sigue visible/editable igual que
  // hoy para cualquiera con acceso al proyecto -- eso queda para fase 2.
  const role = await getProjectRole(supabase, user!.id, data.project_id ?? null);
  const canViewCosts = canViewEventCosts(isAdmin, role);
  const canEditCosts = canEditEventCosts(isAdmin, role);

  const [{ data: setlistRows }, { data: costRows }, { data: timingRows }, { data: ticketRows }, { data: contactRows }] = await Promise.all([
    supabase.from("event_setlist_items").select("*").eq("show_id", id).order("position"),
    supabase.from("event_cost_items").select("*").eq("show_id", id).order("position"),
    supabase.from("event_timing_items").select("*").eq("show_id", id).order("position"),
    supabase.from("event_ticket_tiers").select("*").eq("show_id", id).order("position"),
    supabase.from("event_contacts").select("*").eq("show_id", id).order("position"),
  ]);

  const mappedShow = mapLiveShow(data);

  return NextResponse.json({
    ...mappedShow,
    // Sin acceso a costos: el resumen $ del evento queda null (no 0 --
    // "no sé" es distinto de "el fee es $0") y la Planilla llega vacía.
    fee: canViewCosts ? mappedShow.fee : null,
    ticketIncome: canViewCosts ? mappedShow.ticketIncome : null,
    expenses: canViewCosts ? mappedShow.expenses : null,
    canViewCosts,
    canEditCosts,
    setlist: (setlistRows ?? []).map((r) => ({
      id: r.id,
      position: r.position,
      title: r.title,
      notes: r.notes ?? null,
    })),
    costItems: !canViewCosts ? [] : (costRows ?? []).map((r) => ({
      id: r.id,
      position: r.position,
      label: r.label,
      category: r.category ?? null,
      responsable: r.responsable ?? null,
      responsableContactId: r.responsable_contact_id ?? null,
      comprobanteUrl: r.comprobante_url ?? null,
      pagado: r.pagado ?? false,
      comprobantePagoUrl: r.comprobante_pago_url ?? null,
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
    ticketTiers: (ticketRows ?? []).map((r) => ({
      id: r.id,
      position: r.position,
      label: r.label,
      unitPrice: r.unit_price,
      quantitySold: r.quantity_sold,
      capacity: r.capacity ?? null,
      statusLabel: r.status_label ?? null,
    })),
    eventContacts: (contactRows ?? []).map((r) => ({
      id: r.id,
      position: r.position,
      role: r.role ?? null,
      name: r.name,
      contactId: r.contact_id ?? null,
      phone: r.phone ?? null,
      visibleOnShare: r.visible_on_share ?? false,
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
  const { supabase, user, isAdmin, error } = await requireAuth();
  if (error) return error;

  const { data: showForRole } = await supabase.from("shows").select("project_id").eq("id", id).single();
  const role = await getProjectRole(supabase, user!.id, showForRole?.project_id ?? null);
  const canViewCosts = canViewEventCosts(isAdmin, role);
  const canEditCosts = canEditEventCosts(isAdmin, role);

  const body = await request.json().catch(() => ({}));
  const {
    date, eventTime, venue, address, city, notes, status,
    fee, ticketIncome, expenses, venueId, name,
    eventLink, riderLocal, riderBanda, ticketSalesUrl, tour, profitSplitNote,
    profitSplitProjectPct, profitSplitTrinoPct, profitSplitTransferProofUrl, profitSplitTransferredAt,
    ticketIvaPct, ticketComisionPct, ticketScdPct, ticketSplitProjectPct,
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
    ticketSalesUrl?: string | null;
    tour?: string | null;
    profitSplitNote?: string | null;
    profitSplitProjectPct?: number | null;
    profitSplitTrinoPct?: number | null;
    profitSplitTransferProofUrl?: string | null;
    profitSplitTransferredAt?: string | null;
    ticketIvaPct?: number | null;
    ticketComisionPct?: number | null;
    ticketScdPct?: number | null;
    ticketSplitProjectPct?: number | null;
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
  // Solo admin/member pueden tocar plata del evento -- "artist" la ve pero
  // no la edita, "staff" ni la ve. Se ignoran estos 3 campos en silencio si
  // vinieran igual en el body (la UI ni se los muestra, esto es defensa en
  // profundidad).
  if (canEditCosts) {
    if (fee !== undefined) updates.fee = fee ?? 0;
    if (ticketIncome !== undefined) updates.ticket_income = ticketIncome ?? 0;
    if (expenses !== undefined) updates.expenses = expenses ?? 0;
    if (ticketIvaPct !== undefined) updates.ticket_iva_pct = ticketIvaPct;
    if (ticketComisionPct !== undefined) updates.ticket_comision_pct = ticketComisionPct;
    if (ticketScdPct !== undefined) updates.ticket_scd_pct = ticketScdPct;
    if (ticketSplitProjectPct !== undefined) updates.ticket_split_project_pct = ticketSplitProjectPct;
  }
  if (eventLink !== undefined) updates.event_link = eventLink || null;
  if (riderLocal !== undefined) updates.rider_local = riderLocal || null;
  if (riderBanda !== undefined) updates.rider_banda = riderBanda || null;
  if (ticketSalesUrl !== undefined) updates.ticket_sales_url = ticketSalesUrl || null;
  if (tour !== undefined) updates.tour = tour || null;
  if (profitSplitNote !== undefined) updates.profit_split_note = profitSplitNote || null;
  if (profitSplitProjectPct !== undefined) updates.profit_split_project_pct = profitSplitProjectPct;
  if (profitSplitTrinoPct !== undefined) updates.profit_split_trino_pct = profitSplitTrinoPct;
  if (profitSplitTransferProofUrl !== undefined) updates.profit_split_transfer_proof_url = profitSplitTransferProofUrl || null;
  if (profitSplitTransferredAt !== undefined) updates.profit_split_transferred_at = profitSplitTransferredAt || null;

  const { data, error: dbError } = await supabase
    .from("shows")
    .update(updates)
    .eq("id", id)
    .select("*, projects ( name ), deals ( title )")
    .single();

  if (dbError) {
    return NextResponse.json({ error: `Error al actualizar el evento: ${dbError.message}` }, { status: 500 });
  }

  await logActivity({
    supabase,
    userId: user!.id,
    userEmail: user!.email,
    action: "update",
    entityType: "event",
    entityId: data.id,
    entityName: data.name ?? data.venue,
    projectId: data.project_id,
  });

  const mappedShow = mapLiveShow(data);
  return NextResponse.json({
    ...mappedShow,
    fee: canViewCosts ? mappedShow.fee : null,
    ticketIncome: canViewCosts ? mappedShow.ticketIncome : null,
    expenses: canViewCosts ? mappedShow.expenses : null,
    canViewCosts,
    canEditCosts,
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, error } = await requireAuth();
  if (error) return error;

  const { data: existing } = await supabase.from("shows").select("name, venue, project_id").eq("id", id).single();

  const { error: dbError } = await supabase.from("shows").delete().eq("id", id);
  if (dbError) {
    return NextResponse.json({ error: `Error al eliminar el evento: ${dbError.message}` }, { status: 500 });
  }

  await logActivity({
    supabase,
    userId: user!.id,
    userEmail: user!.email,
    action: "delete",
    entityType: "event",
    entityId: id,
    entityName: existing?.name ?? existing?.venue ?? null,
    projectId: existing?.project_id ?? null,
  });

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLiveShow(row: any) {
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    artistName: row.artist_name,
    dealId: row.deal_id ?? null,
    venueId: row.venue_id ?? null,
    name: row.name ?? row.venue,
    date: row.date,
    eventTime: row.event_time ?? null,
    venue: row.venue,
    address: row.address ?? null,
    city: row.city ?? null,
    status: row.status ?? "cotizando",
    notes: row.notes ?? null,
    fee: row.fee ?? null,
    ticketIncome: row.ticket_income ?? null,
    expenses: row.expenses ?? null,
    eventLink: row.event_link ?? null,
    riderLocal: row.rider_local ?? null,
    riderBanda: row.rider_banda ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// POST /api/eventos/[id]/duplicate -- pensado para giras, donde varias
// fechas se parecen mucho entre si. Copia lo que tiende a repetirse
// (nombre, venue, setlist, rider de la banda, planilla de costos como
// plantilla) y resetea lo que es unico de cada fecha (fecha, estado,
// venta de entradas real, financiero, rider LOCAL porque suele cambiar
// con el venue, y link del evento porque casi siempre es una pagina de
// entradas distinta).
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, error } = await requireAuth();
  if (error) return error;

  const { data: original, error: findErr } = await supabase
    .from("shows")
    .select("*")
    .eq("id", id)
    .single();

  if (findErr || !original) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }

  const { data: newShow, error: insertErr } = await supabase
    .from("shows")
    .insert({
      organization_id: original.organization_id,
      project_id: original.project_id,
      venue_id: original.venue_id,
      artist_name: original.artist_name,
      name: `${original.name ?? original.venue} (copia)`,
      date: original.date, // se deja igual, pero queda en "cotizando" para que se note que hay que revisarla
      event_time: original.event_time,
      venue: original.venue,
      address: original.address,
      city: original.city,
      notes: original.notes,
      status: "cotizando",
      fee: 0,
      ticket_income: 0,
      expenses: 0,
      event_link: null,
      rider_local: null,
      rider_banda: original.rider_banda,
    })
    .select("*, projects ( name ), deals ( title )")
    .single();

  if (insertErr || !newShow) {
    return NextResponse.json({ error: insertErr?.message ?? "No se pudo duplicar el evento" }, { status: 500 });
  }

  // Copia el setlist tal cual -- una gira suele tocar el mismo set.
  const { data: setlistRows } = await supabase
    .from("event_setlist_items")
    .select("position, title, notes")
    .eq("show_id", id);

  if (setlistRows && setlistRows.length > 0) {
    await supabase.from("event_setlist_items").insert(
      setlistRows.map((r) => ({ show_id: newShow.id, position: r.position, title: r.title, notes: r.notes }))
    );
  }

  // Copia la planilla de costos como plantilla (roles/proveedores que se
  // repiten) -- los montos quedan igual como punto de partida, se ajustan
  // en el evento nuevo. No copia comprobantes ni el flag BHE por fila para
  // evitar arrastrar datos de un pago que ya se hizo.
  const { data: costRows } = await supabase
    .from("event_cost_items")
    .select("position, label, responsable, responsable_contact_id")
    .eq("show_id", id);

  if (costRows && costRows.length > 0) {
    await supabase.from("event_cost_items").insert(
      costRows.map((r) => ({
        show_id: newShow.id,
        position: r.position,
        label: r.label,
        responsable: r.responsable,
        responsable_contact_id: r.responsable_contact_id,
        amount: 0,
      }))
    );
  }

  if (user) {
    console.info(`[eventos/duplicate] ${user.id} duplico el evento ${id} -> ${newShow.id}`);
  }

  return NextResponse.json(mapLiveShow(newShow), { status: 201 });
}

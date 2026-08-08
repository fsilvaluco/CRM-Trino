import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// GET /api/public/eventos/[id] -- SIN autenticación (link publico, se
// comparte con banda/staff/venue sin cuenta). A propósito NO usa
// requireAuth ni depende de RLS -- se elige a mano cada campo que se
// devuelve, para que sea imposible filtrar plata (fee, entradas, gastos,
// costos, venta de entradas) por accidente aunque cambien las políticas
// de la base más adelante.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: show, error: showError } = await admin
    .from("shows")
    .select("id, name, date, event_time, venue, address, city, status, rider_local, rider_banda, project_id")
    .eq("id", id)
    .single();

  if (showError || !show) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }

  const [{ data: project }, { data: timingRows }, { data: setlistRows }, { data: contactRows }] = await Promise.all([
    show.project_id
      ? admin.from("projects").select("name, avatar_url").eq("id", show.project_id).single()
      : Promise.resolve({ data: null }),
    admin
      .from("event_timing_items")
      .select("id, position, time_label, activity, responsable, notes")
      .eq("show_id", id)
      .order("position"),
    admin
      .from("event_setlist_items")
      .select("id, position, title, notes")
      .eq("show_id", id)
      .order("position"),
    admin
      .from("event_contacts")
      .select("id, position, role, name, phone")
      .eq("show_id", id)
      .eq("visible_on_share", true)
      .order("position"),
  ]);

  return NextResponse.json({
    name: show.name,
    date: show.date,
    eventTime: show.event_time ?? null,
    venue: show.venue,
    address: show.address ?? null,
    city: show.city ?? null,
    status: show.status,
    riderLocal: show.rider_local ?? null,
    riderBanda: show.rider_banda ?? null,
    projectName: project?.name ?? null,
    projectAvatarUrl: project?.avatar_url ?? null,
    timing: (timingRows ?? []).map((r) => ({
      id: r.id,
      timeLabel: r.time_label ?? null,
      activity: r.activity,
      responsable: r.responsable ?? null,
      notes: r.notes ?? null,
    })),
    setlist: (setlistRows ?? []).map((r) => ({ id: r.id, title: r.title })),
    contacts: (contactRows ?? []).map((r) => ({
      id: r.id,
      role: r.role ?? null,
      name: r.name,
      phone: r.phone ?? null,
    })),
  });
}

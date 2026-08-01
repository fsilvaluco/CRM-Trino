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

// GET /api/shows?projectId=xxx&status=confirmado -- lista para el modulo
// de Shows en vivo (logistica). No confundir con /api/analytics/shows,
// que es el reporte financiero -- ambos leen la misma tabla `shows`.
export async function GET(request: NextRequest) {
  const { supabase, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const status = searchParams.get("status");

  let query = supabase
    .from("shows")
    .select("*, projects ( name ), deals ( title )")
    .eq("organization_id", orgId!)
    .order("date", { ascending: true });

  if (projectId) {
    const { data: children } = await supabase
      .from("projects")
      .select("id")
      .eq("parent_project_id", projectId);
    const visibleIds = [projectId, ...(children ?? []).map((c) => c.id)];
    query = query.in("project_id", visibleIds);
  }

  if (status) query = query.eq("status", status);

  if (allowedProjectIds !== null) {
    if (allowedProjectIds.length === 0) return NextResponse.json([]);
    query = query.in("project_id", allowedProjectIds);
  }

  const { data, error: dbError } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json((data ?? []).map(mapLiveShow));
}

// POST /api/shows -- crea un show: autogestionado (desde el modulo,
// eligiendo proyecto a mano) o disparado por el popup "¿Armamos el
// show?" al ganar un deal marcado como show.
export async function POST(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const { projectId, dealId, date, eventTime, venue, address, city, notes, status } = body as {
    projectId?: string;
    dealId?: string;
    date?: string;
    eventTime?: string;
    venue?: string;
    address?: string;
    city?: string;
    notes?: string;
    status?: ShowStatus;
  };

  if (!projectId) {
    return NextResponse.json({ error: "projectId es requerido" }, { status: 400 });
  }
  if (!date) {
    return NextResponse.json({ error: "La fecha es requerida" }, { status: 400 });
  }
  if (!venue || !venue.trim()) {
    return NextResponse.json({ error: "El venue es requerido" }, { status: 400 });
  }

  const { data: project } = await supabase.from("projects").select("name").eq("id", projectId).single();

  const { data, error: dbError } = await supabase
    .from("shows")
    .insert({
      organization_id: orgId,
      project_id: projectId,
      deal_id: dealId || null,
      artist_name: project?.name || "Sin artista",
      date,
      event_time: eventTime || null,
      venue: venue.trim(),
      address: address || null,
      city: city || "",
      notes: notes || null,
      status: status || "cotizando",
      fee: 0,
      ticket_income: 0,
      expenses: 0,
    })
    .select("*, projects ( name ), deals ( title )")
    .single();

  if (dbError) {
    return NextResponse.json({ error: `Error al crear el show: ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json(mapLiveShow(data), { status: 201 });
}

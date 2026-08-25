import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { logActivity } from "@/lib/activity-logs";
import type { ShowStatus } from "@/types/shows";
import {
  getProjectPermissions,
  getProjectPermissionsForMany,
  canViewEvent,
  canEditEvent,
  canViewEventCosts,
  canEditEventCosts,
} from "@/lib/project-roles";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLiveShow(row: any, canViewCosts: boolean) {
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
    // Sin ver costos (ve_ingresos || ve_costos de Eventos en este
    // proyecto, mismo criterio que eventos/[id]): se ocultan los montos en
    // la respuesta misma, no solo en la UI (ROLES.md 0.2.2).
    fee: canViewCosts ? (row.fee ?? null) : null,
    ticketIncome: canViewCosts ? (row.ticket_income ?? null) : null,
    expenses: canViewCosts ? (row.expenses ?? null) : null,
    financialsUntracked: row.financials_untracked ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    projectName: row.projects?.name ?? row.artist_name ?? null,
    dealTitle: row.deals?.title ?? null,
    name: row.name ?? row.venue,
    tour: row.tour ?? null,
  };
}

// GET /api/eventos?projectId=xxx&status=confirmado -- lista completa para
// el modulo de Eventos (logistica + plata). No confundir con
// /api/analytics/eventos, que es el dashboard financiero de solo lectura --
// ambos leen la misma tabla `shows`.
export async function GET(request: NextRequest) {
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
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

  // Cada evento puede pertenecer a un proyecto distinto (agrupamiento por
  // sello, o listado agregado) -- la vista respeta la matriz de CADA
  // proyecto individualmente, no la del proyecto seleccionado (ROLES.md
  // 0.5). Se calcula por lote para no hacer una consulta por fila.
  const allRows = data ?? [];
  const permsByProject = await getProjectPermissionsForMany(
    supabase,
    user!.id,
    allRows.map((r) => r.project_id)
  );

  const visible = allRows.filter((r) => canViewEvent(permsByProject.get(r.project_id) ?? null));

  return NextResponse.json(
    visible.map((r) => mapLiveShow(r, canViewEventCosts(permsByProject.get(r.project_id) ?? null)))
  );
}

// POST /api/eventos -- crea un evento: autogestionado (desde el modulo,
// eligiendo proyecto a mano) o disparado por el popup "¿Armamos el
// evento?" al ganar un deal marcado como evento.
export async function POST(request: NextRequest) {
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const { projectId, dealId, venueId, name, date, eventTime, venue, address, city, notes, eventLink, status, fee, ticketIncome, expenses, tour } = body as {
    projectId?: string;
    dealId?: string;
    venueId?: string | null;
    name?: string;
    date?: string;
    eventTime?: string;
    venue?: string;
    address?: string;
    city?: string;
    notes?: string;
    eventLink?: string | null;
    status?: ShowStatus;
    fee?: number | null;
    ticketIncome?: number | null;
    expenses?: number | null;
    tour?: string | null;
  };

  const trimmedName = name?.trim() ?? "";
  if (!trimmedName) {
    return NextResponse.json({ error: "El nombre del evento es requerido" }, { status: 400 });
  }
  if (!projectId) {
    return NextResponse.json({ error: "projectId es requerido" }, { status: 400 });
  }
  if (!date) {
    return NextResponse.json({ error: "La fecha es requerida" }, { status: 400 });
  }

  // Este endpoint no tenía NINGÚN chequeo de proyecto ni de permiso --
  // cualquiera autenticado en la organización podía crear un evento (con
  // cualquier monto) en cualquier proyecto ajeno. Corregido (ROLES.md,
  // ítem 6 del rediseño de roles).
  if (!allowedProjectIds.includes(projectId)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }
  const creatorPerm = await getProjectPermissions(supabase, user!.id, projectId);
  if (!canEditEvent(creatorPerm)) {
    return NextResponse.json({ error: "Tu rol no puede crear eventos en este proyecto" }, { status: 403 });
  }
  const canSetCosts = canEditEventCosts(creatorPerm);

  // El venue viene de un venue_id (lo normal, elegido en el combobox) o,
  // para casos viejos/uno-off, de un nombre de texto libre directo.
  let resolvedVenueName = venue?.trim() ?? "";
  let resolvedAddress = address || null;
  let resolvedCity = city || "";
  if (venueId) {
    const { data: venueRow } = await supabase
      .from("venues")
      .select("name, address, comuna")
      .eq("id", venueId)
      .eq("organization_id", orgId!)
      .single();
    if (venueRow) {
      resolvedVenueName = venueRow.name;
      resolvedAddress = venueRow.address;
      resolvedCity = venueRow.comuna ?? resolvedCity;
    }
  }

  if (!resolvedVenueName) {
    // El popup rapido "¿Armamos el evento?" solo pide nombre y fecha -- el
    // venue se completa despues desde el modulo Eventos, donde SI es
    // obligatorio (via el combobox). Aca no bloqueamos la creacion por eso.
    resolvedVenueName = "Por definir";
  }

  const { data: project } = await supabase.from("projects").select("name").eq("id", projectId).single();

  const { data, error: dbError } = await supabase
    .from("shows")
    .insert({
      organization_id: orgId,
      project_id: projectId,
      deal_id: dealId || null,
      venue_id: venueId || null,
      name: trimmedName,
      artist_name: project?.name || "Sin artista",
      date,
      event_time: eventTime || null,
      venue: resolvedVenueName,
      address: resolvedAddress,
      city: resolvedCity,
      notes: notes || null,
      event_link: eventLink || null,
      tour: tour || null,
      status: status || "cotizando",
      // Sin canEditEventCosts se ignoran en silencio, igual que en
      // eventos/[id] PUT -- defensa en profundidad, la UI ni los muestra.
      fee: canSetCosts ? (fee ?? 0) : 0,
      ticket_income: canSetCosts ? (ticketIncome ?? 0) : 0,
      expenses: canSetCosts ? (expenses ?? 0) : 0,
    })
    .select("*, projects ( name ), deals ( title )")
    .single();

  if (dbError) {
    return NextResponse.json({ error: `Error al crear el evento: ${dbError.message}` }, { status: 500 });
  }

  await logActivity({
    supabase,
    userId: user!.id,
    userEmail: user!.email,
    action: "create",
    entityType: "event",
    entityId: data.id,
    entityName: data.name ?? data.venue,
    projectId: data.project_id,
  });

  return NextResponse.json(mapLiveShow(data, canSetCosts), { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapVenue(row: any) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    comuna: row.comuna ?? null,
    region: row.region ?? null,
    country: row.country ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDetails(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    venueId: row.venue_id,
    projectId: row.project_id,
    capacityStanding: row.capacity_standing ?? null,
    capacitySeated: row.capacity_seated ?? null,
    mood: row.mood ?? null,
    description: row.description ?? null,
    parkingAvailable: row.parking_available ?? null,
    backlineAvailable: row.backline_available ?? null,
    website: row.website ?? null,
    instagram: row.instagram ?? null,
    contactId: row.contact_id ?? null,
    companyId: row.company_id ?? null,
    contactName: row.contacts?.name ?? null,
    companyName: row.companies?.name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/venues?search=xxx&projectId=yyy&onlyUsed=true
//
// Los venues son un catálogo COMPARTIDO por toda la organización
// (nombre + dirección, como el buscador de PortalTickets) -- cualquier
// proyecto puede encontrar y reutilizar un venue que otro proyecto ya
// cargó. Los datos privados (capacidad, contacto, etc.) viven aparte en
// `venue_project_details`.
//
// Dos modos:
// - Sin `onlyUsed` (usado por el combobox de "nuevo evento"): devuelve
//   el catálogo COMPLETO de la organización que matchea `search`. Si
//   se pasa `projectId`, cada venue trae `details` (o `null` si el
//   proyecto activo nunca usó ese venue -- el form parte en blanco).
// - Con `onlyUsed=true` (usado por la página /venues del proyecto):
//   requiere `projectId` y devuelve SOLO los venues que ese proyecto ya
//   usó (tiene fila en venue_project_details) -- así un proyecto no ve
//   venues de otros proyectos que nunca ha tocado.
export async function GET(request: NextRequest) {
  const { supabase, orgId, isAdmin, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const projectIdParam = searchParams.get("projectId");
  const onlyUsed = searchParams.get("onlyUsed") === "true";

  if (projectIdParam) {
    const { data: proj } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectIdParam)
      .eq("organization_id", orgId!)
      .single();
    if (!proj) {
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    }
    if (!isAdmin && allowedProjectIds && !allowedProjectIds.includes(projectIdParam)) {
      return NextResponse.json({ error: "Sin acceso al proyecto" }, { status: 403 });
    }
  }

  if (onlyUsed) {
    if (!projectIdParam) {
      return NextResponse.json({ error: "projectId es requerido para onlyUsed" }, { status: 400 });
    }

    let query = supabase
      .from("venue_project_details")
      .select("*, contacts ( name ), companies ( name ), venues!inner ( * )")
      .eq("project_id", projectIdParam)
      .is("venues.deleted_at", null)
      .order("created_at", { ascending: false });

    if (search) query = query.ilike("venues.name", `%${search}%`);

    const { data, error: dbError } = await query;
    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

    const result = (data ?? []).map((row) => ({
      ...mapVenue(row.venues),
      details: mapDetails(row),
    }));
    return NextResponse.json(result);
  }

  // Modo catálogo completo (combobox de eventos)
  let venueQuery = supabase
    .from("venues")
    .select("*")
    .eq("organization_id", orgId!)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (search) venueQuery = venueQuery.ilike("name", `%${search}%`);

  const { data: venueRows, error: dbError } = await venueQuery;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  const venues = venueRows ?? [];

  if (!projectIdParam || venues.length === 0) {
    return NextResponse.json(venues.map((v) => ({ ...mapVenue(v), details: null })));
  }

  const { data: detailRows } = await supabase
    .from("venue_project_details")
    .select("*, contacts ( name ), companies ( name )")
    .eq("project_id", projectIdParam)
    .in("venue_id", venues.map((v) => v.id));

  const detailsByVenueId = new Map((detailRows ?? []).map((d) => [d.venue_id, d]));

  return NextResponse.json(
    venues.map((v) => ({ ...mapVenue(v), details: mapDetails(detailsByVenueId.get(v.id) ?? null) }))
  );
}

// POST /api/venues -- crea un venue NUEVO en el catálogo compartido.
// Solo datos de catálogo (nombre, dirección, comuna/región/país,
// lat/lng): esta ficha va a poder verla y reutilizarla cualquier
// proyecto de la organización. Los datos privados del proyecto se
// crean por separado en POST /api/venues/[id]/details.
export async function POST(request: NextRequest) {
  const { supabase, user, orgId, error } = await requireAuth();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const address = typeof body.address === "string" ? body.address.trim() : "";

  if (!name) return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
  if (!address) return NextResponse.json({ error: "La dirección es requerida" }, { status: 400 });

  const { data, error: dbError } = await supabase
    .from("venues")
    .insert({
      organization_id: orgId,
      created_by: user!.id,
      name,
      address,
      comuna: body.comuna || null,
      region: body.region || null,
      country: body.country || null,
      latitude: typeof body.latitude === "number" ? body.latitude : null,
      longitude: typeof body.longitude === "number" ? body.longitude : null,
    })
    .select("*")
    .single();

  if (dbError) {
    return NextResponse.json({ error: `Error al crear el venue: ${dbError.message}` }, { status: 500 });
  }

  // Si viene con projectId, de una crea también la fila de detalles
  // privados para ese proyecto (típicamente vacía, o con lo que se
  // llenó en el mismo form de "crear venue al vuelo" en un evento).
  let details = null;
  const projectId = typeof body.projectId === "string" ? body.projectId : null;
  if (projectId) {
    const { data: detailRow } = await supabase
      .from("venue_project_details")
      .insert({
        venue_id: data.id,
        project_id: projectId,
        created_by: user!.id,
        capacity_standing: typeof body.capacityStanding === "number" ? body.capacityStanding : null,
        capacity_seated: typeof body.capacitySeated === "number" ? body.capacitySeated : null,
        mood: body.mood || null,
        description: body.description || null,
        parking_available: typeof body.parkingAvailable === "boolean" ? body.parkingAvailable : null,
        backline_available: typeof body.backlineAvailable === "boolean" ? body.backlineAvailable : null,
        website: body.website || null,
        instagram: body.instagram || null,
        contact_id: body.contactId || null,
        company_id: body.companyId || null,
      })
      .select("*, contacts ( name ), companies ( name )")
      .single();
    details = mapDetails(detailRow ?? null);
  }

  return NextResponse.json({ ...mapVenue(data), details }, { status: 201 });
}

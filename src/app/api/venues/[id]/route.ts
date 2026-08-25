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

// GET /api/venues/[id]?projectId=xxx -- datos de catálogo (compartidos),
// y si se pasa `projectId`, incluye también `details` (o `null` si ese
// proyecto nunca usó este venue). Sin `projectId`, `details` viene null.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  const { data, error: dbError } = await supabase
    .from("venues")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId!)
    .is("deleted_at", null)
    .single();

  if (dbError || !data) {
    return NextResponse.json({ error: "Venue no encontrado" }, { status: 404 });
  }

  let details = null;
  if (projectId) {
    const { data: detailRow } = await supabase
      .from("venue_project_details")
      .select("*, contacts ( name ), companies ( name )")
      .eq("venue_id", id)
      .eq("project_id", projectId)
      .maybeSingle();
    details = mapDetails(detailRow ?? null);
  }

  return NextResponse.json({ ...mapVenue(data), details });
}

// PUT /api/venues/[id] -- edita SOLO los datos de catálogo (nombre,
// dirección, comuna/región/país, lat/lng). Estos cambios los ve
// cualquier proyecto que use este venue -- por eso no se tocan datos
// privados aquí (eso es PUT /api/venues/[id]/details).
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { data: existing, error: findErr } = await supabase
    .from("venues")
    .select("id")
    .eq("id", id)
    .eq("organization_id", orgId!)
    .is("deleted_at", null)
    .single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Venue no encontrado" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string") updates.name = body.name.trim();
  if (typeof body.address === "string") updates.address = body.address.trim();
  if (body.comuna !== undefined) updates.comuna = body.comuna || null;
  if (body.region !== undefined) updates.region = body.region || null;
  if (body.country !== undefined) updates.country = body.country || null;
  if (body.latitude !== undefined) updates.latitude = typeof body.latitude === "number" ? body.latitude : null;
  if (body.longitude !== undefined) updates.longitude = typeof body.longitude === "number" ? body.longitude : null;

  const { data, error: dbError } = await supabase
    .from("venues")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (dbError) {
    return NextResponse.json({ error: `Error al actualizar el venue: ${dbError.message}` }, { status: 500 });
  }

  // Si el nombre o direccion cambiaron, refrescar la copia denormalizada
  // en TODOS los eventos que apuntan a este venue (de cualquier
  // proyecto) -- el venue es compartido, así que el fix es global.
  if (updates.name !== undefined || updates.address !== undefined) {
    const showUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) showUpdates.venue = updates.name;
    if (updates.address !== undefined) showUpdates.address = updates.address;
    await supabase.from("shows").update(showUpdates).eq("venue_id", id);
  }

  return NextResponse.json(mapVenue(data));
}

// DELETE /api/venues/[id]?projectId=xxx -- OJO: esto NO borra el venue
// del catálogo compartido (otros proyectos pueden seguir usándolo).
// Solo elimina la ficha de detalles PRIVADOS del proyecto que pide el
// borrado -- equivale a "ya no uso este venue en mi proyecto". El
// venue de catálogo se mantiene mientras algún otro proyecto lo use.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId es requerido" }, { status: 400 });
  }

  const { data: proj } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("organization_id", orgId!)
    .single();
  if (!proj) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  if (!allowedProjectIds.includes(projectId)) {
    return NextResponse.json({ error: "Sin acceso al proyecto" }, { status: 403 });
  }

  const { count } = await supabase
    .from("shows")
    .select("id", { count: "exact", head: true })
    .eq("venue_id", id)
    .eq("project_id", projectId);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `No se puede quitar: hay ${count} evento(s) de este proyecto usando este venue.` },
      { status: 409 }
    );
  }

  const { error: dbError } = await supabase
    .from("venue_project_details")
    .delete()
    .eq("venue_id", id)
    .eq("project_id", projectId);

  if (dbError) {
    return NextResponse.json({ error: `Error al quitar el venue: ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

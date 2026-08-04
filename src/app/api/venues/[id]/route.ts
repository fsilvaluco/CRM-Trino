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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { data, error: dbError } = await supabase
    .from("venues")
    .select("*, contacts ( name ), companies ( name )")
    .eq("id", id)
    .eq("organization_id", orgId!)
    .is("deleted_at", null)
    .single();

  if (dbError || !data) {
    return NextResponse.json({ error: "Venue no encontrado" }, { status: 404 });
  }

  return NextResponse.json(mapVenue(data));
}

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
  if (body.capacityStanding !== undefined) {
    updates.capacity_standing = typeof body.capacityStanding === "number" ? body.capacityStanding : null;
  }
  if (body.capacitySeated !== undefined) {
    updates.capacity_seated = typeof body.capacitySeated === "number" ? body.capacitySeated : null;
  }
  if (body.mood !== undefined) updates.mood = body.mood || null;
  if (body.description !== undefined) updates.description = body.description || null;
  if (body.parkingAvailable !== undefined) {
    updates.parking_available = typeof body.parkingAvailable === "boolean" ? body.parkingAvailable : null;
  }
  if (body.backlineAvailable !== undefined) {
    updates.backline_available = typeof body.backlineAvailable === "boolean" ? body.backlineAvailable : null;
  }
  if (body.website !== undefined) updates.website = body.website || null;
  if (body.instagram !== undefined) updates.instagram = body.instagram || null;
  if (body.contactId !== undefined) updates.contact_id = body.contactId || null;
  if (body.companyId !== undefined) updates.company_id = body.companyId || null;

  const { data, error: dbError } = await supabase
    .from("venues")
    .update(updates)
    .eq("id", id)
    .select("*, contacts ( name ), companies ( name )")
    .single();

  if (dbError) {
    return NextResponse.json({ error: `Error al actualizar el venue: ${dbError.message}` }, { status: 500 });
  }

  // Si el nombre o direccion cambiaron, refrescar la copia denormalizada
  // en los eventos que apuntan a este venue -- para que Métricas y las
  // tarjetas de Eventos no queden mostrando datos viejos.
  if (updates.name !== undefined || updates.address !== undefined) {
    const showUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) showUpdates.venue = updates.name;
    if (updates.address !== undefined) showUpdates.address = updates.address;
    await supabase.from("shows").update(showUpdates).eq("venue_id", id);
  }

  return NextResponse.json(mapVenue(data));
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

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

  const { count } = await supabase
    .from("shows")
    .select("id", { count: "exact", head: true })
    .eq("venue_id", id);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `No se puede eliminar: hay ${count} evento(s) usando este venue.` },
      { status: 409 }
    );
  }

  const { error: dbError } = await supabase
    .from("venues")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (dbError) {
    return NextResponse.json({ error: `Error al eliminar el venue: ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

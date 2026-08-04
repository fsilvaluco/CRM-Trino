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

// GET /api/venues?search=xxx -- lista para el combobox de Eventos y para
// la pagina de administracion /venues. `search` filtra por nombre
// (ilike) -- se usa para el autocompletado del combobox.
export async function GET(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");

  let query = supabase
    .from("venues")
    .select("*, contacts ( name ), companies ( name )")
    .eq("organization_id", orgId!)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (search) query = query.ilike("name", `%${search}%`);

  const { data, error: dbError } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json((data ?? []).map(mapVenue));
}

// POST /api/venues -- crea un venue. Solo nombre y direccion son
// obligatorios; el resto se puede ir completando despues (a mano o, mas
// adelante, sugerido por Google Places).
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

  if (dbError) {
    return NextResponse.json({ error: `Error al crear el venue: ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json(mapVenue(data), { status: 201 });
}

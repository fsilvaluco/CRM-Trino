import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

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

async function checkProjectAccess(
  supabase: Awaited<ReturnType<typeof requireAuth>>["supabase"],
  orgId: string,
  isAdmin: boolean,
  allowedProjectIds: string[] | null,
  projectId: string
) {
  const { data: proj } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("organization_id", orgId)
    .single();
  if (!proj) return "Proyecto no encontrado";
  if (!isAdmin && allowedProjectIds && !allowedProjectIds.includes(projectId)) return "Sin acceso al proyecto";
  return null;
}

// GET /api/venues/[id]/details?projectId=xxx -- datos privados de este
// venue PARA el proyecto activo. Devuelve `null` si el proyecto nunca
// usó este venue (no es error -- el form parte en blanco).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, orgId, isAdmin, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId es requerido" }, { status: 400 });

  const accessError = await checkProjectAccess(supabase, orgId!, isAdmin, allowedProjectIds, projectId);
  if (accessError) return NextResponse.json({ error: accessError }, { status: accessError === "Proyecto no encontrado" ? 404 : 403 });

  const { data } = await supabase
    .from("venue_project_details")
    .select("*, contacts ( name ), companies ( name )")
    .eq("venue_id", id)
    .eq("project_id", projectId)
    .maybeSingle();

  return NextResponse.json(mapDetails(data ?? null));
}

// PUT /api/venues/[id]/details -- crea o actualiza (upsert) los datos
// privados de este venue para `body.projectId`. Se usa tanto la
// primera vez que un proyecto usa un venue del catálogo (crea la fila)
// como para editar capacidad/contacto/etc. después.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, orgId, isAdmin, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  if (!projectId) return NextResponse.json({ error: "projectId es requerido" }, { status: 400 });

  const accessError = await checkProjectAccess(supabase, orgId!, isAdmin, allowedProjectIds, projectId);
  if (accessError) return NextResponse.json({ error: accessError }, { status: accessError === "Proyecto no encontrado" ? 404 : 403 });

  const { data: venue } = await supabase
    .from("venues")
    .select("id")
    .eq("id", id)
    .eq("organization_id", orgId!)
    .is("deleted_at", null)
    .single();
  if (!venue) return NextResponse.json({ error: "Venue no encontrado" }, { status: 404 });

  const { data, error: dbError } = await supabase
    .from("venue_project_details")
    .upsert(
      {
        venue_id: id,
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
        updated_at: new Date().toISOString(),
      },
      { onConflict: "venue_id,project_id" }
    )
    .select("*, contacts ( name ), companies ( name )")
    .single();

  if (dbError) {
    return NextResponse.json({ error: `Error al guardar los datos del venue: ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json(mapDetails(data));
}

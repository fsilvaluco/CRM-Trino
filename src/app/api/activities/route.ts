import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapActivity(row: any) {
  return {
    id: row.id,
    type: row.type,
    description: row.description,
    contactId: row.contact_id,
    dealId: row.deal_id ?? null,
    scheduledAt: row.scheduled_at ?? null,
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
    contactName: row.contacts?.name ?? null,
    contactCompany: row.contacts?.company ?? null,
  };
}

export async function GET(request: NextRequest) {
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const contactId = searchParams.get("contactId");
  const dealId = searchParams.get("dealId");
  const projectId = searchParams.get("projectId");

  let query = supabase
    .from("activities")
    .select("*, contacts ( name, company )")
    .order("created_at", { ascending: false });

  if (contactId) query = query.eq("contact_id", contactId);
  if (dealId) query = query.eq("deal_id", dealId);
  if (projectId) query = query.eq("project_id", projectId);

  const { data, error: dbError } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json((data ?? []).map(mapActivity));
}

export async function POST(request: NextRequest) {
  const { supabase, user, orgId, error } = await requireAuth();
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { type, description, contactId, dealId, scheduledAt, projectId } = body;

  if (!type || !description || !contactId) {
    return NextResponse.json(
      { error: "Tipo, descripcion y contacto son requeridos" },
      { status: 400 }
    );
  }

  const { data, error: dbError } = await supabase
    .from("activities")
    .insert({
      type,
      description,
      contact_id: contactId,
      deal_id: dealId || null,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      completed_at: null,
      organization_id: orgId,
      created_by: user!.id,
      project_id: projectId || null,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json(
      { error: `Error al crear actividad: ${dbError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(mapActivity(data), { status: 201 });
}

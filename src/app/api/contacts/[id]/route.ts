import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapContact(row: any) {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    company: row.company ?? null,
    companyId: row.company_id ?? null,
    source: row.source,
    temperature: row.temperature,
    score: row.score,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDeal(row: any) {
  return {
    id: row.id,
    title: row.title,
    value: row.value,
    stageId: row.stage_id,
    contactId: row.contact_id,
    companyId: row.company_id ?? null,
    probability: row.probability,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapActivity(row: any) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    notes: row.notes ?? null,
    contactId: row.contact_id,
    dealId: row.deal_id ?? null,
    dueDate: row.due_date ?? null,
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data: contact, error: contactErr } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (contactErr || !contact) {
    return NextResponse.json(
      { error: "Contacto no encontrado" },
      { status: 404 }
    );
  }

  const [{ data: deals }, { data: activities }] = await Promise.all([
    supabase.from("deals").select("*").eq("contact_id", id).is("deleted_at", null),
    supabase.from("activities").select("*").eq("contact_id", id),
  ]);

  return NextResponse.json({
    ...mapContact(contact),
    deals: (deals ?? []).map(mapDeal),
    activities: (activities ?? []).map(mapActivity),
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { data: existing, error: findErr } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (findErr || !existing) {
    return NextResponse.json(
      { error: "Contacto no encontrado" },
      { status: 404 }
    );
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.email !== undefined) updates.email = body.email;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.company !== undefined) updates.company = body.company;
  if (body.companyId !== undefined) updates.company_id = body.companyId || null;
  if (body.source !== undefined) updates.source = body.source;
  if (body.temperature !== undefined) updates.temperature = body.temperature;
  if (body.score !== undefined) updates.score = Math.max(0, Math.min(100, body.score));
  if (body.notes !== undefined) updates.notes = body.notes;

  const { data, error: dbError } = await supabase
    .from("contacts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (dbError) {
    return NextResponse.json(
      { error: `Error al actualizar contacto: ${dbError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(mapContact(data));
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data: existing, error: findErr } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (findErr || !existing) {
    return NextResponse.json(
      { error: "Contacto no encontrado" },
      { status: 404 }
    );
  }

  // Soft delete para preservar FK con actividades y deals
  const { error: dbError } = await supabase
    .from("contacts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (dbError) {
    return NextResponse.json(
      { error: `Error al eliminar contacto: ${dbError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCompany(row: any) {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry ?? null,
    website: row.website ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    address: row.address ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data: company, error: compErr } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (compErr || !company) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }

  const [{ data: contacts }, { data: deals }, { data: projects }, { data: tasks }] =
    await Promise.all([
      supabase.from("contacts").select("*").eq("company_id", id).is("deleted_at", null),
      supabase.from("deals").select("*").eq("company_id", id).is("deleted_at", null),
      supabase.from("projects").select("*").eq("company_id", id),
      supabase.from("tasks").select("*").eq("company_id", id),
    ]);

  return NextResponse.json({
    ...mapCompany(company),
    contacts: (contacts ?? []).map(mapContact),
    deals: (deals ?? []).map(mapDeal),
    projects: projects ?? [],
    tasks: tasks ?? [],
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
    .from("companies")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }

  const { name, industry, website, email, phone, address, notes } = body;

  const { data, error: dbError } = await supabase
    .from("companies")
    .update({
      ...(name !== undefined && { name }),
      ...(industry !== undefined && { industry: industry || null }),
      ...(website !== undefined && { website: website || null }),
      ...(email !== undefined && { email: email || null }),
      ...(phone !== undefined && { phone: phone || null }),
      ...(address !== undefined && { address: address || null }),
      ...(notes !== undefined && { notes: notes || null }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (dbError) {
    return NextResponse.json(
      { error: `Error al actualizar empresa: ${dbError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(mapCompany(data));
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data: existing, error: findErr } = await supabase
    .from("companies")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }

  // Soft delete
  const { error: dbError } = await supabase
    .from("companies")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (dbError) {
    return NextResponse.json(
      { error: `Error al eliminar empresa: ${dbError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

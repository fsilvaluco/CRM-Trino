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
    contactCount: Array.isArray(row.contacts) ? (row.contacts[0]?.count ?? 0) : 0,
    dealCount: Array.isArray(row.deals) ? (row.deals[0]?.count ?? 0) : 0,
  };
}

export async function GET(request: NextRequest) {
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const projectId = searchParams.get("projectId");

  let query = supabase
    .from("companies")
    .select("*, contacts(count), deals(count)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (projectId) query = query.eq("project_id", projectId);
  if (search) query = query.ilike("name", `%${search}%`);

  const { data, error: dbError } = await query;

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json((data ?? []).map(mapCompany));
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

  const { name, industry, website, email, phone, address, notes, projectId } = body;

  if (!name || name.trim() === "") {
    return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
  }

  const { data, error: dbError } = await supabase
    .from("companies")
    .insert({
      name: name.trim(),
      industry: industry || null,
      website: website || null,
      email: email || null,
      phone: phone || null,
      address: address || null,
      notes: notes || null,
      organization_id: orgId,
      created_by: user!.id,
      project_id: projectId || null,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json(
      { error: `Error al crear empresa: ${dbError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(mapCompany(data), { status: 201 });
}

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

export async function GET(request: NextRequest) {
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const temperature = searchParams.get("temperature");
  const source = searchParams.get("source");
  const projectId = searchParams.get("projectId");

  let query = supabase
    .from("contacts")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (projectId) query = query.eq("project_id", projectId);
  if (temperature) query = query.eq("temperature", temperature);
  if (source) query = query.eq("source", source);
  if (search) {
    query = query.or(
      `name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`
    );
  }

  const { data, error: dbError } = await query;

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json((data ?? []).map(mapContact));
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

  const { name, email, phone, company, companyId, source, temperature, score, notes, projectId } =
    body;

  if (!name) {
    return NextResponse.json(
      { error: "El nombre es requerido" },
      { status: 400 }
    );
  }

  const { data, error: dbError } = await supabase
    .from("contacts")
    .insert({
      name,
      email: email || null,
      phone: phone || null,
      company: company || null,
      company_id: companyId || null,
      source: source || "otro",
      temperature: temperature || "cold",
      score: score || 0,
      notes: notes || null,
      organization_id: orgId,
      created_by: user!.id,
      project_id: projectId || null,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json(
      { error: `Error al crear contacto: ${dbError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(mapContact(data), { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProject(row: any) {
  return {
    id: row.id,
    name: row.name,
    type: row.type ?? null,
    status: row.status,
    description: row.description ?? null,
    companyId: row.company_id ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    companyName: row.companies?.name ?? null,
  };
}

export async function GET(request: NextRequest) {
  const { supabase, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const status = searchParams.get("status");

  let query = supabase
    .from("projects")
    .select("*, companies ( name )")
    .order("created_at", { ascending: false });

  if (companyId) query = query.eq("company_id", companyId);
  if (status) query = query.eq("status", status);
  // Filtrar por proyectos accesibles si el usuario es member
  if (allowedProjectIds !== null) {
    if (allowedProjectIds.length === 0) return NextResponse.json([]);
    query = query.in("id", allowedProjectIds);
  }

  const { data, error: dbError } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json((data ?? []).map(mapProject));
}


export async function POST(request: NextRequest) {
  const { supabase, user, orgId, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { name, type, status, description, companyId, notes } = body as Record<string, string | undefined>;

  if (!name || name.trim() === "") {
    return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
  }

  const { data, error: dbError } = await supabase
    .from("projects")
    .insert({
      name: name.trim(),
      type: type || null,
      status: status || "active",
      description: description || null,
      company_id: companyId || null,
      notes: notes || null,
      organization_id: orgId,
      created_by: user!.id,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: `Error al crear proyecto: ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json(mapProject(data), { status: 201 });
}

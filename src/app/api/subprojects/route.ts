import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSubproject(row: any) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    projectId: row.project_id,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    projectName: row.projects?.name ?? null,
  };
}

export async function GET(request: NextRequest) {
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const status = searchParams.get("status");

  let query = supabase
    .from("subprojects")
    .select("*, projects ( name )")
    .order("created_at", { ascending: false });

  if (projectId) query = query.eq("project_id", projectId);
  if (status) query = query.eq("status", status);

  const { data, error: dbError } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json((data ?? []).map(mapSubproject));
}


export async function POST(request: NextRequest) {
  const { supabase, user, orgId, error } = await requireAuth();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { name, status, projectId, startDate, endDate, notes } = body as Record<string, string | undefined>;

  if (!name || name.trim() === "") {
    return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
  }
  if (!projectId) {
    return NextResponse.json({ error: "El proyecto es requerido" }, { status: 400 });
  }

  const { data, error: dbError } = await supabase
    .from("subprojects")
    .insert({
      name: name.trim(),
      status: status || "active",
      project_id: projectId,
      start_date: startDate ? new Date(startDate).toISOString() : null,
      end_date: endDate ? new Date(endDate).toISOString() : null,
      notes: notes || null,
      organization_id: orgId,
      created_by: user!.id,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: `Error al crear subproyecto: ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json(mapSubproject(data), { status: 201 });
}

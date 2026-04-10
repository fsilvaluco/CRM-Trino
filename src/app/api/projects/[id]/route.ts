import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }

  const [{ data: subs }, { data: tasks }] = await Promise.all([
    supabase.from("subprojects").select("*").eq("project_id", id),
    supabase.from("tasks").select("*").eq("project_id", id),
  ]);

  return NextResponse.json({
    id: project.id,
    name: project.name,
    type: project.type ?? null,
    status: project.status,
    description: project.description ?? null,
    companyId: project.company_id ?? null,
    notes: project.notes ?? null,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    subprojects: subs ?? [],
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { data: existing, error: findErr } = await supabase
    .from("projects").select("*").eq("id", id).single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }

  const { name, type, status, description, companyId, notes } = body as Record<string, string | undefined>;

  const { data, error: dbError } = await supabase
    .from("projects")
    .update({
      name: name ?? existing.name,
      type: type !== undefined ? type || null : existing.type,
      status: status ?? existing.status,
      description: description !== undefined ? description || null : existing.description,
      company_id: companyId !== undefined ? companyId || null : existing.company_id,
      notes: notes !== undefined ? notes || null : existing.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id).select().single();

  if (dbError) {
    return NextResponse.json({ error: `Error al actualizar proyecto: ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json({
    id: data.id, name: data.name, type: data.type ?? null,
    status: data.status, description: data.description ?? null,
    companyId: data.company_id ?? null, notes: data.notes ?? null,
    createdAt: data.created_at, updatedAt: data.updated_at,
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data: existing, error: findErr } = await supabase
    .from("projects").select("id").eq("id", id).single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }

  const { error: dbError } = await supabase.from("projects").delete().eq("id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

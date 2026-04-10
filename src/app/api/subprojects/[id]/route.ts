import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data: subproject, error: subErr } = await supabase
    .from("subprojects")
    .select("*")
    .eq("id", id)
    .single();

  if (subErr || !subproject) {
    return NextResponse.json({ error: "Subproyecto no encontrado" }, { status: 404 });
  }

  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("subproject_id", id);

  return NextResponse.json({
    id: subproject.id, name: subproject.name, status: subproject.status,
    projectId: subproject.project_id, startDate: subproject.start_date ?? null,
    endDate: subproject.end_date ?? null, notes: subproject.notes ?? null,
    createdAt: subproject.created_at, updatedAt: subproject.updated_at,
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
    .from("subprojects").select("*").eq("id", id).single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Subproyecto no encontrado" }, { status: 404 });
  }

  const { name, status, startDate, endDate, notes } = body as Record<string, string | undefined>;

  const { data, error: dbError } = await supabase
    .from("subprojects")
    .update({
      name: name ?? existing.name,
      status: status ?? existing.status,
      start_date: startDate !== undefined ? (startDate ? new Date(startDate).toISOString() : null) : existing.start_date,
      end_date: endDate !== undefined ? (endDate ? new Date(endDate).toISOString() : null) : existing.end_date,
      notes: notes !== undefined ? notes || null : existing.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id).select().single();

  if (dbError) {
    return NextResponse.json({ error: `Error al actualizar subproyecto: ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json({
    id: data.id, name: data.name, status: data.status,
    projectId: data.project_id, startDate: data.start_date ?? null,
    endDate: data.end_date ?? null, notes: data.notes ?? null,
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
    .from("subprojects").select("id").eq("id", id).single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Subproyecto no encontrado" }, { status: 404 });
  }

  const { error: dbError } = await supabase.from("subprojects").delete().eq("id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

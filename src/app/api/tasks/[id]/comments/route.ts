import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data: task, error: taskErr } = await supabase
    .from("tasks").select("id").eq("id", id).single();
  if (taskErr || !task) {
    return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  }

  const { data: comments, error: dbError } = await supabase
    .from("task_comments")
    .select("*")
    .eq("task_id", id)
    .order("created_at", { ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(comments ?? []);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, orgId, error } = await requireAuth();
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { content, author } = body;

  if (!content || content.trim() === "") {
    return NextResponse.json({ error: "El contenido es requerido" }, { status: 400 });
  }

  const { data: task, error: taskErr } = await supabase
    .from("tasks").select("id").eq("id", id).single();
  if (taskErr || !task) {
    return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  }

  const { data: comment, error: dbError } = await supabase
    .from("task_comments")
    .insert({
      task_id: id,
      content: content.trim(),
      author: author?.trim() || "Usuario",
      organization_id: orgId,
      created_by: user!.id,
    })
    .select().single();

  if (dbError) {
    return NextResponse.json({ error: `Error al crear comentario: ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json(comment, { status: 201 });
}

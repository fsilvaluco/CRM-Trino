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
  const normalizedComments = (comments ?? []).map((comment) => ({
    ...comment,
    author: comment.author ?? "Usuario",
  }));

  return NextResponse.json(normalizedComments);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, orgId, error } = await requireAuth();
  if (error) {
    console.error("[task_comments POST] requireAuth error:", error);
    return error;
  }

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

  const trimmedContent = content.trim();
  const normalizedAuthor = author?.trim() || "Usuario";
  const insertAttempts: Array<{ label: string; payload: Record<string, string | null> }> = [
    {
      label: "full",
      payload: {
        task_id: id,
        content: trimmedContent,
        author: normalizedAuthor,
        organization_id: orgId,
        created_by: user!.id,
      },
    },
    {
      label: "no_author",
      payload: {
        task_id: id,
        content: trimmedContent,
        organization_id: orgId,
        created_by: user!.id,
      },
    },
  ];

  let lastErrorMessage = "Error desconocido al crear comentario";

  for (const attempt of insertAttempts) {
    const result = await supabase
      .from("task_comments")
      .insert(attempt.payload)
      .select()
      .single();

    if (!result.error) {
      return NextResponse.json(
        {
          ...result.data,
          author: result.data.author ?? normalizedAuthor,
        },
        { status: 201 }
      );
    }

    lastErrorMessage = result.error.message;
    console.error(`[task_comments POST] ${attempt.label} insert error:`, result.error);
  }

  return NextResponse.json(
    { error: `Error al crear comentario: ${lastErrorMessage}` },
    { status: 500 }
  );
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

interface BulkTaskInput {
  title: string;
  dueDate: string | null;
  description: string;
  subprojectId: string | null;
}

export async function POST(request: NextRequest) {
  const { supabase, orgId, user, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const { projectId, artistProjectId, tasks } = body as {
    projectId?: string;
    artistProjectId?: string | null;
    tasks?: BulkTaskInput[];
  };

  if (!projectId || !Array.isArray(tasks) || tasks.length === 0) {
    return NextResponse.json({ error: "Faltan projectId o tasks" }, { status: 400 });
  }

  const rows = tasks
    .filter((t) => t.title && t.title.trim().length > 0)
    .map((t) => ({
      organization_id: orgId,
      project_id: projectId,
      artist_project_id: artistProjectId || null,
      subproject_id: t.subprojectId || null,
      title: t.title.trim(),
      description: t.description || null,
      due_date: t.dueDate || null,
      status: "sin_empezar",
      priority: "medium",
      created_by: user!.id,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "Ninguna tarea tiene título" }, { status: 400 });
  }

  const { data, error: dbError } = await supabase.from("tasks").insert(rows).select("id");

  if (dbError) {
    return NextResponse.json({ error: `Error al crear tareas: ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json({ created: data?.length ?? 0 });
}

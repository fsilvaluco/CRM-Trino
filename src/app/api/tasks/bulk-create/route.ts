import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

interface BulkTaskInput {
  title: string;
  dueDate: string | null;
  description: string;
  subprojectId: string | null;
  assigneeIds?: string[];
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

  const validTasks = tasks.filter((t) => t.title && t.title.trim().length > 0);
  if (validTasks.length === 0) {
    return NextResponse.json({ error: "Ninguna tarea tiene título" }, { status: 400 });
  }

  const rows = validTasks.map((t) => ({
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

  const { data, error: dbError } = await supabase.from("tasks").insert(rows).select("id");

  if (dbError) {
    return NextResponse.json({ error: `Error al crear tareas: ${dbError.message}` }, { status: 500 });
  }

  // Asignar responsables por tarea (en el mismo orden que se insertaron) --
  // no bloqueante: si falla la asignacion de alguna, las tareas ya quedaron
  // creadas igual.
  if (data) {
    const assigneeRows = validTasks.flatMap((t, i) =>
      (t.assigneeIds ?? []).map((userId) => ({
        task_id: data[i]?.id,
        user_id: userId,
        assigned_by: user!.id,
      }))
    ).filter((r) => r.task_id);

    if (assigneeRows.length > 0) {
      const { error: assignError } = await supabase.from("task_assignees").insert(assigneeRows);
      if (assignError) {
        console.error("[tasks/bulk-create] fallo asignar responsables (no bloqueante)", assignError);
      }
    }
  }

  return NextResponse.json({ created: data?.length ?? 0 });
}

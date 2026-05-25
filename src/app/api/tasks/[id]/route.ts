import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTask(row: any) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date ?? null,
    contactId: row.contact_id ?? null,
    companyId: row.company_id ?? null,
    dealId: row.deal_id ?? null,
    projectId: row.project_id ?? null,
    subprojectId: row.subproject_id ?? null,
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    contactName: row.contacts?.name ?? null,
    companyName: row.companies?.name ?? null,
    dealTitle: row.deals?.title ?? null,
    projectName: row.projects?.name ?? null,
    subprojectName: row.subprojects?.name ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTaskComment(row: any) {
  return {
    id: row.id,
    taskId: row.task_id ?? null,
    content: row.content ?? "",
    author: row.author ?? "Usuario",
    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),
  };
}

const DONE_STATUSES = ["listo", "descartado"];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .select("*, contacts ( name ), companies ( name ), deals ( title ), projects ( name ), subprojects ( name )")
    .eq("id", id)
    .single();

  if (taskErr || !task) {
    return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  }

  const { data: comments } = await supabase
    .from("task_comments")
    .select("*")
    .eq("task_id", id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ ...mapTask(task), comments: (comments ?? []).map(mapTaskComment) });
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
    .from("tasks").select("id, status, completed_at").eq("id", id).single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  }

  const DONE_STATUSES = ["listo", "descartado"];
  const { title, description, status, priority, dueDate, contactId, companyId, dealId, projectId, subprojectId } = body as Record<string, string | undefined>;

  const wasNotDone = !DONE_STATUSES.includes((existing.status as string) ?? "");
  const newStatus = status ?? (existing.status as string);
  const willBeDone = DONE_STATUSES.includes(newStatus);
  const completedAt = willBeDone && wasNotDone
    ? new Date().toISOString()
    : !willBeDone ? null : (existing.completed_at as string | null);

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), completed_at: completedAt };
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;
  if (priority !== undefined) updates.priority = priority;
  if (dueDate !== undefined) {
    if (dueDate) {
      const parsedDueDate = new Date(dueDate);
      if (Number.isNaN(parsedDueDate.getTime())) {
        return NextResponse.json({ error: "Fecha de vencimiento invalida" }, { status: 400 });
      }
      updates.due_date = parsedDueDate.toISOString();
    } else {
      updates.due_date = null;
    }
  }
  if (contactId !== undefined) updates.contact_id = contactId || null;
  if (companyId !== undefined) updates.company_id = companyId || null;
  if (dealId !== undefined) updates.deal_id = dealId || null;
  if (projectId !== undefined) updates.project_id = projectId || null;
  if (subprojectId !== undefined) updates.subproject_id = subprojectId || null;

  const { data, error: dbError } = await supabase
    .from("tasks").update(updates).eq("id", id)
    .select("*, contacts ( name ), companies ( name ), deals ( title ), projects ( name ), subprojects ( name )")
    .single();

  if (dbError) {
    return NextResponse.json({ error: `Error al actualizar tarea: ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json(mapTask(data));
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data: existing, error: findErr } = await supabase
    .from("tasks").select("id").eq("id", id).single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  }

  const { error: dbError } = await supabase.from("tasks").delete().eq("id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

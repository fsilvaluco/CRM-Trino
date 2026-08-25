import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { markEntityViewed } from "@/lib/entity-views";
import { sendPushToUsers } from "@/lib/push";
import { logActivity } from "@/lib/activity-logs";
import { getProjectPermissions, canDeleteModule } from "@/lib/project-roles";

function taskUrl(taskId: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}/tasks?taskId=${taskId}`;
}

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
    artistProjectId: row.artist_project_id ?? null,
    subprojectId: row.subproject_id ?? null,
    completedAt: row.completed_at ?? null,
    referenceUrl: row.reference_url ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    contactName: row.contacts?.name ?? null,
    companyName: row.companies?.name ?? null,
    dealTitle: row.deals?.title ?? null,
    projectName: row.projects?.name ?? null,
    subprojectName: row.subprojects?.name ?? null,
    assignees: row.task_assignees?.map((ta: any) => ({
      userId: ta.user_id,
      assignedAt: ta.assigned_at,
      profile: ta.profiles ? {
        fullName: ta.profiles.full_name,
        avatarUrl: ta.profiles.avatar_url,
        email: ta.profiles.email,
      } : null,
    })) ?? [],
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
  const { supabase, user, error } = await requireAuth();
  if (error) return error;

  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .select(`
      *,
      contacts ( name ),
      companies ( name ),
      deals ( title ),
      projects!tasks_project_id_fkey ( name ),
      subprojects ( name ),
      task_assignees!task_assignees_task_id_fkey (
        user_id,
        assigned_at,
        profiles!task_assignees_user_id_fkey ( full_name, avatar_url, email )
      )
    `)
    .eq("id", id)
    .single();

  if (taskErr || !task) {
    return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  }

  // Fire-and-forget: abrir el detalle apaga el punto rojo para este
  // usuario. No se espera el resultado -- no es data critica y no debe
  // demorar la respuesta.
  if (user) void markEntityViewed(supabase, user.id, "task", id);

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
  const { supabase, user, error } = await requireAuth();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { data: existing, error: findErr } = await supabase
    .from("tasks").select("id, title, status, completed_at").eq("id", id).single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  }

  // Se lee ANTES de tocar task_assignees para poder distinguir mas abajo
  // quienes son asignados NUEVOS (a esos se les manda push, no a los que ya
  // estaban asignados y solo se re-guardo la lista).
  const { data: prevAssignees } = await supabase
    .from("task_assignees")
    .select("user_id")
    .eq("task_id", id);
  const prevAssigneeIds = new Set((prevAssignees ?? []).map((a) => a.user_id as string));

  const DONE_STATUSES = ["listo", "descartado"];
  const { title, description, status, priority, dueDate, contactId, companyId, dealId, projectId, artistProjectId, subprojectId, referenceUrl } = body as Record<string, string | undefined>;
  const assigneeIds = Array.isArray(body.assigneeIds)
    ? body.assigneeIds.filter((value): value is string => typeof value === "string" && value.length > 0)
    : null;

  if (assigneeIds && !user) {
    return NextResponse.json({ error: "Usuario no autenticado" }, { status: 401 });
  }

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
  if (artistProjectId !== undefined) updates.artist_project_id = artistProjectId || null;
  if (subprojectId !== undefined) updates.subproject_id = subprojectId || null;
  if (referenceUrl !== undefined) updates.reference_url = referenceUrl?.trim() || null;

  if (assigneeIds) {
    const uniqueAssigneeIds = [...new Set(assigneeIds)];
    const { error: deleteAssigneesError } = await supabase
      .from("task_assignees")
      .delete()
      .eq("task_id", id);

    if (deleteAssigneesError) {
      return NextResponse.json({ error: `Error al actualizar responsables: ${deleteAssigneesError.message}` }, { status: 500 });
    }

    if (uniqueAssigneeIds.length > 0) {
      const { error: insertAssigneesError } = await supabase
        .from("task_assignees")
        .insert(
          uniqueAssigneeIds.map((assigneeId) => ({
            task_id: id,
            user_id: assigneeId,
            assigned_by: user!.id,
          }))
        );

      if (insertAssigneesError) {
        return NextResponse.json({ error: `Error al actualizar responsables: ${insertAssigneesError.message}` }, { status: 500 });
      }
    }

    // Solo notificar a quienes son NUEVOS en la tarea (no a los que ya
    // estaban asignados) y nunca a quien hizo el cambio si se auto-asigno.
    const newAssigneeIds = uniqueAssigneeIds.filter((uid) => !prevAssigneeIds.has(uid) && uid !== user!.id);
    if (newAssigneeIds.length > 0) {
      void sendPushToUsers(newAssigneeIds, {
        title: "Te asignaron una tarea",
        body: (title ?? (existing.title as string)) || "Tarea sin titulo",
        url: taskUrl(id),
      });
    }
  }

  const { data, error: dbError } = await supabase
    .from("tasks").update(updates).eq("id", id)
    .select(`
      *,
      contacts ( name ),
      companies ( name ),
      deals ( title ),
      projects!tasks_project_id_fkey ( name ),
      subprojects ( name ),
      task_assignees!task_assignees_task_id_fkey (
        user_id,
        assigned_at,
        profiles!task_assignees_user_id_fkey ( full_name, avatar_url, email )
      )
    `)
    .single();

  if (dbError) {
    return NextResponse.json({ error: `Error al actualizar tarea: ${dbError.message}` }, { status: 500 });
  }

  if (user) void markEntityViewed(supabase, user.id, "task", id);

  await logActivity({
    supabase,
    userId: user!.id,
    userEmail: user!.email,
    action: "update",
    entityType: "task",
    entityId: data.id,
    entityName: data.title,
    projectId: data.project_id ?? data.artist_project_id ?? null,
  });

  return NextResponse.json(mapTask(data));
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: existing, error: findErr } = await supabase
    .from("tasks").select("id, title, project_id, artist_project_id").eq("id", id).single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  }

  // Antes esto exigía "isAdmin" (rol de ORGANIZACIÓN), sin chequear
  // siquiera el proyecto de la tarea. Migrado a la matriz de ESE proyecto
  // (ROLES.md, ítem 3 del rediseño de roles) -- si la tarea no tiene
  // proyecto asignado (permitido hoy), se deja pasar como antes.
  const taskProjectId = existing.project_id || existing.artist_project_id || null;
  if (taskProjectId) {
    if (!allowedProjectIds.includes(taskProjectId)) {
      return NextResponse.json({ error: "No tienes acceso a este proyecto" }, { status: 403 });
    }
    const perm = await getProjectPermissions(supabase, user!.id, taskProjectId);
    if (!canDeleteModule(perm, "tareas")) {
      return NextResponse.json({ error: "Tu rol no puede eliminar tareas en este proyecto" }, { status: 403 });
    }
  }

  const { error: dbError } = await createAdminClient()
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  await logActivity({
    supabase,
    userId: user!.id,
    userEmail: user!.email,
    action: "delete",
    entityType: "task",
    entityId: existing.id,
    entityName: existing.title,
    projectId: existing.project_id ?? existing.artist_project_id ?? null,
  });

  return NextResponse.json({ success: true });
}

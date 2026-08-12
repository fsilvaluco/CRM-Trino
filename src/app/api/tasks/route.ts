import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getViewedAtMap, getLatestCommentAtMap, isUnseen, latestActivityAt } from "@/lib/entity-views";
import { sendPushToUsers } from "@/lib/push";

function taskUrl(taskId: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}/tasks?taskId=${taskId}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTask(row: any, hasUnseenActivity = false) {
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
    // Para la etiqueta de la tarjeta de Kanban: el proyecto MAS ESPECIFICO
    // -- si la tarea esta anclada a un artista, mostrar el artista (no el
    // sello), porque eso es lo que realmente distingue una tarea de otra
    // al ver el catalogo completo desde Trino.
    tagProjectName: row.artist_project?.name ?? row.projects?.name ?? null,
    tagProjectColor: row.artist_project?.theme_color ?? row.projects?.theme_color ?? null,
    tagProjectAvatarUrl: row.artist_project?.avatar_url ?? row.projects?.avatar_url ?? null,
    assignees: row.task_assignees?.map((ta: any) => ({
      userId: ta.user_id,
      assignedAt: ta.assigned_at,
      profile: ta.profiles ? {
        fullName: ta.profiles.full_name,
        avatarUrl: ta.profiles.avatar_url,
        email: ta.profiles.email,
      } : null,
    })) ?? [],
    hasUnseenActivity,
  };
}

export async function GET(request: NextRequest) {
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const contactId = searchParams.get("contactId");
  const companyId = searchParams.get("companyId");
  const dealId = searchParams.get("dealId");
  const projectId = searchParams.get("projectId");
  const subprojectId = searchParams.get("subprojectId");

  let query = supabase
    .from("tasks")
    .select(`
      *,
      contacts ( name ),
      companies ( name ),
      deals ( title ),
      projects!tasks_project_id_fkey ( name, theme_color, avatar_url ),
      artist_project:projects!tasks_artist_project_id_fkey ( name, theme_color, avatar_url ),
      subprojects ( name ),
      task_assignees!task_assignees_task_id_fkey ( 
        user_id, 
        assigned_at,
        profiles!task_assignees_user_id_fkey ( full_name, avatar_url, email ) 
      )
    `)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (priority) query = query.eq("priority", priority);
  if (contactId) query = query.eq("contact_id", contactId);
  if (companyId) query = query.eq("company_id", companyId);
  if (dealId) query = query.eq("deal_id", dealId);
  if (projectId) {
    const { data: children } = await supabase
      .from("projects")
      .select("id")
      .eq("parent_project_id", projectId);

    const visibleIds = [projectId, ...(children ?? []).map((c) => c.id)];

    query = query.or(
      `project_id.in.(${visibleIds.join(",")}),artist_project_id.in.(${visibleIds.join(",")})`
    );
  }
  if (subprojectId) query = query.eq("subproject_id", subprojectId);
  // Filtrar por proyectos accesibles si el usuario es member
  if (allowedProjectIds !== null) {
    if (allowedProjectIds.length === 0) return NextResponse.json([]);
    query = query.in("project_id", allowedProjectIds);
  }

  const { data, error: dbError } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  const tasks = data ?? [];

  // El punto rojo depende de quien esta preguntando -- si no hay usuario
  // (no deberia pasar, requireAuth ya lo exige) simplemente no se calcula.
  if (!user || tasks.length === 0) {
    return NextResponse.json(tasks.map((t) => mapTask(t)));
  }

  const taskIds = tasks.map((t) => t.id as string);
  const [viewedAtMap, lastCommentAtMap] = await Promise.all([
    getViewedAtMap(supabase, user.id, "task", taskIds),
    getLatestCommentAtMap(supabase, "task", taskIds),
  ]);

  return NextResponse.json(
    tasks.map((t) => {
      const lastActivity = latestActivityAt(t.updated_at, lastCommentAtMap.get(t.id));
      const unseen = isUnseen(lastActivity, viewedAtMap.get(t.id));
      return mapTask(t, unseen);
    })
  );
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

  const { title, description, priority, dueDate, contactId, companyId, dealId, projectId, artistProjectId, subprojectId, referenceUrl, assigneeIds } = body;

  if (!title || typeof title !== "string" || title.trim() === "") {
    return NextResponse.json({ error: "El titulo es requerido" }, { status: 400 });
  }

  const { data, error: dbError } = await supabase
    .from("tasks")
    .insert({
      title: title.trim(),
      description: (typeof description === "string" ? description : null) || null,
      status: "sin_empezar",
      priority: (typeof priority === "string" ? priority : null) || "medium",
      due_date: typeof dueDate === "string" && dueDate ? new Date(dueDate).toISOString() : null,
      contact_id: (typeof contactId === "string" ? contactId : null) || null,
      company_id: (typeof companyId === "string" ? companyId : null) || null,
      deal_id: (typeof dealId === "string" ? dealId : null) || null,
      project_id: (typeof projectId === "string" ? projectId : null) || null,
      artist_project_id: (typeof artistProjectId === "string" ? artistProjectId : null) || null,
      subproject_id: (typeof subprojectId === "string" ? subprojectId : null) || null,
      reference_url: (typeof referenceUrl === "string" ? referenceUrl.trim() : null) || null,
      completed_at: null,
      organization_id: orgId,
      created_by: user!.id,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: `Error al crear tarea: ${dbError.message}` }, { status: 500 });
  }

  // Insert assignees if provided
  if (assigneeIds && Array.isArray(assigneeIds) && assigneeIds.length > 0 && data) {
    const assigneesData = assigneeIds.map((userId) => ({
      task_id: data.id,
      user_id: userId,
      assigned_by: user!.id,
    }));

    const { error: assignError } = await supabase
      .from("task_assignees")
      .insert(assigneesData);

    if (assignError) {
      console.error("Failed to assign users to task:", assignError);
      // Non-fatal: task was created, just assignment failed
    } else {
      // Fire-and-forget: no bloquea la respuesta ni falla la creacion de la
      // tarea si el push falla. No se notifica a quien la crea si se
      // auto-asigno.
      const notifyIds = assigneeIds.filter((id): id is string => typeof id === "string" && id !== user!.id);
      void sendPushToUsers(notifyIds, {
        title: "Nueva tarea asignada",
        body: title.trim(),
        url: taskUrl(data.id as string),
      });
    }
  }

  return NextResponse.json(mapTask(data), { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { markEntityViewed } from "@/lib/entity-views";
import { sendPushToUsers } from "@/lib/push";
import { getProjectPermissions, canViewModule } from "@/lib/project-roles";

// Comentar es independiente de Editar -- solo exige `puede_ver` en Tareas
// (ROLES.md 0.2.4). Si la tarea no tiene proyecto asignado (permitido hoy,
// a diferencia de otros módulos), no hay matriz que chequear -- se deja
// pasar como antes, para no romper tareas "sueltas" existentes.
async function checkTaskAccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  allowedProjectIds: string[],
  taskProjectId: string | null
): Promise<NextResponse | null> {
  if (!taskProjectId) return null;
  if (!allowedProjectIds.includes(taskProjectId)) {
    return NextResponse.json({ error: "No tienes acceso a este proyecto" }, { status: 403 });
  }
  const perm = await getProjectPermissions(supabase, userId, taskProjectId);
  if (!canViewModule(perm, "tareas")) {
    return NextResponse.json({ error: "Sin acceso a Tareas para tu rol" }, { status: 403 });
  }
  return null;
}

function taskUrl(taskId: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}/tasks?taskId=${taskId}`;
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: task, error: taskErr } = await supabase
    .from("tasks").select("id, project_id").eq("id", id).single();
  if (taskErr || !task) {
    return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  }

  const accessError = await checkTaskAccess(supabase, user!.id, allowedProjectIds, task.project_id);
  if (accessError) return accessError;

  const { data: comments, error: dbError } = await supabase
    .from("task_comments")
    .select("*")
    .eq("task_id", id)
    .order("created_at", { ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json((comments ?? []).map(mapTaskComment));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) {
    console.error("[task_comments POST] requireAuth error:", error);
    return error;
  }
  if (!user || !orgId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { content, author, mentionedUserIds } = body;

  if (!content || content.trim() === "") {
    return NextResponse.json({ error: "El contenido es requerido" }, { status: 400 });
  }

  const { data: task, error: taskErr } = await supabase
    .from("tasks").select("id, project_id").eq("id", id).single();
  if (taskErr || !task) {
    return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  }

  const accessError = await checkTaskAccess(supabase, user.id, allowedProjectIds, task.project_id);
  if (accessError) return accessError;

  const trimmedContent = content.trim();
  // Si no viene un "author" explicito (lo manda el detector de leads para
  // atribuir el comentario a quien escribio el correo), usar el nombre
  // real de la persona logueada -- antes esto quedaba en "Usuario" fijo
  // para cualquier comentario escrito a mano en la app.
  let normalizedAuthor = author?.trim();
  if (!normalizedAuthor) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();
    normalizedAuthor = profile?.full_name || profile?.email || "Usuario";
  }
  const insertAttempts: Array<{ label: string; payload: Record<string, string | null> }> = [
    {
      label: "full",
      payload: {
        task_id: id,
        content: trimmedContent,
        author: normalizedAuthor,
        author_id: user.id,
        organization_id: orgId,
        created_by: user.id,
      },
    },
    {
      label: "author_id_schema",
      payload: {
        task_id: id,
        content: trimmedContent,
        author: normalizedAuthor,
        author_id: user.id,
        organization_id: orgId,
      },
    },
    {
      label: "created_by_schema",
      payload: {
        task_id: id,
        content: trimmedContent,
        author: normalizedAuthor,
        organization_id: orgId,
        created_by: user.id,
      },
    },
    {
      label: "id_only_with_org",
      payload: {
        task_id: id,
        content: trimmedContent,
        author_id: user.id,
        organization_id: orgId,
        created_by: user.id,
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
      void markEntityViewed(supabase, user.id, "task", id);

      // Crear una notificacion de mencion por cada persona etiquetada con @
      if (Array.isArray(mentionedUserIds) && mentionedUserIds.length > 0) {
        const uniqueMentioned = Array.from(new Set(mentionedUserIds)).filter(
          (uid) => uid !== user.id
        );
        if (uniqueMentioned.length > 0) {
          await supabase.from("mentions").insert(
            uniqueMentioned.map((mentionedUserId) => ({
              organization_id: orgId,
              mentioned_user_id: mentionedUserId,
              mentioned_by: user.id,
              task_id: id,
              comment_id: result.data.id,
              snippet: trimmedContent.slice(0, 200),
            }))
          );
          void sendPushToUsers(uniqueMentioned, {
            title: `${normalizedAuthor} te mencionó en una tarea`,
            body: trimmedContent.slice(0, 150),
            url: taskUrl(id),
          });
        }
      }
      return NextResponse.json(mapTaskComment(result.data), { status: 201 });
    }

    lastErrorMessage = result.error.message;
    console.error(`[task_comments POST] ${attempt.label} insert error:`, result.error);
  }

  return NextResponse.json(
    { error: `Error al crear comentario: ${lastErrorMessage}` },
    { status: 500 }
  );
}

import { z } from "zod";
import type { McpContext } from "@/lib/mcp/auth";
import { getProjectPermissions, getProjectPermissionsForMany, canViewModule } from "@/lib/project-roles";
import { markEntityViewed } from "@/lib/entity-views";
import { logActivity } from "@/lib/activity-logs";

// Herramientas que el servidor MCP le ofrece a Claude. La lista es corta A
// PROPOSITO: por Claude solo se pueden ver las tareas propias, cambiarles el
// estado y comentar. No hay herramientas para borrar, reasignar, tocar
// finanzas ni configuracion -- aunque la persona si pueda hacerlo en la web.

const TASK_STATUSES = ["sin_empezar", "en_curso", "revisar", "listo", "descartado"] as const;
const OPEN_STATUSES = ["sin_empezar", "en_curso", "revisar"];
const DONE_STATUSES = ["listo", "descartado"];

const STATUS_LABELS: Record<string, string> = {
  sin_empezar: "Sin empezar",
  en_curso: "En curso",
  revisar: "Revisar",
  listo: "Listo",
  descartado: "Descartado",
};
const PRIORITY_LABELS: Record<string, string> = { low: "Baja", medium: "Media", high: "Alta" };

export class ToolError extends Error {}

const taskIdSchema = z.uuid().describe("ID de la tarea (campo `id` que devuelve mis_tareas)");

const misTareasInput = z.object({
  estado: z
    .enum(["pendientes", ...TASK_STATUSES, "todas"])
    .default("pendientes")
    .describe("`pendientes` (por defecto) = sin empezar + en curso + revisar. `todas` incluye listas y descartadas."),
  proyecto: z.string().trim().min(1).optional().describe("Filtra por nombre de proyecto o artista (coincidencia parcial)"),
  limite: z.number().int().min(1).max(100).default(50).describe("Maximo de tareas a devolver"),
});
const verTareaInput = z.object({ tarea_id: taskIdSchema });
const actualizarEstadoInput = z.object({
  tarea_id: taskIdSchema,
  estado: z.enum(TASK_STATUSES).describe("Nuevo estado de la tarea"),
});
const comentarTareaInput = z.object({
  tarea_id: taskIdSchema,
  comentario: z.string().trim().min(1).max(4000).describe("Texto del comentario, por ejemplo el avance realizado"),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

function taskUrl(ctx: McpContext, taskId: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || ctx.origin;
  return `${base.replace(/\/+$/, "")}/tasks?taskId=${taskId}`;
}

function assigneeNames(row: Row): string[] {
  return (row.task_assignees ?? [])
    .map((a: Row) => a.profiles?.full_name || a.profiles?.email)
    .filter(Boolean);
}

function summarizeTask(ctx: McpContext, row: Row, descriptionLimit: number | null) {
  const open = OPEN_STATUSES.includes(row.status);
  const description: string | null = row.description ?? null;
  return {
    id: row.id,
    titulo: row.title,
    estado: row.status,
    estado_etiqueta: STATUS_LABELS[row.status] ?? row.status,
    prioridad: PRIORITY_LABELS[row.priority] ?? row.priority,
    vence: row.due_date ?? null,
    atrasada: Boolean(open && row.due_date && new Date(row.due_date).getTime() < Date.now()),
    proyecto: row.artist_project?.name ?? row.projects?.name ?? null,
    subproyecto: row.subprojects?.name ?? null,
    descripcion:
      description && descriptionLimit !== null && description.length > descriptionLimit
        ? `${description.slice(0, descriptionLimit)}…`
        : description,
    responsables: assigneeNames(row),
    link_referencia: row.reference_url ?? null,
    url: taskUrl(ctx, row.id),
  };
}

const TASK_SELECT = `
  id, title, description, status, priority, due_date, completed_at, project_id,
  artist_project_id, reference_url, updated_at,
  projects!tasks_project_id_fkey ( name ),
  artist_project:projects!tasks_artist_project_id_fkey ( name ),
  subprojects ( name ),
  task_assignees!task_assignees_task_id_fkey (
    user_id,
    profiles!task_assignees_user_id_fkey ( full_name, email )
  )
`;

/**
 * Trae una tarea y verifica que la persona pueda verla, con la misma regla
 * que la web (proyecto accesible + `puede_ver` en el modulo Tareas). Una
 * tarea que no existe y una sin acceso responden igual, para no revelar que
 * existe.
 */
async function loadAccessibleTask(ctx: McpContext, taskId: string): Promise<Row> {
  const { data: task } = await ctx.supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();

  const notFound = new ToolError("No se encontro la tarea o no tienes acceso a ella.");
  if (!task) throw notFound;

  if (task.project_id) {
    if (!ctx.allowedProjectIds.includes(task.project_id)) throw notFound;
    const perm = await getProjectPermissions(ctx.supabase, ctx.user.id, task.project_id);
    if (!canViewModule(perm, "tareas")) throw notFound;
  }
  return task;
}

async function misTareas(ctx: McpContext, input: z.infer<typeof misTareasInput>) {
  let query = ctx.supabase
    .from("tasks")
    .select(`${TASK_SELECT}, mine:task_assignees!task_assignees_task_id_fkey!inner ( user_id )`)
    .eq("mine.user_id", ctx.user.id)
    .is("deleted_at", null)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(500);

  if (input.estado === "pendientes") query = query.in("status", OPEN_STATUSES);
  else if (input.estado !== "todas") query = query.eq("status", input.estado);

  const { data, error } = await query;
  if (error) throw new ToolError(`No se pudieron leer las tareas: ${error.message}`);

  const rows: Row[] = data ?? [];
  const permsByProject = await getProjectPermissionsForMany(
    ctx.supabase,
    ctx.user.id,
    rows.map((t) => t.project_id).filter(Boolean)
  );
  const needle = input.proyecto?.toLowerCase();
  const visible = rows.filter((t) => {
    if (t.project_id) {
      if (!ctx.allowedProjectIds.includes(t.project_id)) return false;
      if (!canViewModule(permsByProject.get(t.project_id) ?? null, "tareas")) return false;
    }
    if (!needle) return true;
    return [t.artist_project?.name, t.projects?.name, t.subprojects?.name]
      .filter(Boolean)
      .some((name: string) => name.toLowerCase().includes(needle));
  });

  return {
    fecha_actual: new Date().toISOString(),
    total: visible.length,
    tareas: visible.slice(0, input.limite).map((t) => summarizeTask(ctx, t, 300)),
  };
}

async function verTarea(ctx: McpContext, input: z.infer<typeof verTareaInput>) {
  const task = await loadAccessibleTask(ctx, input.tarea_id);
  const { data: comments } = await ctx.supabase
    .from("task_comments")
    .select("author, content, created_at")
    .eq("task_id", task.id)
    .order("created_at", { ascending: false })
    .limit(30);

  void markEntityViewed(ctx.supabase, ctx.user.id, "task", task.id);

  return {
    ...summarizeTask(ctx, task, null),
    completada_el: task.completed_at ?? null,
    comentarios: (comments ?? [])
      .reverse()
      .map((c: Row) => ({ autor: c.author ?? "Usuario", texto: c.content ?? "", fecha: c.created_at })),
  };
}

async function actualizarEstado(ctx: McpContext, input: z.infer<typeof actualizarEstadoInput>) {
  const task = await loadAccessibleTask(ctx, input.tarea_id);

  // Por Claude solo se mueven las tareas PROPIAS (donde la persona figura
  // como responsable); las de otros se gestionan en la web.
  const isAssignee = (task.task_assignees ?? []).some((a: Row) => a.user_id === ctx.user.id);
  if (!isAssignee) {
    throw new ToolError("Solo puedes cambiar el estado de tareas en las que eres responsable.");
  }

  const previous = task.status as string;
  if (previous === input.estado) {
    return { ...summarizeTask(ctx, task, 300), mensaje: "La tarea ya estaba en ese estado." };
  }

  // Misma regla que PUT /api/tasks/[id] para la fecha de cierre.
  const wasDone = DONE_STATUSES.includes(previous);
  const willBeDone = DONE_STATUSES.includes(input.estado);
  const completedAt = willBeDone ? (wasDone ? task.completed_at : new Date().toISOString()) : null;

  const { data: updated, error } = await ctx.supabase
    .from("tasks")
    .update({ status: input.estado, completed_at: completedAt, updated_at: new Date().toISOString() })
    .eq("id", task.id)
    .select(TASK_SELECT)
    .maybeSingle();
  if (error || !updated) {
    throw new ToolError(`No se pudo actualizar la tarea${error ? `: ${error.message}` : "."}`);
  }

  void markEntityViewed(ctx.supabase, ctx.user.id, "task", task.id);
  await logActivity({
    supabase: ctx.supabase,
    userId: ctx.user.id,
    userEmail: ctx.user.email,
    action: "update",
    entityType: "task",
    entityId: task.id,
    entityName: task.title,
    projectId: task.project_id ?? task.artist_project_id ?? null,
  });

  return { ...summarizeTask(ctx, updated, 300), estado_anterior: previous };
}

async function comentarTarea(ctx: McpContext, input: z.infer<typeof comentarTareaInput>) {
  const task = await loadAccessibleTask(ctx, input.tarea_id);

  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", ctx.user.id)
    .maybeSingle();
  const author = profile?.full_name || profile?.email || "Usuario";

  const { data: comment, error } = await ctx.supabase
    .from("task_comments")
    .insert({
      task_id: task.id,
      content: input.comentario,
      author,
      author_id: ctx.user.id,
      created_by: ctx.user.id,
      organization_id: ctx.orgId,
    })
    .select("id, created_at")
    .single();
  if (error) throw new ToolError(`No se pudo guardar el comentario: ${error.message}`);

  void markEntityViewed(ctx.supabase, ctx.user.id, "task", task.id);

  return { comentario_id: comment.id, tarea: task.title, autor: author, fecha: comment.created_at, url: taskUrl(ctx, task.id) };
}

interface ToolDefinition<S extends z.ZodType> {
  name: string;
  title: string;
  description: string;
  input: S;
  readOnly: boolean;
  run: (ctx: McpContext, input: z.infer<S>) => Promise<unknown>;
}

function defineTool<S extends z.ZodType>(tool: ToolDefinition<S>) {
  return tool;
}

export const MCP_TOOLS = [
  defineTool({
    name: "mis_tareas",
    title: "Mis tareas",
    description:
      "Lista las tareas de Artist Pro asignadas a la persona conectada. Por defecto devuelve solo las pendientes, ordenadas por fecha de vencimiento. Usala para responder \"que tengo pendiente\".",
    input: misTareasInput,
    readOnly: true,
    run: misTareas,
  }),
  defineTool({
    name: "ver_tarea",
    title: "Ver tarea",
    description: "Devuelve el detalle completo de una tarea (descripcion, responsables, fechas) y sus ultimos comentarios.",
    input: verTareaInput,
    readOnly: true,
    run: verTarea,
  }),
  defineTool({
    name: "actualizar_estado",
    title: "Cambiar estado de una tarea",
    description:
      "Cambia el estado de una tarea propia (sin_empezar, en_curso, revisar, listo, descartado). Solo funciona en tareas donde la persona conectada es responsable.",
    input: actualizarEstadoInput,
    readOnly: false,
    run: actualizarEstado,
  }),
  defineTool({
    name: "comentar_tarea",
    title: "Comentar una tarea",
    description: "Agrega un comentario a una tarea a nombre de la persona conectada, por ejemplo para dejar registro de un avance.",
    input: comentarTareaInput,
    readOnly: false,
    run: comentarTarea,
  }),
];

export function listToolDescriptors() {
  return MCP_TOOLS.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.input, { io: "input" }),
    annotations: {
      title: tool.title,
      readOnlyHint: tool.readOnly,
      destructiveHint: false,
      openWorldHint: false,
    },
  }));
}

export async function callTool(ctx: McpContext, name: string, args: unknown): Promise<unknown> {
  const tool = MCP_TOOLS.find((t) => t.name === name);
  if (!tool) throw new ToolError(`Herramienta desconocida: ${name}`);

  const parsed = tool.input.safeParse(args ?? {});
  if (!parsed.success) {
    throw new ToolError(`Parametros invalidos: ${z.prettifyError(parsed.error)}`);
  }
  // El tipo exacto del input se pierde al recorrer la lista heterogenea.
  return (tool.run as (c: McpContext, input: unknown) => Promise<unknown>)(ctx, parsed.data);
}

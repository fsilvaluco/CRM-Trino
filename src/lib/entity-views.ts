import type { SupabaseClient } from "@supabase/supabase-js";

// ─── "Punto rojo" de actividad no vista, para tareas y deals ────────────────
// Ver migracion 045_entity_views.sql para el porque de la forma de la tabla.

export type ViewableEntityType = "task" | "deal";

/**
 * Marca un item como visto por este usuario AHORA. Se llama cada vez que se
 * carga su detalle completo (sheet de tarea, pagina de deal) -- incluye
 * implicitamente al propio autor de un cambio: si edito/comento algo y
 * despues reabro el detalle, mi punto se apaga solo.
 *
 * Deliberadamente "fire and forget" en los callers (no se espera ni se
 * bloquea la respuesta por esto) -- si falla, en el peor caso el punto
 * sigue prendido una vez mas de lo necesario, no es data critica.
 */
export async function markEntityViewed(
  supabase: SupabaseClient,
  userId: string,
  entityType: ViewableEntityType,
  entityId: string
): Promise<void> {
  await supabase
    .from("entity_views")
    .upsert(
      { user_id: userId, entity_type: entityType, entity_id: entityId, viewed_at: new Date().toISOString() },
      { onConflict: "user_id,entity_type,entity_id" }
    );
}

/**
 * Trae, para una lista de items, la ultima vez que ESTE usuario los vio.
 * Devuelve un Map<entityId, viewedAtISOString> -- un item sin entrada no
 * ha sido visto nunca por este usuario.
 */
export async function getViewedAtMap(
  supabase: SupabaseClient,
  userId: string,
  entityType: ViewableEntityType,
  entityIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (entityIds.length === 0) return map;

  const { data } = await supabase
    .from("entity_views")
    .select("entity_id, viewed_at")
    .eq("user_id", userId)
    .eq("entity_type", entityType)
    .in("entity_id", entityIds);

  for (const row of data ?? []) {
    map.set(row.entity_id, row.viewed_at);
  }
  return map;
}

/**
 * true si `lastActivityAt` (updated_at del item, o el created_at del
 * comentario mas reciente, lo que sea mas nuevo) es posterior a la ultima
 * vez que este usuario vio el item. Sin entrada previa = nunca visto.
 */
export function isUnseen(lastActivityAt: string | null, viewedAt: string | undefined): boolean {
  if (!lastActivityAt) return false;
  if (!viewedAt) return true;
  return new Date(lastActivityAt).getTime() > new Date(viewedAt).getTime();
}

/** El mas reciente entre updated_at del item y el created_at de su ultimo comentario. */
export function latestActivityAt(updatedAt: string | null, lastCommentAt: string | null | undefined): string | null {
  if (!updatedAt && !lastCommentAt) return null;
  if (!lastCommentAt) return updatedAt;
  if (!updatedAt) return lastCommentAt;
  return new Date(lastCommentAt).getTime() > new Date(updatedAt).getTime() ? lastCommentAt : updatedAt;
}

/**
 * Trae, para una lista de items, la fecha del comentario mas reciente de
 * cada uno. Devuelve un Map<entityId, createdAtISOString>.
 */
export async function getLatestCommentAtMap(
  supabase: SupabaseClient,
  entityType: ViewableEntityType,
  entityIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (entityIds.length === 0) return map;

  const table = entityType === "task" ? "task_comments" : "deal_comments";
  const column = entityType === "task" ? "task_id" : "deal_id";

  const { data } = await supabase
    .from(table)
    .select(`${column}, created_at`)
    .in(column, entityIds)
    .order("created_at", { ascending: false });

  for (const row of (data ?? []) as Array<Record<string, string>>) {
    const id = row[column];
    if (!map.has(id)) map.set(id, row.created_at);
  }
  return map;
}

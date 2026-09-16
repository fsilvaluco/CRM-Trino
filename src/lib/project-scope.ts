// ─── Alcance por proyecto ───────────────────────────────────────────────────
// Que proyectos "cuentan" cuando se esta trabajando dentro de uno: el proyecto
// y sus hijos, mismo criterio que usa la lista de Eventos con un proyecto
// seleccionado (/api/eventos?projectId=).
//
// Nacio de un reporte de Francisco (16 sep 2026): parado en un evento de un
// artista, el selector de "copiar costos de otro evento" le mostraba eventos
// de todos los demas proyectos de la organizacion, con sus montos. El permiso
// no alcanzaba a filtrarlos porque un admin ve todos los proyectos -- lo que
// faltaba era el alcance, no el permiso.

/**
 * Los ids de proyecto de los que se puede leer estando dentro de `projectId`:
 * el propio y sus hijos directos.
 *
 * Devuelve null cuando no hay proyecto (eventos legacy sin `project_id`). Ese
 * null NO significa "todos": significa "sin proyecto", y quien llama tiene que
 * tratarlo como tal -- ver `isInProjectScope`.
 */
export async function projectScopeIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string | null
): Promise<string[] | null> {
  if (!projectId) return null;
  const { data: children } = await supabase
    .from("projects")
    .select("id")
    .eq("parent_project_id", projectId);
  return [projectId, ...(children ?? []).map((c: { id: string }) => c.id)];
}

/**
 * Si un proyecto cae dentro del alcance. Con `scopeIds` en null (se esta en un
 * evento sin proyecto) solo entra lo que tampoco tiene proyecto: mandar todos
 * los eventos huerfanos al saco comun seria la misma fuga al reves.
 */
export function isInProjectScope(scopeIds: string[] | null, projectId: string | null): boolean {
  return scopeIds ? projectId != null && scopeIds.includes(projectId) : projectId == null;
}

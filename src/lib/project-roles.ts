// ─── Roles y permisos granulares por proyecto ────────────────────────────────
// Fase 1 (18 ago 2026, pedido explícito de Francisco): antes de esto,
// `project_members.role` existía (admin/member/artist) pero era puramente
// decorativo -- ninguna ruta lo miraba para restringir nada. Acá vive la
// única fuente de verdad de qué puede ver/editar cada rol, para no repetir
// la lógica en cada endpoint.
//
// Fase 2 (23 ago 2026, corrección de seguridad -- Francisco encontró que
// podía ver eventos de un proyecto ajeno): el rol de ORGANIZACIÓN
// (owner/admin/member) YA NO otorga acceso automático a un proyecto.
// Cada persona -- sin excepción, incluido el dueño de la agencia --
// necesita una fila explícita en `project_members` para ver/editar algo
// de ese proyecto puntual. El rol de organización sigue existiendo para
// acciones administrativas de la organización en sí (billing, invitar
// gente, borrar cosas a nivel org), pero no para datos de un proyecto.
//
// Roles POR PROYECTO:
// - "admin" / "member": manager/productor -- acceso completo a ese
//   proyecto puntual.
// - "artist": ve Deals (solo lectura, no puede editarlos/moverlos de
//   etapa). Ve los Costos de eventos (resumen + detalle) de SOLO LECTURA --
//   necesita verlos porque es uno de los firmantes requeridos del cierre de
//   caja (ver signatures/route.ts) y no tendría sentido pedirle que apruebe
//   números que no puede ver. No puede editar la Planilla ni cerrar/reabrir
//   la caja, eso sigue siendo de Admin/Member.
// - "staff" (sonidista, asistente de producción, músicos, etc.): el módulo
//   de Deals/CRM queda oculto por completo -- y a diferencia de "artist",
//   NO ve nada de plata de eventos (ni el resumen ni el detalle) porque no
//   es firmante requerido del cierre de caja.
// - Sin fila en `project_members` (role === null) = SIN ACCESO a ese
//   proyecto, punto. Antes esto "no restringía" por default -- ese era
//   justo el hueco de seguridad que dejaba ver proyectos ajenos.
//
// Deliberadamente NO cubre todavía Finanzas general ni Métricas -- eso
// queda para una fase 2 si Francisco lo pide.

export type ProjectRole = "admin" | "member" | "artist" | "staff";

export const PROJECT_ROLES: ProjectRole[] = ["admin", "member", "artist", "staff"];

export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  admin: "Admin",
  member: "Manager",
  artist: "Artista",
  staff: "Staff técnico",
};

// "admin"/"member" a nivel de PROYECTO = acceso completo (equivalentes
// para efectos de permisos -- la distinción admin/member de project_members
// hoy es solo jerárquica/informativa, no cambia lo que se puede ver).
const FULL_ACCESS_ROLES = new Set<ProjectRole>(["admin", "member"]);

function normalizeRole(role: string | null | undefined): ProjectRole | null {
  if (role === "admin" || role === "member" || role === "artist" || role === "staff") return role;
  return null;
}

/**
 * Trae el rol del usuario en un proyecto específico. `null` si no es
 * project_member de ese proyecto -- en ese caso NO tiene acceso a nada de
 * ese proyecto, sin excepción (ver nota de Fase 2 arriba).
 */
export async function getProjectRole(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  projectId: string | null
): Promise<ProjectRole | null> {
  if (!projectId) return null;
  const { data } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  return normalizeRole(data?.role);
}

/** Deals: "staff" no ve el módulo; todos los demás sí (necesita ser project_member). */
export function canViewDeals(role: ProjectRole | null): boolean {
  if (role === null) return false;
  return role !== "staff";
}

/** Deals: solo "artist" es de solo-lectura -- no puede crear/editar/mover/borrar. */
export function canEditDeals(role: ProjectRole | null): boolean {
  if (role === null) return false;
  return FULL_ACCESS_ROLES.has(role);
}

/** Costos de eventos (ver): todos menos "staff" (necesita ser project_member). */
export function canViewEventCosts(role: ProjectRole | null): boolean {
  if (role === null) return false;
  return role !== "staff";
}

/** Costos de eventos (editar/cerrar/reabrir caja): solo admin/member -- "artist" los ve pero no los toca. */
export function canEditEventCosts(role: ProjectRole | null): boolean {
  if (role === null) return false;
  return FULL_ACCESS_ROLES.has(role);
}

// ─── Roles y permisos granulares por proyecto ────────────────────────────────
// Fase 1 (18 ago 2026, pedido explícito de Francisco): antes de esto,
// `project_members.role` existía (admin/member/artist) pero era puramente
// decorativo -- ninguna ruta lo miraba para restringir nada. Acá vive la
// única fuente de verdad de qué puede ver/editar cada rol, para no repetir
// la lógica en cada endpoint.
//
// Roles:
// - "admin" / "member" (o ser admin de la ORGANIZACIÓN, que siempre pasa
//   por encima de esto): manager/productor -- acceso completo, sin cambios
//   respecto de como funcionaba la app hasta ahora.
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
 * project_member de ese proyecto (ej. un admin de la org que no está
 * explícitamente agregado -- eso está bien, `isOrgAdmin` ya lo cubre en
 * las funciones `can*` de abajo).
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

/** Deals: "staff" no ve el módulo; todos los demás sí. */
export function canViewDeals(isOrgAdmin: boolean, role: ProjectRole | null): boolean {
  if (isOrgAdmin) return true;
  if (role === null) return true; // sin project_members explícito -- no restringir por default
  return role !== "staff";
}

/** Deals: solo "artist" es de solo-lectura -- no puede crear/editar/mover/borrar. */
export function canEditDeals(isOrgAdmin: boolean, role: ProjectRole | null): boolean {
  if (isOrgAdmin) return true;
  if (role === null) return true;
  return FULL_ACCESS_ROLES.has(role);
}

/** Costos de eventos (ver): todos menos "staff". */
export function canViewEventCosts(isOrgAdmin: boolean, role: ProjectRole | null): boolean {
  if (isOrgAdmin) return true;
  if (role === null) return true;
  return role !== "staff";
}

/** Costos de eventos (editar/cerrar/reabrir caja): solo admin/member -- "artist" los ve pero no los toca. */
export function canEditEventCosts(isOrgAdmin: boolean, role: ProjectRole | null): boolean {
  if (isOrgAdmin) return true;
  if (role === null) return true;
  return FULL_ACCESS_ROLES.has(role);
}

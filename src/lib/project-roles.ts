// ─── Permisos granulares por proyecto -- matriz persona × módulo ─────────────
// Fase 1 (18 ago 2026): `project_members.role` existía pero era decorativo.
// Fase 2 (23 ago 2026): se sacó el bypass de admin de ORGANIZACIÓN -- el
// acceso a un proyecto se rige 100% por `project_members`, sin excepciones.
// Fase 3 (23 ago 2026, mismo día): herencia por proyecto madre/sello --
// alguien con fila en la madre opera igual en los hijos.
//
// Fase 4 (24 ago 2026, rediseño "solo proyecto" -- ver ROLES.md sección 0):
// `project_members.role` deja de gobernar el permiso -- pasa a ser solo una
// PLANTILLA de partida, visible al agregar a alguien o al mirar el listado.
// El permiso real vive en `project_member_permissions`: una fila por persona
// por MÓDULO (contactos/empresas/deals/tareas/eventos/campanas/finanzas),
// con puede_ver / puede_editar / puede_eliminar / ve_ingresos / ve_costos --
// editable persona por persona desde el Gestor de Integrantes. Motivo del
// cambio: casos reales (Rodrick, Gonzalo, Daniela) no encajaban en ningún
// combo fijo de 4 roles -- ver ROLES.md 0.2.3 para el detalle de cada caso.
//
// "Gestionar equipo" (invitar/dar de baja/editar la matriz de otros) es su
// propio interruptor (`project_members.puede_gestionar_equipo`),
// independiente de cuánto acceso a módulos tenga la persona (ROLES.md 0.2.1).
//
// La herencia por proyecto madre sigue igual que en Fase 3, pero ahora trae
// la MATRIZ completa de la madre, no solo un rol (ROLES.md 0.6).

export type ProjectRole = "admin" | "member" | "artist" | "staff";

export const PROJECT_ROLES: ProjectRole[] = ["admin", "member", "artist", "staff"];

export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  admin: "Admin",
  member: "Manager",
  artist: "Artista",
  staff: "Staff técnico",
};

export type ModuleKey =
  | "contactos"
  | "empresas"
  | "deals"
  | "tareas"
  | "eventos"
  | "campanas"
  | "finanzas";

export const MODULE_KEYS: ModuleKey[] = [
  "contactos",
  "empresas",
  "deals",
  "tareas",
  "eventos",
  "campanas",
  "finanzas",
];

export interface ModulePermission {
  puedeVer: boolean;
  puedeEditar: boolean;
  puedeEliminar: boolean;
  veIngresos: boolean;
  veCostos: boolean;
}

const SIN_ACCESO: ModulePermission = {
  puedeVer: false,
  puedeEditar: false,
  puedeEliminar: false,
  veIngresos: false,
  veCostos: false,
};

export interface ProjectPermissions {
  /** Plantilla de partida (informativa) -- ya NO gobierna el permiso. */
  role: ProjectRole | null;
  puedeGestionarEquipo: boolean;
  modules: Record<ModuleKey, ModulePermission>;
}

function normalizeRole(role: string | null | undefined): ProjectRole | null {
  if (role === "admin" || role === "member" || role === "artist" || role === "staff") return role;
  return null;
}

interface MembershipRow {
  id: string;
  role: string | null;
  puede_gestionar_equipo: boolean | null;
}

async function findMembership(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  projectId: string
): Promise<MembershipRow | null> {
  const { data } = await supabase
    .from("project_members")
    .select("id, role, puede_gestionar_equipo")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

/**
 * Trae la matriz de permisos del usuario en un proyecto específico. `null`
 * si no es project_member de ese proyecto NI de su proyecto madre (si
 * tiene) -- en ese caso NO tiene acceso a nada de ese proyecto, sin
 * excepción. Si tiene fila en la madre pero no fila directa en el hijo, se
 * usa la matriz COMPLETA de la madre (ROLES.md 0.6 -- sin matriz aparte por
 * hijo en esta primera versión).
 */
export async function getProjectPermissions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  projectId: string | null
): Promise<ProjectPermissions | null> {
  if (!projectId) return null;

  let membership = await findMembership(supabase, userId, projectId);

  if (!membership) {
    const { data: project } = await supabase
      .from("projects")
      .select("parent_project_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project?.parent_project_id) return null;
    membership = await findMembership(supabase, userId, project.parent_project_id);
    if (!membership) return null;
  }

  const { data: rows } = await supabase
    .from("project_member_permissions")
    .select("module, puede_ver, puede_editar, puede_eliminar, ve_ingresos, ve_costos")
    .eq("project_member_id", membership.id);

  const modules = MODULE_KEYS.reduce((acc, key) => {
    const row = (rows ?? []).find((r: { module: string }) => r.module === key);
    acc[key] = row
      ? {
          puedeVer: Boolean(row.puede_ver),
          puedeEditar: Boolean(row.puede_editar),
          puedeEliminar: Boolean(row.puede_eliminar),
          veIngresos: Boolean(row.ve_ingresos),
          veCostos: Boolean(row.ve_costos),
        }
      : SIN_ACCESO;
    return acc;
  }, {} as Record<ModuleKey, ModulePermission>);

  return {
    role: normalizeRole(membership.role),
    puedeGestionarEquipo: Boolean(membership.puede_gestionar_equipo),
    modules,
  };
}

function moduleOf(perm: ProjectPermissions | null, module: ModuleKey): ModulePermission {
  return perm?.modules[module] ?? SIN_ACCESO;
}

// ── Deals ──────────────────────────────────────────────────────────────────
export function canViewDeals(perm: ProjectPermissions | null): boolean {
  return moduleOf(perm, "deals").puedeVer;
}
export function canEditDeals(perm: ProjectPermissions | null): boolean {
  return moduleOf(perm, "deals").puedeEditar;
}
export function canDeleteDeals(perm: ProjectPermissions | null): boolean {
  return moduleOf(perm, "deals").puedeEliminar;
}

// ── Eventos ────────────────────────────────────────────────────────────────
// "Ver costos" hoy se usa para gatear la sección financiera completa del
// evento (fee/ticketIncome/expenses/Planilla) -- corresponde a
// veIngresos || veCostos del módulo Eventos, no solo puedeVer del módulo
// (puedeVer=true para todos con acceso al evento, incluido staff, que ve la
// logística pero no la plata -- ROLES.md 0.2).
export function canViewEventCosts(perm: ProjectPermissions | null): boolean {
  const m = moduleOf(perm, "eventos");
  return m.veIngresos || m.veCostos;
}
// Editar la Planilla/cerrar caja exige poder editar el evento Y ver los
// costos -- no tendría sentido editar números que no se pueden ver.
export function canEditEventCosts(perm: ProjectPermissions | null): boolean {
  const m = moduleOf(perm, "eventos");
  return m.puedeEditar && m.veCostos;
}
export function canViewEvent(perm: ProjectPermissions | null): boolean {
  return moduleOf(perm, "eventos").puedeVer;
}
export function canEditEvent(perm: ProjectPermissions | null): boolean {
  return moduleOf(perm, "eventos").puedeEditar;
}

/**
 * Trae la matriz de permisos del usuario para VARIOS proyectos a la vez --
 * necesario para listados agregados (ej. Deals/Pipeline sin `?projectId=`,
 * modo "Todos los proyectos") donde cada fila puede pertenecer a un
 * proyecto distinto y por lo tanto tener un permiso distinto (ROLES.md 0.5:
 * la vista agregada respeta la matriz de CADA proyecto individualmente, no
 * es un resumen plano).
 */
export async function getProjectPermissionsForMany(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  projectIds: string[]
): Promise<Map<string, ProjectPermissions | null>> {
  const uniqueIds = Array.from(new Set(projectIds.filter(Boolean)));
  const results = await Promise.all(
    uniqueIds.map((id) => getProjectPermissions(supabase, userId, id))
  );
  return new Map(uniqueIds.map((id, i) => [id, results[i]]));
}

// ── Tareas / Campañas / Contactos / Empresas / Finanzas ────────────────────
export function canViewModule(perm: ProjectPermissions | null, module: ModuleKey): boolean {
  return moduleOf(perm, module).puedeVer;
}
export function canEditModule(perm: ProjectPermissions | null, module: ModuleKey): boolean {
  return moduleOf(perm, module).puedeEditar;
}
export function canDeleteModule(perm: ProjectPermissions | null, module: ModuleKey): boolean {
  return moduleOf(perm, module).puedeEliminar;
}

// ── Gestión de equipo (independiente de la matriz de módulos, 0.2.1) ───────
export function canManageTeam(perm: ProjectPermissions | null): boolean {
  return perm?.puedeGestionarEquipo ?? false;
}

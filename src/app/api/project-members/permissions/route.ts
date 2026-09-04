import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { canManageTeam, getProjectPermissions, MODULE_KEYS, type ModuleKey, type ModulePermission } from "@/lib/project-roles";

// "Gestor de Integrantes" (ROLES.md Prioridad 6): editor de la matriz
// persona × módulo (puede_ver/puede_editar/puede_eliminar/ve_ingresos/
// ve_costos) que hasta ahora solo se podía tocar a mano en la base de
// datos. Es DISTINTO de PATCH /api/project-members (que solo cambia la
// plantilla `role`, informativa) -- esto edita el permiso real.
//
// Solo aplica a una fila DIRECTA de project_members en ESE proyecto (no a
// alguien que solo hereda acceso desde el proyecto madre) -- si la persona
// no tiene fila propia acá, no hay qué editar.
async function requireProjectManager(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  projectId: string
): Promise<NextResponse | null> {
  const perm = await getProjectPermissions(supabase, userId, projectId);
  if (!canManageTeam(perm)) {
    return NextResponse.json({ error: "No gestionas equipo en este proyecto" }, { status: 403 });
  }
  return null;
}

const EMPTY_MODULE: ModulePermission = {
  puedeVer: false,
  puedeEditar: false,
  puedeEliminar: false,
  veIngresos: false,
  veCostos: false,
};

// GET /api/project-members/permissions?projectId=xxx&userId=yyy -- matriz
// CRUDA de esa persona en ESE proyecto (no la efectiva/heredada que usa
// getProjectPermissions para gatear acciones -- acá se edita la fila real).
export async function GET(request: NextRequest) {
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const userId = searchParams.get("userId");
  if (!projectId || !userId) {
    return NextResponse.json({ error: "projectId y userId requeridos" }, { status: 400 });
  }
  if (!allowedProjectIds.includes(projectId)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }
  const managerError = await requireProjectManager(supabase, user!.id, projectId);
  if (managerError) return managerError;

  const { data: member } = await supabase
    .from("project_members")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "Esa persona no tiene una fila directa en este proyecto" }, { status: 404 });
  }

  const { data: rows } = await supabase
    .from("project_member_permissions")
    .select("module, puede_ver, puede_editar, puede_eliminar, ve_ingresos, ve_costos")
    .eq("project_member_id", member.id);

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
      : EMPTY_MODULE;
    return acc;
  }, {} as Record<ModuleKey, ModulePermission>);

  return NextResponse.json({ modules });
}

// PUT /api/project-members/permissions -- guarda la matriz completa de esa
// persona en ese proyecto (7 módulos de una vez, sobreescribe lo que había).
export async function PUT(request: NextRequest) {
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const { projectId, userId, modules } = body as {
    projectId?: string;
    userId?: string;
    modules?: Record<string, ModulePermission>;
  };
  if (!projectId || !userId || !modules) {
    return NextResponse.json({ error: "projectId, userId y modules son requeridos" }, { status: 400 });
  }
  if (!allowedProjectIds.includes(projectId)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }
  const managerError = await requireProjectManager(supabase, user!.id, projectId);
  if (managerError) return managerError;

  const { data: member } = await supabase
    .from("project_members")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "Esa persona no tiene una fila directa en este proyecto" }, { status: 404 });
  }

  const rows = MODULE_KEYS.filter((key) => modules[key]).map((key) => ({
    project_member_id: member.id,
    module: key,
    puede_ver: Boolean(modules[key].puedeVer),
    puede_editar: Boolean(modules[key].puedeEditar),
    puede_eliminar: Boolean(modules[key].puedeEliminar),
    ve_ingresos: Boolean(modules[key].veIngresos),
    ve_costos: Boolean(modules[key].veCostos),
  }));

  const { error: dbError } = await supabase
    .from("project_member_permissions")
    .upsert(rows, { onConflict: "project_member_id,module" });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

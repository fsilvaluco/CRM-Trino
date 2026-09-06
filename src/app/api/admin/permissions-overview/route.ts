import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { MODULE_KEYS, type ModuleKey, type ModulePermission } from "@/lib/project-roles";

// GET /api/admin/permissions-overview -- "intranet" de permisos: TODOS los
// proyectos de la organización, quién tiene fila en cada uno y su matriz
// de módulos completa. Exclusivo del Propietario/Admin de organización
// (isAdmin), y a propósito devuelve SOLO metadatos de acceso -- nunca
// datos de negocio de ningún proyecto (ni un deal, ni una transacción, ni
// un contacto). Por eso NO usa `allowedProjectIds` (que es "en qué
// proyectos tengo yo una fila") -- acá se listan TODOS los proyectos de
// la org exista o no una fila del que consulta.
export async function GET() {
  const { supabase, orgId, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) {
    return NextResponse.json({ error: "Solo el Propietario/Admin de la organización puede ver esto" }, { status: 403 });
  }

  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, name, parent_project_id")
    .eq("organization_id", orgId!)
    .order("name");
  if (projectsError) return NextResponse.json({ error: projectsError.message }, { status: 500 });

  const { data: orgMembers, error: orgMembersError } = await supabase
    .from("organization_members")
    .select("user_id, role, profiles ( full_name, email )")
    .eq("organization_id", orgId!);
  if (orgMembersError) return NextResponse.json({ error: orgMembersError.message }, { status: 500 });

  const { data: memberRows, error: memberRowsError } = await supabase
    .from("project_members")
    .select("id, project_id, user_id, role, puede_gestionar_equipo, profiles ( full_name, email )")
    .eq("organization_id", orgId!);
  if (memberRowsError) return NextResponse.json({ error: memberRowsError.message }, { status: 500 });

  const memberIds = (memberRows ?? []).map((m) => m.id);
  const permsByMemberId = new Map<string, Record<ModuleKey, ModulePermission>>();
  if (memberIds.length > 0) {
    const { data: permRows } = await supabase
      .from("project_member_permissions")
      .select("project_member_id, module, puede_ver, puede_editar, puede_eliminar, ve_ingresos, ve_costos")
      .in("project_member_id", memberIds);
    for (const id of memberIds) {
      permsByMemberId.set(
        id,
        MODULE_KEYS.reduce((acc, key) => {
          acc[key] = { puedeVer: false, puedeEditar: false, puedeEliminar: false, veIngresos: false, veCostos: false };
          return acc;
        }, {} as Record<ModuleKey, ModulePermission>)
      );
    }
    for (const row of (permRows ?? []) as {
      project_member_id: string; module: ModuleKey;
      puede_ver: boolean; puede_editar: boolean; puede_eliminar: boolean; ve_ingresos: boolean; ve_costos: boolean;
    }[]) {
      const modules = permsByMemberId.get(row.project_member_id);
      if (!modules) continue;
      modules[row.module] = {
        puedeVer: Boolean(row.puede_ver),
        puedeEditar: Boolean(row.puede_editar),
        puedeEliminar: Boolean(row.puede_eliminar),
        veIngresos: Boolean(row.ve_ingresos),
        veCostos: Boolean(row.ve_costos),
      };
    }
  }

  return NextResponse.json({
    projects: (projects ?? []).map((p) => ({ id: p.id, name: p.name, parentProjectId: p.parent_project_id ?? null })),
    organizationMembers: ((orgMembers ?? []) as unknown as {
      user_id: string; role: string; profiles: { full_name: string | null; email: string | null } | null;
    }[]).map((m) => ({
      userId: m.user_id,
      role: m.role,
      name: m.profiles?.full_name ?? m.profiles?.email ?? "Usuario",
      email: m.profiles?.email ?? null,
    })),
    memberships: ((memberRows ?? []) as unknown as {
      id: string; project_id: string; user_id: string; role: string; puede_gestionar_equipo: boolean;
      profiles: { full_name: string | null; email: string | null } | null;
    }[]).map((m) => ({
      id: m.id,
      projectId: m.project_id,
      userId: m.user_id,
      role: m.role,
      puedeGestionarEquipo: Boolean(m.puede_gestionar_equipo),
      name: m.profiles?.full_name ?? m.profiles?.email ?? "Usuario",
      email: m.profiles?.email ?? null,
      modules: permsByMemberId.get(m.id) ?? null,
    })),
  });
}

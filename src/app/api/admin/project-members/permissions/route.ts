import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { MODULE_KEYS, type ModulePermission } from "@/lib/project-roles";

// PUT /api/admin/project-members/permissions -- guarda la matriz de
// módulos de una fila de project_members, en cualquier proyecto de la
// org. Exclusivo del Propietario/Admin (isAdmin) -- variante "sin ser
// miembro de ese proyecto" de PUT /api/project-members/permissions (esa
// exige requireProjectManager, o sea SER de ese proyecto puntual).
export async function PUT(request: NextRequest) {
  const { supabase, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) {
    return NextResponse.json({ error: "Solo el Propietario/Admin de la organización puede gestionar esto" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { projectMemberId, modules } = body as { projectMemberId?: string; modules?: Record<string, ModulePermission> };
  if (!projectMemberId || !modules) {
    return NextResponse.json({ error: "projectMemberId y modules son requeridos" }, { status: 400 });
  }

  const { data: member } = await supabase.from("project_members").select("id").eq("id", projectMemberId).maybeSingle();
  if (!member) return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });

  const rows = MODULE_KEYS.filter((key) => modules[key]).map((key) => ({
    project_member_id: projectMemberId,
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

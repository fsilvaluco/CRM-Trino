import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { seedTemplateMatrix, wouldLeaveProjectWithoutManager, type ProjectRole } from "@/lib/project-roles";
import { logActivity } from "@/lib/activity-logs";

function requireOrgAdmin(isAdmin: boolean): NextResponse | null {
  if (!isAdmin) {
    return NextResponse.json({ error: "Solo el Propietario/Admin de la organización puede gestionar esto" }, { status: 403 });
  }
  return null;
}

// POST /api/admin/project-members -- agrega a alguien de la organización a
// un proyecto (sin necesidad de que quien llama sea miembro de ESE
// proyecto -- exclusivo del Propietario/Admin). Mismo efecto que
// POST /api/project-members, solo que autorizado a nivel de organización
// en vez de "gestiona equipo en este proyecto puntual".
export async function POST(request: NextRequest) {
  const { supabase, user, orgId, isAdmin, error } = await requireAuth();
  if (error) return error;
  const adminError = requireOrgAdmin(isAdmin);
  if (adminError) return adminError;

  const body = await request.json().catch(() => ({}));
  const { projectId, userId, role } = body as { projectId?: string; userId?: string; role?: ProjectRole };
  if (!projectId || !userId || !role) {
    return NextResponse.json({ error: "projectId, userId y role son requeridos" }, { status: 400 });
  }
  if (!["admin", "member", "artist", "staff"].includes(role)) {
    return NextResponse.json({ error: "role inválido" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("project_members")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "Esa persona ya tiene una fila en ese proyecto" }, { status: 409 });
  }

  const { data: inserted, error: dbError } = await supabase
    .from("project_members")
    .insert({ project_id: projectId, user_id: userId, organization_id: orgId, role, puede_gestionar_equipo: false })
    .select("id")
    .single();
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  await seedTemplateMatrix(supabase, inserted.id, role);
  await logActivity({
    supabase, userId: user!.id, userEmail: user!.email,
    action: "create", entityType: "project_member", entityId: inserted.id, entityName: userId, projectId,
  });

  return NextResponse.json({ ok: true, id: inserted.id }, { status: 201 });
}

// PATCH /api/admin/project-members -- cambia role/puede_gestionar_equipo
// de una fila ya existente, en cualquier proyecto de la org.
export async function PATCH(request: NextRequest) {
  const { supabase, user, isAdmin, error } = await requireAuth();
  if (error) return error;
  const adminError = requireOrgAdmin(isAdmin);
  if (adminError) return adminError;

  const body = await request.json().catch(() => ({}));
  const { projectMemberId, role, puedeGestionarEquipo } = body as {
    projectMemberId?: string; role?: ProjectRole; puedeGestionarEquipo?: boolean;
  };
  if (!projectMemberId) return NextResponse.json({ error: "projectMemberId requerido" }, { status: 400 });
  if (role === undefined && puedeGestionarEquipo === undefined) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const { data: target } = await supabase
    .from("project_members")
    .select("id, project_id, puede_gestionar_equipo")
    .eq("id", projectMemberId)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });

  if (
    puedeGestionarEquipo === false &&
    target.puede_gestionar_equipo === true &&
    (await wouldLeaveProjectWithoutManager(supabase, target.project_id, target.id))
  ) {
    return NextResponse.json(
      { error: "No puedes quitar este permiso: el proyecto quedaría sin nadie que gestione equipo" },
      { status: 409 }
    );
  }

  const updates: Record<string, unknown> = {};
  if (role !== undefined) updates.role = role;
  if (puedeGestionarEquipo !== undefined) updates.puede_gestionar_equipo = puedeGestionarEquipo;

  const { error: dbError } = await supabase.from("project_members").update(updates).eq("id", projectMemberId);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  await logActivity({
    supabase, userId: user!.id, userEmail: user!.email,
    action: "update", entityType: "project_member", entityId: projectMemberId, entityName: projectMemberId, projectId: target.project_id,
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/project-members -- saca a alguien de un proyecto,
// desde cualquier proyecto de la org.
export async function DELETE(request: NextRequest) {
  const { supabase, user, isAdmin, error } = await requireAuth();
  if (error) return error;
  const adminError = requireOrgAdmin(isAdmin);
  if (adminError) return adminError;

  const body = await request.json().catch(() => ({}));
  const { projectMemberId } = body as { projectMemberId?: string };
  if (!projectMemberId) return NextResponse.json({ error: "projectMemberId requerido" }, { status: 400 });

  const { data: target } = await supabase
    .from("project_members")
    .select("id, project_id, puede_gestionar_equipo")
    .eq("id", projectMemberId)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });

  if (
    target.puede_gestionar_equipo === true &&
    (await wouldLeaveProjectWithoutManager(supabase, target.project_id, target.id))
  ) {
    return NextResponse.json(
      { error: "No puedes sacar a esta persona: el proyecto quedaría sin nadie que gestione equipo" },
      { status: 409 }
    );
  }

  const { error: dbError } = await supabase.from("project_members").delete().eq("id", projectMemberId);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  await logActivity({
    supabase, userId: user!.id, userEmail: user!.email,
    action: "delete", entityType: "project_member", entityId: projectMemberId, entityName: projectMemberId, projectId: target.project_id,
  });

  return NextResponse.json({ ok: true });
}

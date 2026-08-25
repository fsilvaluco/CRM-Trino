import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  canManageTeam,
  getProjectPermissions,
  seedTemplateMatrix,
  wouldLeaveProjectWithoutManager,
  type ProjectRole,
} from "@/lib/project-roles";

// Gestión de gente (ROLES.md Prioridad 2, ítems 13-17): quien puede
// invitar/dar de baja/editar a otros en un proyecto es quien tiene
// `puede_gestionar_equipo = sí` en ESE proyecto puntual -- ya no depende
// del rol de organización (`isAdmin`), y no hay jerarquía especial entre
// distintas personas con este permiso: cualquiera puede gestionar a
// cualquier otra, incluidas otras con el mismo permiso (0.2.1/ítem 14).
async function requireProjectManager(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  projectId: string
): Promise<NextResponse | null> {
  const perm = await getProjectPermissions(supabase, userId, projectId);
  if (!canManageTeam(perm)) {
    return NextResponse.json(
      { error: "No gestionas equipo en este proyecto" },
      { status: 403 }
    );
  }
  return null;
}

// GET /api/project-members?projectId=xxx → roster de ese proyecto (cualquier
// member del proyecto puede verlo -- lo usan selectores de asignación en
// Tareas/Deals/Comentarios, no solo el Gestor de Integrantes).
// GET /api/project-members                → TODOS los project_members de la
// org -- esta es la vista de gestión completa ("Gestor de Integrantes"),
// restringida a quien gestiona equipo en al menos un proyecto, y filtrada a
// SOLO esos proyectos (ítems 15 y 17: aislamiento por proyecto también para
// la gestión de accesos en sí, ya no "cualquier admin de organización ve
// todo").
export async function GET(request: NextRequest) {
  const { supabase, orgId, user, error } = await requireAuth();
  if (error) return error;

  const projectId = new URL(request.url).searchParams.get("projectId");

  let managedProjectIds: string[] | null = null;

  if (projectId) {
    const { data: membership } = await supabase
      .from("project_members")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", user!.id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
    }
  } else {
    const { data: managedRows } = await supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", user!.id)
      .eq("puede_gestionar_equipo", true);
    managedProjectIds = [...new Set((managedRows ?? []).map((r: { project_id: string }) => r.project_id))];
    if (managedProjectIds.length === 0) {
      return NextResponse.json(
        { error: "No gestionas equipo en ningún proyecto" },
        { status: 403 }
      );
    }
  }

  let query = supabase
    .from("project_members")
    .select("id, user_id, project_id, role, puede_gestionar_equipo, created_at")
    .eq("organization_id", orgId);

  if (projectId) {
    query = query.eq("project_id", projectId);
  } else if (managedProjectIds) {
    query = query.in("project_id", managedProjectIds);
  }

  const { data, error: dbError } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  const rows = data ?? [];
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  if (userIds.length === 0) return NextResponse.json([]);

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url")
    .in("id", userIds);

  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 });

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
// Para usuarios sin perfil, obtener email desde auth.admin
  const missingIds = userIds.filter((id) => !profileMap.has(id));
  const authEmailMap = new Map<string, string>();
  if (missingIds.length > 0) {
    const admin = createAdminClient();
    const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of authUsers?.users ?? []) {
      if (missingIds.includes(u.id) && u.email) {
        authEmailMap.set(u.id, u.email);
      }
    }
  }

  return NextResponse.json(
    rows.map((row) => ({
      ...row,
      profiles: profileMap.get(row.user_id)
        ? {
            full_name: profileMap.get(row.user_id)?.full_name ?? null,
            email: profileMap.get(row.user_id)?.email ?? null,
            avatar_url: profileMap.get(row.user_id)?.avatar_url ?? null,
          }
        : {
            full_name: null,
            email: authEmailMap.get(row.user_id) ?? null,
            avatar_url: null,
          }
    }))
  );
}

export async function POST(request: NextRequest) {
  const { supabase, orgId, user, error } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const { projectId, userId, role } = body as { projectId: string; userId: string; role?: string };
  if (!projectId || !userId) {
    return NextResponse.json({ error: "projectId y userId requeridos" }, { status: 400 });
  }
  if (role && !["admin", "member", "artist", "staff"].includes(role)) {
    return NextResponse.json({ error: "role invalido" }, { status: 400 });
  }

  const managerError = await requireProjectManager(supabase, user!.id, projectId);
  if (managerError) return managerError;

  const effectiveRole = (role || "member") as ProjectRole;

  const { data: existing } = await supabase
    .from("project_members")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  const { data: upserted, error: dbError } = await supabase
    .from("project_members")
    .upsert(
      { project_id: projectId, user_id: userId, organization_id: orgId, role: effectiveRole },
      { onConflict: "project_id,user_id" }
    )
    .select("id")
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // Solo sembrar la matriz de plantilla si es una fila NUEVA -- reasignar
  // el rol de alguien que ya estaba no debe pisar ediciones finas que
  // alguien le haya hecho a su matriz.
  if (!existing) {
    await seedTemplateMatrix(supabase, upserted.id, effectiveRole);
  }

  return NextResponse.json({ ok: true });
}

// PATCH /api/project-members → { projectId, userId, role?, puedeGestionarEquipo? }
// Cambia el rol (plantilla, informativo) y/o el interruptor de gestión de
// equipo de una asignación YA existente, sin tocar si está o no asignada.
export async function PATCH(request: NextRequest) {
  const { supabase, orgId, user, error } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const { projectId, userId, role, puedeGestionarEquipo } = body as {
    projectId: string;
    userId: string;
    role?: string;
    puedeGestionarEquipo?: boolean;
  };
  if (!projectId || !userId) {
    return NextResponse.json({ error: "projectId y userId requeridos" }, { status: 400 });
  }
  if (role && !["admin", "member", "artist", "staff"].includes(role)) {
    return NextResponse.json({ error: "role invalido" }, { status: 400 });
  }
  if (role === undefined && puedeGestionarEquipo === undefined) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const managerError = await requireProjectManager(supabase, user!.id, projectId);
  if (managerError) return managerError;

  const { data: target } = await supabase
    .from("project_members")
    .select("id, puede_gestionar_equipo")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!target) return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });

  // Protección contra dejar el proyecto sin nadie que gestione equipo
  // (0.2.4 / ítem 16): si se le está sacando el permiso a quien lo tiene,
  // tiene que quedar al menos otra persona con puede_gestionar_equipo=true.
  if (
    puedeGestionarEquipo === false &&
    target.puede_gestionar_equipo === true &&
    (await wouldLeaveProjectWithoutManager(supabase, projectId, target.id))
  ) {
    return NextResponse.json(
      { error: "No puedes quitar este permiso: el proyecto quedaría sin nadie que gestione equipo" },
      { status: 409 }
    );
  }

  const updates: Record<string, unknown> = {};
  if (role !== undefined) updates.role = role;
  if (puedeGestionarEquipo !== undefined) updates.puede_gestionar_equipo = puedeGestionarEquipo;

  const { error: dbError } = await supabase
    .from("project_members")
    .update(updates)
    .eq("id", target.id);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/project-members → { projectId, userId }
export async function DELETE(request: NextRequest) {
  const { supabase, orgId, user, error } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const { projectId, userId } = body as { projectId: string; userId: string };
  if (!projectId || !userId) {
    return NextResponse.json({ error: "projectId y userId requeridos" }, { status: 400 });
  }

  const managerError = await requireProjectManager(supabase, user!.id, projectId);
  if (managerError) return managerError;

  const { data: target } = await supabase
    .from("project_members")
    .select("id, puede_gestionar_equipo")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!target) return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });

  // Misma protección que en PATCH: sacar a la última persona con
  // puede_gestionar_equipo=true dejaría el proyecto sin nadie que pueda
  // gestionarlo (0.2.4 / ítem 16).
  if (
    target.puede_gestionar_equipo === true &&
    (await wouldLeaveProjectWithoutManager(supabase, projectId, target.id))
  ) {
    return NextResponse.json(
      { error: "No puedes sacar a esta persona: el proyecto quedaría sin nadie que gestione equipo" },
      { status: 409 }
    );
  }

  const { error: dbError } = await supabase
    .from("project_members")
    .delete()
    .eq("id", target.id);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

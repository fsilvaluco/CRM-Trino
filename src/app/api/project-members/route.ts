import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

// GET /api/project-members?projectId=xxx → miembros de ese proyecto (cualquier member del proyecto puede ver)
// GET /api/project-members                → todos los project_members de la org (admin only, para matrix)
export async function GET(request: NextRequest) {
  const { supabase, orgId, isAdmin, user, error } = await requireAuth();
  if (error) return error;

  const projectId = new URL(request.url).searchParams.get("projectId");

  // Si pide un proyecto específico, verificar que el usuario sea miembro de ese proyecto
  if (projectId && !isAdmin) {
    const { data: membership } = await supabase
      .from("project_members")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", user!.id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
    }
  }

  // Si no hay projectId y no es admin, denegar (requiere admin para ver todos)
  if (!projectId && !isAdmin) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  let query = supabase
    .from("project_members")
    .select("id, user_id, project_id, created_at")
    .eq("organization_id", orgId);

  if (projectId) {
    query = query.eq("project_id", projectId);
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
  const { supabase, orgId, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const body = await request.json();
  const { projectId, userId } = body as { projectId: string; userId: string };
  if (!projectId || !userId) {
    return NextResponse.json({ error: "projectId y userId requeridos" }, { status: 400 });
  }

  const { error: dbError } = await supabase
    .from("project_members")
    .upsert({ project_id: projectId, user_id: userId, organization_id: orgId }, { onConflict: "project_id,user_id" });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/project-members → { projectId, userId }
export async function DELETE(request: NextRequest) {
  const { supabase, orgId, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const body = await request.json();
  const { projectId, userId } = body as { projectId: string; userId: string };
  if (!projectId || !userId) {
    return NextResponse.json({ error: "projectId y userId requeridos" }, { status: 400 });
  }

  const { error: dbError } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .eq("organization_id", orgId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

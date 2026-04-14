import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// GET /api/project-members?projectId=xxx → miembros de ese proyecto
// GET /api/project-members                → todos los project_members de la org (admin only, para matrix)
export async function GET(request: NextRequest) {
  const { supabase, orgId, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const projectId = new URL(request.url).searchParams.get("projectId");

  let query = supabase
    .from("project_members")
    .select("id, user_id, project_id, created_at, profiles ( full_name, email, avatar_url )")
    .eq("organization_id", orgId);

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error: dbError } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json(data ?? []);
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

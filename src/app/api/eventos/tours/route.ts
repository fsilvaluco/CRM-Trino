import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissions, canViewEvent } from "@/lib/project-roles";

// GET /api/eventos/tours?projectId=xxx&search=amistad -- giras ya usadas
// en ese proyecto, para autocompletar el campo Gira y evitar typos que
// dupliquen el mismo nombre con variaciones.
export async function GET(request: NextRequest) {
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const search = searchParams.get("search")?.trim() ?? "";

  // El projectId lo manda el cliente, asi que no se toma como palabra: se
  // verifica que tenga acceso a ese proyecto, y sin projectId se acota a los
  // proyectos de la persona en vez de barrer la organizacion entera
  // (auditoria del 17 sep 2026, ver ROLES.md §11).
  if (projectId) {
    if (allowedProjectIds !== null && !allowedProjectIds.includes(projectId)) {
      return NextResponse.json([]);
    }
    const role = await getProjectPermissions(supabase, user!.id, projectId);
    if (!canViewEvent(role)) return NextResponse.json([]);
  }

  let query = supabase
    .from("shows")
    .select("tour")
    .eq("organization_id", orgId!)
    .not("tour", "is", null);

  if (projectId) {
    query = query.eq("project_id", projectId);
  } else if (allowedProjectIds !== null) {
    if (allowedProjectIds.length === 0) return NextResponse.json([]);
    query = query.in("project_id", allowedProjectIds);
  }
  if (search) query = query.ilike("tour", `%${search}%`);

  const { data, error: dbError } = await query.limit(200);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  const distinct = [...new Set((data ?? []).map((r) => r.tour).filter(Boolean) as string[])].sort();
  return NextResponse.json(distinct.slice(0, 10).map((t) => ({ label: t, value: t })));
}

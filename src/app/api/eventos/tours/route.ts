import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// GET /api/eventos/tours?projectId=xxx&search=amistad -- giras ya usadas
// en ese proyecto, para autocompletar el campo Gira y evitar typos que
// dupliquen el mismo nombre con variaciones.
export async function GET(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const search = searchParams.get("search")?.trim() ?? "";

  let query = supabase
    .from("shows")
    .select("tour")
    .eq("organization_id", orgId!)
    .not("tour", "is", null);

  if (projectId) query = query.eq("project_id", projectId);
  if (search) query = query.ilike("tour", `%${search}%`);

  const { data, error: dbError } = await query.limit(200);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  const distinct = [...new Set((data ?? []).map((r) => r.tour).filter(Boolean) as string[])].sort();
  return NextResponse.json(distinct.slice(0, 10).map((t) => ({ label: t, value: t })));
}

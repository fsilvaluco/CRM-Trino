import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createSocialMetricSchema, type SocialMetric } from "@/types/analytics";

function errorResponse(message: string, status: number, details?: unknown) {
  return NextResponse.json(
    { error: { message, details: details ?? null } },
    { status }
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMetric(row: any): SocialMetric {
  return {
    id: row.id,
    organizationId: row.organization_id,
    platform: row.platform,
    followers: row.followers,
    recordedAt: row.recorded_at,
    createdAt: row.created_at,
  };
}

export async function GET(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const isAllProjects = searchParams.get("isAllProjects") === "true";

  let query = supabase
    .from("social_metrics")
    .select("*")
    .eq("organization_id", orgId!)
    .order("recorded_at", { ascending: false });

  if (!isAllProjects && projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error: dbError } = await query;

  if (dbError) {
    return errorResponse("No se pudieron listar las métricas sociales", 500, dbError.message);
  }

  return NextResponse.json((data ?? []).map(mapMetric));
}

export async function POST(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsed = createSocialMetricSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Payload invalido", 400, parsed.error.flatten());
  }

  const { projectId, platform, followers, recordedAt } = parsed.data;

  const { data, error: dbError } = await supabase
    .from("social_metrics")
    .insert({
      organization_id: orgId,
      project_id: projectId,
      platform,
      followers,
      recorded_at: recordedAt,
    })
    .select()
    .single();

  if (dbError) {
    return errorResponse("No se pudo crear la métrica social", 500, dbError.message);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json(mapMetric(data as any), { status: 201 });
}

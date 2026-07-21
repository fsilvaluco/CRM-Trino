import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createMerchSnapshotSchema, type MerchSnapshot } from "@/types/analytics";

function errorResponse(message: string, status: number, details?: unknown) {
  return NextResponse.json(
    { error: { message, details: details ?? null } },
    { status }
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSnapshot(row: any): MerchSnapshot {
  return {
    id: row.id,
    organizationId: row.organization_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    totalSales: row.total_sales ?? null,
    unitsSold: row.units_sold ?? null,
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
    .from("merch_snapshots")
    .select("*")
    .eq("organization_id", orgId!)
    .order("period_start", { ascending: false });

  if (!isAllProjects && projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error: dbError } = await query;

  if (dbError) {
    return errorResponse("No se pudieron listar los snapshots de merch", 500, dbError.message);
  }

  return NextResponse.json((data ?? []).map(mapSnapshot));
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

  const parsed = createMerchSnapshotSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Payload invalido", 400, parsed.error.flatten());
  }

  const { projectId, periodStart, periodEnd, totalSales, unitsSold } = parsed.data;

  const { data, error: dbError } = await supabase
    .from("merch_snapshots")
    .insert({
      organization_id: orgId,
      project_id: projectId,
      period_start: periodStart,
      period_end: periodEnd,
      total_sales: totalSales ?? null,
      units_sold: unitsSold ?? null,
    })
    .select()
    .single();

  if (dbError) {
    return errorResponse("No se pudo crear el snapshot de merch", 500, dbError.message);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json(mapSnapshot(data as any), { status: 201 });
}

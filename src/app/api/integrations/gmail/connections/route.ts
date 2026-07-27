import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapConnection(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    emailAddress: row.email_address,
    status: row.status,
    connectedByName: row.profiles?.full_name ?? row.profiles?.email ?? null,
    lastSyncAt: row.last_sync_at,
    createdAt: row.created_at,
  };
}

export async function GET(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  let query = supabase
    .from("gmail_connections")
    .select("*, profiles(full_name, email)")
    .eq("organization_id", orgId!)
    .order("created_at", { ascending: false });

  if (projectId) query = query.eq("project_id", projectId);

  const { data, error: dbError } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json((data ?? []).map(mapConnection));
}

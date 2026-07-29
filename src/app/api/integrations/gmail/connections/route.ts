import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

interface SyncRunRow {
  id: string;
  connection_id: string;
  trigger: "cron" | "manual";
  messages_scanned: number;
  leads_created: number;
  error: string | null;
  ran_at: string;
}

function mapRun(row: SyncRunRow) {
  return {
    id: row.id,
    trigger: row.trigger,
    messagesScanned: row.messages_scanned,
    leadsCreated: row.leads_created,
    error: row.error,
    ranAt: row.ran_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapConnection(row: any, runsByConnection: Map<string, SyncRunRow[]>) {
  const runs = runsByConnection.get(row.id) ?? [];
  return {
    id: row.id,
    projectId: row.project_id,
    emailAddress: row.email_address,
    status: row.status,
    connectedByName: row.profiles?.full_name ?? row.profiles?.email ?? null,
    lastSyncAt: row.last_sync_at,
    createdAt: row.created_at,
    lastCronRun: runs.find((r) => r.trigger === "cron") ? mapRun(runs.find((r) => r.trigger === "cron")!) : null,
    lastManualRun: runs.find((r) => r.trigger === "manual") ? mapRun(runs.find((r) => r.trigger === "manual")!) : null,
    recentRuns: runs.slice(0, 10).map(mapRun),
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

  const connectionIds = (data ?? []).map((c) => c.id);
  const runsByConnection = new Map<string, SyncRunRow[]>();

  if (connectionIds.length > 0) {
    const { data: runs } = await supabase
      .from("lead_sync_runs")
      .select("*")
      .in("connection_id", connectionIds)
      .order("ran_at", { ascending: false })
      .limit(200);

    for (const run of (runs ?? []) as SyncRunRow[]) {
      const list = runsByConnection.get(run.connection_id) ?? [];
      list.push(run);
      runsByConnection.set(run.connection_id, list);
    }
  }

  return NextResponse.json((data ?? []).map((row) => mapConnection(row, runsByConnection)));
}

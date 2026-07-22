import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  // Las integraciones son por proyecto: sin proyecto activo (o en vista
  // "Todos los proyectos") no hay una integración única que mostrar.
  if (!projectId) {
    return NextResponse.json({ connected: false });
  }

  const { data: integration } = await supabase
    .from("artist_integrations")
    .select("account_name, last_sync_at, token_expires_at")
    .eq("organization_id", orgId!)
    .eq("platform", "instagram")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!integration) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    accountName: integration.account_name,
    lastSyncAt: integration.last_sync_at,
    tokenExpiresAt: integration.token_expires_at,
  });
}

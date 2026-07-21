import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function GET() {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { data: integration } = await supabase
    .from("artist_integrations")
    .select("account_name, last_sync_at, token_expires_at")
    .eq("organization_id", orgId!)
    .eq("platform", "instagram")
    .single();

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

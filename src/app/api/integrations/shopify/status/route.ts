import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ connected: false });
  }

  const { data: collection } = await supabase
    .from("shopify_collections")
    .select("collection_title, collection_handle, last_sync_at, store_id, shopify_stores(shop_name)")
    .eq("organization_id", orgId!)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!collection) {
    return NextResponse.json({ connected: false });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storeName = (collection as any).shopify_stores?.shop_name ?? null;

  return NextResponse.json({
    connected: true,
    accountName: storeName,
    lastSyncAt: collection.last_sync_at,
    collectionTitle: collection.collection_title ?? collection.collection_handle ?? null,
  });
}

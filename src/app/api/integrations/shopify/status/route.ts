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

  const { data: collection, error: dbError } = await supabase
    .from("shopify_collections")
    .select("collection_title, collection_handle, last_sync_at, shopify_stores(shop_name, shop_domain)")
    .eq("organization_id", orgId!)
    .eq("project_id", projectId)
    .maybeSingle();

  // Un error de consulta NO es lo mismo que "no hay conexión": devolverlo
  // como connected:false esconde el problema real y obliga a diagnosticar a
  // ciegas. Se registra y se expone.
  if (dbError) {
    console.error("[shopify/status] query failed", { orgId, projectId, dbError });
    return NextResponse.json(
      { connected: false, error: "No se pudo leer el estado de la integración", details: dbError.message },
      { status: 500 }
    );
  }

  if (!collection) {
    return NextResponse.json({ connected: false });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const store = (collection as any).shopify_stores;

  return NextResponse.json({
    connected: true,
    accountName: store?.shop_name ?? store?.shop_domain ?? null,
    lastSyncAt: collection.last_sync_at,
    collectionTitle: collection.collection_title ?? collection.collection_handle ?? null,
  });
}

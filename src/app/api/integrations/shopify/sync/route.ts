import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { syncShopify } from "@/lib/shopify-sync";

export async function POST(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const projectId = (body as { projectId?: string })?.projectId;
  if (!projectId) {
    return NextResponse.json({ error: "Selecciona un proyecto antes de sincronizar" }, { status: 400 });
  }

  const { data: collection, error: dbError } = await supabase
    .from("shopify_collections")
    .select("shopify_collection_id, store_id, shopify_stores(shop_domain, access_token)")
    .eq("organization_id", orgId!)
    .eq("project_id", projectId)
    .maybeSingle();

  if (dbError || !collection) {
    return NextResponse.json({ error: "Sin colección de Shopify asignada a este proyecto" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const store = (collection as any).shopify_stores;
  if (!store) {
    return NextResponse.json({ error: "La tienda de esta colección ya no existe" }, { status: 404 });
  }

  try {
    const result = await syncShopify(
      supabase,
      orgId!,
      projectId,
      store.shop_domain,
      store.access_token,
      collection.shopify_collection_id
    );

    await supabase
      .from("shopify_collections")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("organization_id", orgId!)
      .eq("project_id", projectId);

    return NextResponse.json({ ok: true, ...result });
  } catch (syncError: unknown) {
    const message = syncError instanceof Error ? syncError.message : "Error de sincronización";
    console.error("[shopify/sync] failed", { orgId, projectId, message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

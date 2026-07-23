import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { verifyShopifyHmac, exchangeCodeForToken } from "@/lib/shopify-oauth";
import { validateShopifyCredentials, resolveCollectionByHandle, syncShopify } from "@/lib/shopify-sync";

const MERCH_BASE = "/analytics/shopify";

export async function GET(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const shop = searchParams.get("shop");
  const state = searchParams.get("state");

  if (!code || !shop || !state) {
    return NextResponse.redirect(new URL(`${MERCH_BASE}?error=shopify_denied`, process.env.NEXT_PUBLIC_SITE_URL));
  }

  // 1. Confirmar que el callback viene de Shopify (HMAC sobre los params).
  if (!verifyShopifyHmac(searchParams)) {
    console.error("[shopify/callback] HMAC inválido", { shop });
    return NextResponse.redirect(new URL(`${MERCH_BASE}?error=shopify_hmac_mismatch`, process.env.NEXT_PUBLIC_SITE_URL));
  }

  // 2. Decodificar y validar el state contra la sesión actual (anti-CSRF,
  // mismo patrón que meta/callback).
  let decodedOrgId: string | null = null;
  let decodedProjectId: string | null = null;
  let decodedShopDomain: string | null = null;
  let decodedCollectionHandle: string | null = null;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64").toString());
    decodedOrgId = decoded?.orgId ?? null;
    decodedProjectId = decoded?.projectId ?? null;
    decodedShopDomain = decoded?.shopDomain ?? null;
    decodedCollectionHandle = decoded?.collectionHandle ?? null;
  } catch {
    decodedOrgId = null;
  }

  if (!decodedOrgId || decodedOrgId !== orgId) {
    return NextResponse.redirect(new URL(`${MERCH_BASE}?error=shopify_state_mismatch`, process.env.NEXT_PUBLIC_SITE_URL));
  }
  if (!decodedProjectId || !decodedShopDomain || !decodedCollectionHandle || decodedShopDomain !== shop) {
    return NextResponse.redirect(new URL(`${MERCH_BASE}?error=shopify_state_mismatch`, process.env.NEXT_PUBLIC_SITE_URL));
  }

  try {
    // 3. Code -> access token permanente (offline).
    const accessToken = await exchangeCodeForToken(shop, code);

    // 4. Nombre de la tienda + resolver la colección por su handle.
    const { shopName } = await validateShopifyCredentials(shop, accessToken);
    const collection = await resolveCollectionByHandle(shop, accessToken, decodedCollectionHandle);

    // 5. La TIENDA vive a nivel de organización: si ya estaba conectada
    // (porque otro proyecto la usa), se actualiza el token en la misma fila
    // en vez de duplicarla.
    const { data: store, error: storeError } = await supabase
      .from("shopify_stores")
      .upsert(
        {
          organization_id: orgId,
          shop_domain: shop,
          shop_name: shopName,
          access_token: accessToken,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,shop_domain" }
      )
      .select("id")
      .single();

    if (storeError || !store) {
      console.error("[shopify/callback] store upsert failed", storeError);
      return NextResponse.redirect(new URL(`${MERCH_BASE}?error=shopify_token_error`, process.env.NEXT_PUBLIC_SITE_URL));
    }

    // 6. La COLECCIÓN es por proyecto, apuntando a esa tienda.
    const { error: collectionError } = await supabase.from("shopify_collections").upsert(
      {
        organization_id: orgId,
        project_id: decodedProjectId,
        store_id: store.id,
        shopify_collection_id: collection.id,
        collection_handle: collection.handle,
        collection_title: collection.title,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,project_id" }
    );

    if (collectionError) {
      console.error("[shopify/callback] collection upsert failed", collectionError);
      return NextResponse.redirect(new URL(`${MERCH_BASE}?error=shopify_token_error`, process.env.NEXT_PUBLIC_SITE_URL));
    }

    // 7. Primer sync. Si falla, la conexión igual queda guardada — se
    // reintenta con "Sincronizar ahora". El error se registra COMPLETO en
    // logs para poder diagnosticarlo sin adivinar.
    try {
      await syncShopify(supabase, orgId!, decodedProjectId, shop, accessToken, collection.id);
      await supabase
        .from("shopify_collections")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("organization_id", orgId!)
        .eq("project_id", decodedProjectId);
    } catch (syncError) {
      console.error("[shopify/callback] initial sync failed", {
        shop,
        projectId: decodedProjectId,
        message: syncError instanceof Error ? syncError.message : syncError,
      });
    }

    return NextResponse.redirect(new URL(`${MERCH_BASE}?connected=shopify`, process.env.NEXT_PUBLIC_SITE_URL));
  } catch (err) {
    console.error("[shopify/callback] unexpected error", err);
    return NextResponse.redirect(new URL(`${MERCH_BASE}?error=shopify_token_error`, process.env.NEXT_PUBLIC_SITE_URL));
  }
}

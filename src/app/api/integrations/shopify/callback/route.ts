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

  // 2. Decodificar y validar el state contra la sesión actual (mismo
  // patrón anti-CSRF que meta/callback).
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

    // 4. Nombre de la tienda (para mostrar en la UI) + resolver la colección.
    const { shopName } = await validateShopifyCredentials(shop, accessToken);
    const collection = await resolveCollectionByHandle(shop, accessToken, decodedCollectionHandle);

    const { error: upsertError } = await supabase.from("artist_integrations").upsert(
      {
        organization_id: orgId,
        platform: "shopify",
        project_id: decodedProjectId,
        access_token: accessToken,
        account_id: shop,
        account_name: shopName,
        config: {
          collectionId: collection.id,
          collectionHandle: collection.handle,
          collectionTitle: collection.title,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,platform,project_id" }
    );

    if (upsertError) {
      console.error("[shopify/callback] upsert failed", upsertError);
      return NextResponse.redirect(new URL(`${MERCH_BASE}?error=shopify_token_error`, process.env.NEXT_PUBLIC_SITE_URL));
    }

    try {
      await syncShopify(supabase, orgId!, decodedProjectId, shop, accessToken, collection.id);
    } catch (syncError) {
      // La conexión queda guardada aunque el primer sync falle — se puede
      // reintentar con "Sincronizar ahora".
      console.error("[shopify/callback] initial sync failed", syncError);
    }

    return NextResponse.redirect(new URL(`${MERCH_BASE}?connected=shopify`, process.env.NEXT_PUBLIC_SITE_URL));
  } catch (err) {
    console.error("[shopify/callback] unexpected error", err);
    return NextResponse.redirect(new URL(`${MERCH_BASE}?error=shopify_token_error`, process.env.NEXT_PUBLIC_SITE_URL));
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { normalizeShopDomain, isValidShopDomain, buildAuthorizeUrl } from "@/lib/shopify-oauth";

const MERCH_BASE = "/analytics/shopify";

/**
 * Inicia el flujo OAuth: recibe projectId + shopDomain + collectionHandle
 * desde el formulario de conexión, empaqueta todo en `state` (igual que el
 * connect de Meta) y redirige al admin de la tienda para que el usuario
 * apruebe los scopes de solo lectura.
 *
 * shopDomain + collectionHandle viajan en el state porque recién los
 * conocemos AHORA (el callback de Shopify no los reenvía) — se validan de
 * nuevo cuando vuelve el callback, comparando el orgId contra la sesión.
 */
export async function GET(request: NextRequest) {
  const { orgId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const shopDomainRaw = searchParams.get("shopDomain");
  const collectionHandle = searchParams.get("collectionHandle");

  if (!projectId) {
    return NextResponse.redirect(new URL(`${MERCH_BASE}?error=shopify_no_project`, process.env.NEXT_PUBLIC_SITE_URL));
  }
  if (!shopDomainRaw || !collectionHandle) {
    return NextResponse.redirect(new URL(`${MERCH_BASE}?error=shopify_missing_fields`, process.env.NEXT_PUBLIC_SITE_URL));
  }

  const shopDomain = normalizeShopDomain(shopDomainRaw);
  if (!isValidShopDomain(shopDomain)) {
    return NextResponse.redirect(new URL(`${MERCH_BASE}?error=shopify_invalid_domain`, process.env.NEXT_PUBLIC_SITE_URL));
  }

  const state = Buffer.from(
    JSON.stringify({ orgId, projectId, shopDomain, collectionHandle: collectionHandle.trim() })
  ).toString("base64");

  return NextResponse.redirect(buildAuthorizeUrl(shopDomain, state));
}

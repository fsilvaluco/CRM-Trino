import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { syncInstagram } from "@/lib/meta-sync";

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface FacebookPage {
  id: string;
  access_token: string;
}

interface PagesResponse {
  data: FacebookPage[];
}

interface PageIgAccountResponse {
  instagram_business_account?: { id: string };
}

interface InstagramUserResponse {
  id: string;
  username: string;
  followers_count?: number;
}

const ANALYTICS_BASE = "/analytics";
const GRAPH_BASE = "https://graph.facebook.com/v21.0";

export async function GET(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_denied`, request.url));
  }

  const decodedOrgId = state ? Buffer.from(state, "base64").toString() : null;
  if (!decodedOrgId || decodedOrgId !== orgId) {
    return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_state_mismatch`, request.url));
  }

  try {
    // Step 1: Exchange code for a short-lived user access token
    const tokenParams = new URLSearchParams({
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      redirect_uri: process.env.META_REDIRECT_URI!,
      code: code!,
    });

    const tokenRes = await fetch(`${GRAPH_BASE}/oauth/access_token?${tokenParams.toString()}`);

    if (!tokenRes.ok) {
      return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_token_error`, request.url));
    }

    const shortLived = (await tokenRes.json()) as TokenResponse;

    // Step 2: Exchange for a long-lived user access token (~60 days)
    const longParams = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      fb_exchange_token: shortLived.access_token,
    });

    const longRes = await fetch(`${GRAPH_BASE}/oauth/access_token?${longParams.toString()}`);

    if (!longRes.ok) {
      return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_token_error`, request.url));
    }

    const longLived = (await longRes.json()) as TokenResponse;
    const longLivedToken = longLived.access_token;
    const expiresIn = longLived.expires_in ?? 60 * 24 * 60 * 60;

    // Step 3: List the Facebook Pages the user manages
    const pagesRes = await fetch(
      `${GRAPH_BASE}/me/accounts?access_token=${longLivedToken}`
    );

    if (!pagesRes.ok) {
      return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_token_error`, request.url));
    }

    const pages = (await pagesRes.json()) as PagesResponse;

    // Step 4: Find the first Page with a linked Instagram Business account
    let igUserId: string | null = null;
    let pageAccessToken: string | null = null;

    for (const page of pages.data ?? []) {
      const pageRes = await fetch(
        `${GRAPH_BASE}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
      );

      if (!pageRes.ok) continue;

      const pageData = (await pageRes.json()) as PageIgAccountResponse;

      if (pageData.instagram_business_account?.id) {
        igUserId = pageData.instagram_business_account.id;
        pageAccessToken = page.access_token;
        break;
      }
    }

    if (!igUserId || !pageAccessToken) {
      return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_no_ig_account`, request.url));
    }

    // Step 5: Fetch the Instagram Business account username and followers
    const igRes = await fetch(
      `${GRAPH_BASE}/${igUserId}?fields=followers_count,username&access_token=${pageAccessToken}`
    );

    if (!igRes.ok) {
      return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_token_error`, request.url));
    }

    const igUser = (await igRes.json()) as InstagramUserResponse;

    // Step 6: Upsert integration record
    const { error: upsertError } = await supabase.from("artist_integrations").upsert(
      {
        organization_id: orgId,
        platform: "instagram",
        access_token: pageAccessToken,
        token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        account_id: igUserId,
        account_name: igUser.username,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,platform" }
    );

    if (upsertError) {
      return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_token_error`, request.url));
    }

    // Step 7: Immediate sync
    await syncInstagram(supabase, orgId!, pageAccessToken, igUserId);
  } catch {
    return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_token_error`, request.url));
  }

  return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?connected=instagram`, request.url));
}

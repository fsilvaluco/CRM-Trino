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
    return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_denied`, process.env.NEXT_PUBLIC_SITE_URL));
  }

  let decodedOrgId: string | null = null;
  let decodedProjectId: string | null = null;
  try {
    const decoded = state ? JSON.parse(Buffer.from(state, "base64").toString()) : null;
    decodedOrgId = decoded?.orgId ?? null;
    decodedProjectId = decoded?.projectId ?? null;
  } catch {
    decodedOrgId = null;
  }

  if (!decodedOrgId || decodedOrgId !== orgId) {
    return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_state_mismatch`, process.env.NEXT_PUBLIC_SITE_URL));
  }

  if (!decodedProjectId) {
    return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_no_project`, process.env.NEXT_PUBLIC_SITE_URL));
  }

  try {
    // Step 1: Exchange code for a short-lived user access token
    const tokenBody = new URLSearchParams({
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      redirect_uri: process.env.META_REDIRECT_URI!,
      code: code!,
    });

    const tokenRes = await fetch(`${GRAPH_BASE}/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody,
    });

    const tokenRaw = await tokenRes.text();
    console.log("[meta/callback] step1 code->token", {
      status: tokenRes.status,
      body: tokenRaw,
    });

    if (!tokenRes.ok) {
      console.error("[meta/callback] step1 failed", { status: tokenRes.status, body: tokenRaw });
      return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_token_error`, process.env.NEXT_PUBLIC_SITE_URL));
    }

    const shortLived = JSON.parse(tokenRaw) as TokenResponse;

    // Step 2: Exchange for a long-lived user access token (~60 days)
    const longParams = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      fb_exchange_token: shortLived.access_token,
    });

    const longRes = await fetch(`${GRAPH_BASE}/oauth/access_token?${longParams.toString()}`);
    const longRaw = await longRes.text();
    console.log("[meta/callback] step2 long-lived token", {
      status: longRes.status,
      body: longRaw,
    });

    if (!longRes.ok) {
      console.error("[meta/callback] step2 failed", { status: longRes.status, body: longRaw });
      return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_token_error`, process.env.NEXT_PUBLIC_SITE_URL));
    }

    const longLived = JSON.parse(longRaw) as TokenResponse;
    const longLivedToken = longLived.access_token;
    const expiresIn = longLived.expires_in ?? 60 * 24 * 60 * 60;

    // Step 3: List the Facebook Pages the user manages
    const pagesRes = await fetch(
      `${GRAPH_BASE}/me/accounts?access_token=${longLivedToken}`
    );
    const pagesRaw = await pagesRes.text();
    console.log("[meta/callback] step3 me/accounts", {
      status: pagesRes.status,
      body: pagesRaw,
    });

    if (!pagesRes.ok) {
      console.error("[meta/callback] step3 failed", { status: pagesRes.status, body: pagesRaw });
      return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_token_error`, process.env.NEXT_PUBLIC_SITE_URL));
    }

    const pages = JSON.parse(pagesRaw) as PagesResponse;

    // Step 4: Find the first Page with a linked Instagram Business account
    let igUserId: string | null = null;
    let pageAccessToken: string | null = null;

    for (const page of pages.data ?? []) {
      const pageRes = await fetch(
        `${GRAPH_BASE}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
      );
      const pageRaw = await pageRes.text();
      console.log("[meta/callback] step4 page instagram_business_account", {
        pageId: page.id,
        status: pageRes.status,
        body: pageRaw,
      });

      if (!pageRes.ok) continue;

      const pageData = JSON.parse(pageRaw) as PageIgAccountResponse;

      if (pageData.instagram_business_account?.id) {
        igUserId = pageData.instagram_business_account.id;
        pageAccessToken = page.access_token;
        break;
      }
    }

    if (!igUserId || !pageAccessToken) {
      console.error("[meta/callback] step4 no linked Instagram Business account found", {
        pageCount: pages.data?.length ?? 0,
      });
      return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_no_ig_account`, process.env.NEXT_PUBLIC_SITE_URL));
    }

    // Step 5: Fetch the Instagram Business account username and followers
    const igRes = await fetch(
      `${GRAPH_BASE}/${igUserId}?fields=followers_count,username&access_token=${pageAccessToken}`
    );
    const igRaw = await igRes.text();
    console.log("[meta/callback] step5 ig user lookup", {
      status: igRes.status,
      body: igRaw,
    });

    if (!igRes.ok) {
      console.error("[meta/callback] step5 failed", { status: igRes.status, body: igRaw });
      return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_token_error`, process.env.NEXT_PUBLIC_SITE_URL));
    }

    const igUser = JSON.parse(igRaw) as InstagramUserResponse;

    // Step 6: Upsert integration record
    const { error: upsertError } = await supabase.from("artist_integrations").upsert(
      {
        organization_id: orgId,
        platform: "instagram",
        project_id: decodedProjectId,
        access_token: pageAccessToken,
        token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        account_id: igUserId,
        account_name: igUser.username,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,platform" }
    );

    if (upsertError) {
      console.error("[meta/callback] step6 upsert failed", upsertError);
      return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_token_error`, process.env.NEXT_PUBLIC_SITE_URL));
    }

    // Step 7: Immediate sync
    await syncInstagram(supabase, orgId!, pageAccessToken, igUserId, decodedProjectId);
  } catch (err) {
    console.error("[meta/callback] unexpected error", err);
    return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_token_error`, process.env.NEXT_PUBLIC_SITE_URL));
  }

  return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?connected=instagram`, process.env.NEXT_PUBLIC_SITE_URL));
}

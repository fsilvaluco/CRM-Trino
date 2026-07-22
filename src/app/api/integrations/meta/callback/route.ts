import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { finalizeMetaConnection, type MetaAccountCandidate } from "@/lib/meta-connect";

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface FacebookPage {
  id: string;
  name: string;
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

const ANALYTICS_BASE = "/analytics/instagram";
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
    console.log("[meta/callback] step1 code->token", { status: tokenRes.status, body: tokenRaw });

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
    console.log("[meta/callback] step2 long-lived token", { status: longRes.status, body: longRaw });

    if (!longRes.ok) {
      console.error("[meta/callback] step2 failed", { status: longRes.status, body: longRaw });
      return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_token_error`, process.env.NEXT_PUBLIC_SITE_URL));
    }

    const longLived = JSON.parse(longRaw) as TokenResponse;
    const longLivedToken = longLived.access_token;
    const expiresIn = longLived.expires_in ?? 60 * 24 * 60 * 60;

    // Step 3: List every Facebook Page currently granted to the app
    // (Facebook accumulates grants across reconnections — this can include
    // pages authorized for OTHER projects in previous connect attempts, not
    // just the one(s) the user just checked).
    const pagesRes = await fetch(`${GRAPH_BASE}/me/accounts?fields=id,name,access_token&access_token=${longLivedToken}`);
    const pagesRaw = await pagesRes.text();
    console.log("[meta/callback] step3 me/accounts", { status: pagesRes.status, body: pagesRaw });

    if (!pagesRes.ok) {
      console.error("[meta/callback] step3 failed", { status: pagesRes.status, body: pagesRaw });
      return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_token_error`, process.env.NEXT_PUBLIC_SITE_URL));
    }

    const pages = JSON.parse(pagesRaw) as PagesResponse;

    // Step 4: Collect ALL pages that have a linked Instagram Business
    // account — NOT just the first one. Picking "the first match" is what
    // caused the previous bug (wrong account getting connected/synced when
    // more than one page had Instagram linked).
    const candidates: MetaAccountCandidate[] = [];

    for (const page of pages.data ?? []) {
      const pageRes = await fetch(
        `${GRAPH_BASE}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
      );
      if (!pageRes.ok) continue;
      const pageData = (await pageRes.json()) as PageIgAccountResponse;
      const igUserId = pageData.instagram_business_account?.id;
      if (!igUserId) continue;

      const igRes = await fetch(`${GRAPH_BASE}/${igUserId}?fields=username&access_token=${page.access_token}`);
      if (!igRes.ok) continue;
      const igUser = (await igRes.json()) as InstagramUserResponse;

      candidates.push({
        pageId: page.id,
        pageName: page.name,
        pageAccessToken: page.access_token,
        igUserId,
        igUsername: igUser.username,
      });
    }

    console.log("[meta/callback] step4 candidates found", { count: candidates.length });

    if (candidates.length === 0) {
      return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_no_ig_account`, process.env.NEXT_PUBLIC_SITE_URL));
    }

    // Exactly one candidate: no ambiguity, connect it directly (fast path,
    // same behavior as before for the common case).
    if (candidates.length === 1) {
      const result = await finalizeMetaConnection(supabase, orgId!, decodedProjectId, candidates[0], expiresIn);
      if (!result.ok) {
        return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_token_error`, process.env.NEXT_PUBLIC_SITE_URL));
      }
      return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?connected=instagram`, process.env.NEXT_PUBLIC_SITE_URL));
    }

    // More than one candidate: don't guess. Store them temporarily and let
    // the user pick which account belongs to this project.
    const { data: pending, error: pendingError } = await supabase
      .from("meta_pending_connections")
      .insert({
        organization_id: orgId,
        project_id: decodedProjectId,
        candidates: candidates.map((c) => ({ ...c, tokenExpiresIn: expiresIn })),
      })
      .select("id")
      .single();

    if (pendingError || !pending) {
      console.error("[meta/callback] failed to store pending connection", pendingError);
      return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_token_error`, process.env.NEXT_PUBLIC_SITE_URL));
    }

    return NextResponse.redirect(
      new URL(`/analytics/connect-instagram?pending=${pending.id}`, process.env.NEXT_PUBLIC_SITE_URL)
    );
  } catch (err) {
    console.error("[meta/callback] unexpected error", err);
    return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_token_error`, process.env.NEXT_PUBLIC_SITE_URL));
  }
}

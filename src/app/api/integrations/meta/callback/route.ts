import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { syncInstagram } from "@/lib/meta-sync";

interface ShortLivedTokenResponse {
  access_token: string;
  user_id: string;
}

interface LongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface InstagramUserResponse {
  id: string;
  username: string;
}

const ANALYTICS_BASE = "/analytics";

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
    // Step 1: Exchange code for short-lived token
    const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.META_APP_ID!,
        client_secret: process.env.META_APP_SECRET!,
        grant_type: "authorization_code",
        redirect_uri: process.env.META_REDIRECT_URI!,
        code: code!,
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_token_error`, request.url));
    }

    const shortLived = (await tokenRes.json()) as ShortLivedTokenResponse;

    // Step 2: Exchange for long-lived token (60 days)
    const longParams = new URLSearchParams({
      grant_type: "ig_exchange_token",
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      access_token: shortLived.access_token,
    });

    const longRes = await fetch(
      `https://graph.instagram.com/access_token?${longParams.toString()}`
    );

    if (!longRes.ok) {
      return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_token_error`, request.url));
    }

    const longLived = (await longRes.json()) as LongLivedTokenResponse;
    const longLivedToken = longLived.access_token;
    const expiresIn = longLived.expires_in;

    // Step 3: Fetch Instagram username
    const userRes = await fetch(
      `https://graph.instagram.com/v21.0/me?fields=username&access_token=${longLivedToken}`
    );

    if (!userRes.ok) {
      return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_token_error`, request.url));
    }

    const igUser = (await userRes.json()) as InstagramUserResponse;

    // Step 4: Upsert integration record
    const { error: upsertError } = await supabase.from("artist_integrations").upsert(
      {
        organization_id: orgId,
        platform: "instagram",
        access_token: longLivedToken,
        token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        account_id: String(igUser.id),
        account_name: igUser.username,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,platform" }
    );

    if (upsertError) {
      return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_token_error`, request.url));
    }

    // Step 5: Immediate sync
    await syncInstagram(supabase, orgId!, longLivedToken);
  } catch {
    return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?error=meta_token_error`, request.url));
  }

  return NextResponse.redirect(new URL(`${ANALYTICS_BASE}?connected=instagram`, request.url));
}

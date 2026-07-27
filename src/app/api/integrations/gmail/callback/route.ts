import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

const SETTINGS_BASE = "/settings/integrations";

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

interface GoogleUserInfo {
  email: string;
  verified_email: boolean;
}

export async function GET(request: NextRequest) {
  const { supabase, orgId, user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      new URL(`${SETTINGS_BASE}?error=gmail_denied`, process.env.NEXT_PUBLIC_SITE_URL)
    );
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
    return NextResponse.redirect(
      new URL(`${SETTINGS_BASE}?error=gmail_state_mismatch`, process.env.NEXT_PUBLIC_SITE_URL)
    );
  }
  if (!decodedProjectId) {
    return NextResponse.redirect(
      new URL(`${SETTINGS_BASE}?error=gmail_no_project`, process.env.NEXT_PUBLIC_SITE_URL)
    );
  }

  try {
    // Paso 1: intercambiar el codigo por tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        code: code!,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const raw = await tokenRes.text();
      console.error("[gmail/callback] token exchange failed", raw);
      return NextResponse.redirect(
        new URL(`${SETTINGS_BASE}?error=gmail_token_error`, process.env.NEXT_PUBLIC_SITE_URL)
      );
    }

    const tokens = (await tokenRes.json()) as GoogleTokenResponse;

    if (!tokens.refresh_token) {
      // Pasa cuando el usuario ya habia autorizado antes y Google no
      // reemite el refresh_token. prompt=consent deberia evitar esto,
      // pero si pasa, es mejor pedir que reconecte que guardar una
      // conexion inutil (sin refresh_token no se puede renovar el acceso).
      return NextResponse.redirect(
        new URL(`${SETTINGS_BASE}?error=gmail_no_refresh_token`, process.env.NEXT_PUBLIC_SITE_URL)
      );
    }

    // Paso 2: identificar que cuenta se conecto
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoRes.ok) {
      return NextResponse.redirect(
        new URL(`${SETTINGS_BASE}?error=gmail_userinfo_error`, process.env.NEXT_PUBLIC_SITE_URL)
      );
    }

    const userInfo = (await userInfoRes.json()) as GoogleUserInfo;

    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { error: dbError } = await supabase
      .from("gmail_connections")
      .upsert(
        {
          organization_id: orgId,
          project_id: decodedProjectId,
          connected_by: user!.id,
          email_address: userInfo.email,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: tokenExpiresAt,
          scope: tokens.scope,
          status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id,email_address" }
      );

    if (dbError) {
      console.error("[gmail/callback] db upsert failed", dbError);
      return NextResponse.redirect(
        new URL(`${SETTINGS_BASE}?error=gmail_save_error`, process.env.NEXT_PUBLIC_SITE_URL)
      );
    }

    return NextResponse.redirect(
      new URL(`${SETTINGS_BASE}?connected=${encodeURIComponent(userInfo.email)}`, process.env.NEXT_PUBLIC_SITE_URL)
    );
  } catch (err) {
    console.error("[gmail/callback] unexpected error", err);
    return NextResponse.redirect(
      new URL(`${SETTINGS_BASE}?error=gmail_token_error`, process.env.NEXT_PUBLIC_SITE_URL)
    );
  }
}

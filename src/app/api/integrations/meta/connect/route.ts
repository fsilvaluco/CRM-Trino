import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const { orgId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.redirect(
      new URL("/analytics?error=meta_no_project", process.env.NEXT_PUBLIC_SITE_URL)
    );
  }

  const state = Buffer.from(JSON.stringify({ orgId, projectId })).toString("base64");

  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: process.env.META_REDIRECT_URI!,
    scope: "instagram_basic,instagram_manage_insights,pages_read_engagement",
    response_type: "code",
    state,
  });

  const url = `https://www.facebook.com/dialog/oauth?${params.toString()}`;

  return NextResponse.redirect(url);
}

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function GET() {
  const { orgId, error } = await requireAuth();
  if (error) return error;

  const state = Buffer.from(orgId!).toString("base64");

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

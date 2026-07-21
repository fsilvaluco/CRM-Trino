import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function GET() {
  const { orgId, error } = await requireAuth();
  if (error) return error;

  const state = Buffer.from(orgId!).toString("base64");

  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: process.env.META_REDIRECT_URI!,
    scope: "user_profile,user_media",
    response_type: "code",
    state,
  });

  const url = `https://api.instagram.com/oauth/authorize?${params.toString()}`;

  return NextResponse.redirect(url);
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPost(row: any) {
  const engagement = (row.likes ?? 0) + (row.comments ?? 0) + (row.saved ?? 0) + (row.shares ?? 0);
  return {
    id: row.id,
    igMediaId: row.ig_media_id,
    mediaType: row.media_type,
    caption: row.caption,
    permalink: row.permalink,
    mediaUrl: row.media_url,
    thumbnailUrl: row.thumbnail_url,
    postedAt: row.posted_at,
    views: row.views,
    reach: row.reach,
    likes: row.likes,
    comments: row.comments,
    saved: row.saved,
    shares: row.shares,
    engagement,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json([]);

  const { data, error: dbError } = await supabase
    .from("instagram_posts")
    .select("*")
    .eq("organization_id", orgId!)
    .eq("project_id", projectId)
    .order("posted_at", { ascending: false });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json((data ?? []).map(mapPost));
}

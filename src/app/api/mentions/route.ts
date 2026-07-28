import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMention(row: any) {
  return {
    id: row.id,
    taskId: row.task_id,
    taskTitle: row.tasks?.title ?? null,
    mentionedByName: row.mentioned_by_profile?.full_name ?? row.mentioned_by_profile?.email ?? "Alguien",
    snippet: row.snippet,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export async function GET(request: NextRequest) {
  const { supabase, user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const onlyUnread = searchParams.get("unread") === "true";

  let query = supabase
    .from("mentions")
    .select("*, tasks(title), mentioned_by_profile:profiles!mentions_mentioned_by_fkey(full_name, email)")
    .eq("mentioned_user_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (onlyUnread) query = query.is("read_at", null);

  const { data, error: dbError } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json((data ?? []).map(mapMention));
}

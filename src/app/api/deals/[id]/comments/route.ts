import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { markEntityViewed } from "@/lib/entity-views";
import { sendPushToUsers } from "@/lib/push";

function siteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}${path}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDealComment(row: any) {
  return {
    id: row.id,
    dealId: row.deal_id ?? null,
    content: row.content ?? "",
    author: row.author ?? "Usuario",
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { data: deal, error: dealErr } = await supabase
    .from("deals").select("id").eq("id", id).single();
  if (dealErr || !deal) {
    return NextResponse.json({ error: "Deal no encontrado" }, { status: 404 });
  }

  const { data: comments, error: dbError } = await supabase
    .from("deal_comments")
    .select("*")
    .eq("deal_id", id)
    .order("created_at", { ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json((comments ?? []).map(mapDealComment));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, orgId, error } = await requireAuth();
  if (error) return error;
  if (!user || !orgId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { content, author, mentionedUserIds } = body as { content?: string; author?: string; mentionedUserIds?: string[] };

  if (!content || content.trim() === "") {
    return NextResponse.json({ error: "El contenido es requerido" }, { status: 400 });
  }

  const { data: deal, error: dealErr } = await supabase
    .from("deals").select("id").eq("id", id).single();
  if (dealErr || !deal) {
    return NextResponse.json({ error: "Deal no encontrado" }, { status: 404 });
  }

  // Si no viene un "author" explicito, usar el nombre real de quien esta
  // logueado -- igual criterio que ya corregimos para comentarios de tareas.
  let resolvedAuthor = author?.trim();
  if (!resolvedAuthor) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();
    resolvedAuthor = profile?.full_name || profile?.email || "Usuario";
  }

  const { data, error: dbError } = await supabase
    .from("deal_comments")
    .insert({
      deal_id: id,
      content: content.trim(),
      author: resolvedAuthor,
      author_id: user.id,
      organization_id: orgId,
      created_by: user.id,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: `Error al crear comentario: ${dbError.message}` }, { status: 500 });
  }

  void markEntityViewed(supabase, user.id, "deal", id);

  // Crear una notificacion de mencion por cada persona etiquetada con @
  // (mismo patron que task_comments, usando deal_id/deal_comment_id).
  if (Array.isArray(mentionedUserIds) && mentionedUserIds.length > 0) {
    const uniqueMentioned = Array.from(new Set(mentionedUserIds)).filter(
      (uid) => uid !== user.id
    );
    if (uniqueMentioned.length > 0) {
      await supabase.from("mentions").insert(
        uniqueMentioned.map((mentionedUserId) => ({
          organization_id: orgId,
          mentioned_user_id: mentionedUserId,
          mentioned_by: user.id,
          deal_id: id,
          deal_comment_id: data.id,
          snippet: content.trim().slice(0, 200),
        }))
      );
      void sendPushToUsers(uniqueMentioned, {
        title: `${resolvedAuthor} te mencionó en un deal`,
        body: content.trim().slice(0, 150),
        url: siteUrl(`/deals/${id}`),
      });
    }
  }

  return NextResponse.json(mapDealComment(data), { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

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
  const { content, author } = body as { content?: string; author?: string };

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

  return NextResponse.json(mapDealComment(data), { status: 201 });
}

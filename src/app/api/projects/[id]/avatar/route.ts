import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, isAdmin, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const canEditThisProject = isAdmin || (allowedProjectIds !== null && allowedProjectIds.includes(id));
  if (!canEditThisProject) {
    return NextResponse.json({ error: "Sin permisos sobre este proyecto" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const avatarUrl = (body as { avatarUrl?: string })?.avatarUrl;
  const reset = (body as { reset?: boolean })?.reset;

  if (reset) {
    // Volver al default: borra el override manual, el próximo sync de
    // Instagram (o el sync inmediato si ya hay integración) vuelve a
    // completar avatar_url automáticamente.
    const { error: dbError } = await supabase
      .from("projects")
      .update({ avatar_url: null, avatar_source: null, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
    return NextResponse.json({ id, avatarUrl: null, avatarSource: null });
  }

  if (!avatarUrl) {
    return NextResponse.json({ error: "Falta avatarUrl" }, { status: 400 });
  }

  const { data, error: dbError } = await supabase
    .from("projects")
    .update({ avatar_url: avatarUrl, avatar_source: "manual", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, avatar_url, avatar_source")
    .single();

  if (dbError || !data) {
    return NextResponse.json({ error: dbError?.message ?? "Proyecto no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ id: data.id, avatarUrl: data.avatar_url, avatarSource: data.avatar_source });
}

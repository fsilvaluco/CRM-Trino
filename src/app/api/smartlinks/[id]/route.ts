import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { SMARTLINK_PLATFORMS } from "@/lib/smartlink-platforms";

interface LinkInput {
  platform: string;
  url: string;
  label?: string | null;
}

// PUT /api/smartlinks/[id] -- edita metadata (titulo/artista/caratula) y
// reemplaza la lista completa de links (mismo patron "guardado completo"
// que setlist/costos en Eventos: mas simple que un diff fino, y estas
// listas nunca son largas).
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: existing } = await supabase.from("smartlinks").select("project_id").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "Smartlink no encontrado" }, { status: 404 });
  if (!allowedProjectIds.includes(existing.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este smartlink" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body?.title === "string") {
    if (!body.title.trim()) return NextResponse.json({ error: "El título es requerido" }, { status: 400 });
    updates.title = body.title.trim();
  }
  if (typeof body?.artistName === "string") updates.artist_name = body.artistName.trim() || null;
  if (typeof body?.coverImageUrl === "string") updates.cover_image_url = body.coverImageUrl.trim() || null;

  const { error: dbError } = await supabase.from("smartlinks").update(updates).eq("id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  if (Array.isArray(body?.links)) {
    const validPlatformKeys = new Set(SMARTLINK_PLATFORMS.map((p) => p.key));
    const cleanLinks = (body.links as LinkInput[])
      .filter((l) => l && typeof l.url === "string" && l.url.trim() && typeof l.platform === "string" && validPlatformKeys.has(l.platform))
      .map((l) => ({ platform: l.platform, url: l.url.trim(), label: l.label?.trim() || null }));

    for (const l of cleanLinks) {
      try {
        new URL(l.url);
      } catch {
        return NextResponse.json({ error: `El link de ${l.platform} no es una URL válida` }, { status: 400 });
      }
    }

    const { error: deleteError } = await supabase.from("smartlink_links").delete().eq("smartlink_id", id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

    if (cleanLinks.length > 0) {
      const { error: insertError } = await supabase.from("smartlink_links").insert(
        cleanLinks.map((l, i) => ({ smartlink_id: id, platform: l.platform, url: l.url, label: l.label, position: i }))
      );
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/smartlinks/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: existing } = await supabase.from("smartlinks").select("project_id").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "Smartlink no encontrado" }, { status: 404 });
  if (!allowedProjectIds.includes(existing.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este smartlink" }, { status: 403 });
  }

  const { error: dbError } = await supabase.from("smartlinks").delete().eq("id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

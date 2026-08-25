import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { generateAvailableSlug, isSlugTaken, normalizeCustomSlug } from "@/lib/short-slug";
import { SMARTLINK_PLATFORMS } from "@/lib/smartlink-platforms";

interface LinkInput {
  platform: string;
  url: string;
  label?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSmartlink(row: any) {
  const events = (row.smartlink_events ?? []) as Array<{ event_type: string; platform: string | null }>;
  const views = events.filter((e) => e.event_type === "view").length;
  const clicks = events.filter((e) => e.event_type === "click").length;
  const links = (row.smartlink_links ?? []) as Array<{ id: string; platform: string; url: string; label: string | null; position: number }>;

  return {
    id: row.id,
    projectId: row.project_id,
    slug: row.slug,
    title: row.title,
    artistName: row.artist_name,
    coverImageUrl: row.cover_image_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    links: links
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((l) => ({ id: l.id, platform: l.platform, url: l.url, label: l.label })),
    viewCount: views,
    clickCount: clicks,
  };
}

const SELECT = "*, smartlink_links ( id, platform, url, label, position ), smartlink_events ( event_type, platform )";

// GET /api/smartlinks?projectId=xxx
export async function GET(request: NextRequest) {
  const { supabase, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId es requerido" }, { status: 400 });
  }
  if (!allowedProjectIds.includes(projectId)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }

  const { data, error: dbError } = await supabase
    .from("smartlinks")
    .select(SELECT)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json((data ?? []).map(mapSmartlink));
}

// POST /api/smartlinks -- crea un smartlink con sus links de plataforma de
// una. Mismo esquema de slug (random o personalizado) que /api/qr.
export async function POST(request: NextRequest) {
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const artistName = typeof body?.artistName === "string" ? body.artistName.trim() : "";
  const coverImageUrl = typeof body?.coverImageUrl === "string" ? body.coverImageUrl.trim() : "";
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  const customSlugInput = typeof body?.customSlug === "string" ? body.customSlug.trim() : "";
  const linksInput: LinkInput[] = Array.isArray(body?.links) ? body.links : [];

  if (!title) return NextResponse.json({ error: "El título (nombre de la canción) es requerido" }, { status: 400 });
  if (!projectId) return NextResponse.json({ error: "projectId es requerido" }, { status: 400 });
  if (!allowedProjectIds.includes(projectId)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }

  const validPlatformKeys = new Set(SMARTLINK_PLATFORMS.map((p) => p.key));
  const cleanLinks = linksInput
    .filter((l) => l && typeof l.url === "string" && l.url.trim() && typeof l.platform === "string" && validPlatformKeys.has(l.platform))
    .map((l) => ({ platform: l.platform, url: l.url.trim(), label: l.label?.trim() || null }));

  for (const l of cleanLinks) {
    try {
      new URL(l.url);
    } catch {
      return NextResponse.json({ error: `El link de ${l.platform} no es una URL válida` }, { status: 400 });
    }
  }
  if (cleanLinks.length === 0) {
    return NextResponse.json({ error: "Agrega al menos un link de alguna plataforma" }, { status: 400 });
  }

  let slug: string;
  if (customSlugInput) {
    const normalized = normalizeCustomSlug(customSlugInput);
    if (!normalized) {
      return NextResponse.json({ error: "El link personalizado debe tener entre 3 y 40 letras/números/guiones" }, { status: 400 });
    }
    if (await isSlugTaken(supabase, normalized)) {
      return NextResponse.json({ error: `"${normalized}" ya está en uso, elige otro` }, { status: 409 });
    }
    slug = normalized;
  } else {
    slug = await generateAvailableSlug(supabase);
  }

  const { data: smartlink, error: dbError } = await supabase
    .from("smartlinks")
    .insert({
      organization_id: orgId,
      project_id: projectId,
      slug,
      title,
      artist_name: artistName || null,
      cover_image_url: coverImageUrl || null,
      created_by: user!.id,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: `Error al crear el smartlink: ${dbError.message}` }, { status: 500 });

  const { error: linksError } = await supabase.from("smartlink_links").insert(
    cleanLinks.map((l, i) => ({
      smartlink_id: smartlink.id,
      platform: l.platform,
      url: l.url,
      label: l.label,
      position: i,
    }))
  );
  if (linksError) return NextResponse.json({ error: `Error al guardar los links: ${linksError.message}` }, { status: 500 });

  return NextResponse.json(
    mapSmartlink({ ...smartlink, smartlink_links: cleanLinks.map((l, i) => ({ ...l, position: i })), smartlink_events: [] }),
    { status: 201 }
  );
}

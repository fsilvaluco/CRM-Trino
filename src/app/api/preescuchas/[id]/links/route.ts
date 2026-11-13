import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generatePreescuchaSlug, isUuid } from "@/lib/preescuchas";
import { loadPreescuchaForLinks } from "@/lib/preescucha-links-server";
import {
  PREESCUCHA_MAX_LINKS,
  PREESCUCHA_MAX_LINKS_PER_REQUEST,
  groupTrackPlays,
  type LinkStatRow,
  type PreescuchaLinkItem,
  type PreescuchaLinksResponse,
} from "@/lib/preescucha-links";

const createSchema = z.object({
  recipients: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Cada enlace necesita un nombre").max(120),
        contactId: z.string().refine(isUuid, "contactId inválido").nullable().optional(),
      })
    )
    .min(1, "Agrega al menos una persona")
    .max(PREESCUCHA_MAX_LINKS_PER_REQUEST, `Máximo ${PREESCUCHA_MAX_LINKS_PER_REQUEST} enlaces por vez`),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLink(row: any, trackPlays: Record<string, number>): PreescuchaLinkItem {
  return {
    id: row.id,
    slug: row.slug,
    recipientName: row.recipient_name,
    contactId: row.contact_id ?? null,
    revoked: Boolean(row.revoked_at),
    createdAt: row.created_at,
    viewCount: row.view_count ?? 0,
    playCount: row.play_count ?? 0,
    downloadCount: row.download_count ?? 0,
    lastActivityAt: row.last_activity_at ?? null,
    trackPlays,
  };
}

// GET /api/preescuchas/[id]/links -- enlaces individuales con su actividad
// (quien abrio, cuanto escucho y que canciones), mas la del enlace general.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, preescucha, error } = await loadPreescuchaForLinks(id);
  if (error || !preescucha) return error!;

  const [linksRes, statsRes] = await Promise.all([
    supabase.from("preescucha_links").select("*").eq("preescucha_id", id).order("created_at", { ascending: true }),
    supabase.rpc("preescucha_link_track_stats", { p_preescucha_id: id }),
  ]);
  if (linksRes.error) return NextResponse.json({ error: linksRes.error.message }, { status: 500 });
  if (statsRes.error) return NextResponse.json({ error: statsRes.error.message }, { status: 500 });

  const stats = (Array.isArray(statsRes.data) ? statsRes.data : []) as LinkStatRow[];
  const playsByLink = groupTrackPlays(stats);
  const generalTotal = (type: LinkStatRow["event_type"]) =>
    stats.filter((s) => s.link_id === null && s.event_type === type).reduce((sum, s) => sum + s.total, 0);

  const response: PreescuchaLinksResponse = {
    general: {
      viewCount: generalTotal("view"),
      playCount: generalTotal("play"),
      downloadCount: generalTotal("download"),
      trackPlays: playsByLink.get("") ?? {},
    },
    links: (linksRes.data ?? []).map((row) => mapLink(row, playsByLink.get(row.id) ?? {})),
  };
  return NextResponse.json(response);
}

// POST /api/preescuchas/[id]/links  { recipients: [{ name, contactId? }] }
// Crea un enlace individual por cada persona.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, orgId, preescucha, error } = await loadPreescuchaForLinks(id);
  if (error || !preescucha) return error!;

  if (preescucha.purged_at || new Date(preescucha.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Esta preescucha ya venció. Crea una nueva." }, { status: 409 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const recipients = parsed.data.recipients;

  const { count } = await supabase.from("preescucha_links").select("id", { count: "exact", head: true }).eq("preescucha_id", id);
  if ((count ?? 0) + recipients.length > PREESCUCHA_MAX_LINKS) {
    return NextResponse.json({ error: `Máximo ${PREESCUCHA_MAX_LINKS} enlaces por preescucha` }, { status: 400 });
  }

  // Un contacto solo se acepta si es de esta misma organizacion.
  const contactIds = [...new Set(recipients.map((r) => r.contactId).filter((c): c is string => Boolean(c)))];
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase.from("contacts").select("id").eq("organization_id", orgId!).in("id", contactIds);
    const valid = new Set((contacts ?? []).map((c) => c.id));
    if (contactIds.some((c) => !valid.has(c))) {
      return NextResponse.json({ error: "Uno de los contactos ya no existe. Recarga la página." }, { status: 400 });
    }
  }

  const rows = [];
  for (const r of recipients) {
    rows.push({
      preescucha_id: id,
      slug: await generatePreescuchaSlug(supabase),
      recipient_name: r.name,
      contact_id: r.contactId ?? null,
      created_by: user!.id,
    });
  }

  const { data, error: dbError } = await supabase.from("preescucha_links").insert(rows).select("*");
  if (dbError) return NextResponse.json({ error: `Error al crear los enlaces: ${dbError.message}` }, { status: 500 });

  return NextResponse.json((data ?? []).map((row) => mapLink(row, {})), { status: 201 });
}

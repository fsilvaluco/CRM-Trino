import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getActivePreescuchaBySlug, isUuid } from "@/lib/preescuchas";

export const dynamic = "force-dynamic";

// POST /api/public/preescuchas/[slug]/play  { trackId }
// La pagina publica avisa cuando una cancion empieza a sonar (una vez por
// cancion por visita). Alimenta el contador interno de reproducciones --
// nunca se muestra en la pagina publica.
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await request.json().catch(() => ({}));
  const trackId = body?.trackId;
  if (!isUuid(trackId)) return NextResponse.json({ error: "trackId inválido" }, { status: 400 });

  const admin = createAdminClient();
  const preescucha = await getActivePreescuchaBySlug(admin, slug);
  if (!preescucha) return NextResponse.json({ error: "No disponible" }, { status: 404 });

  const { data: track } = await admin
    .from("preescucha_tracks")
    .select("id")
    .eq("id", trackId)
    .eq("preescucha_id", preescucha.id)
    .maybeSingle();
  if (!track) return NextResponse.json({ error: "No disponible" }, { status: 404 });

  const { error } = await admin.rpc("preescucha_register_event", {
    p_preescucha_id: preescucha.id,
    p_track_id: track.id,
    p_event_type: "play",
    p_link_id: preescucha.linkId,
  });
  if (error) console.error("[preescuchas] no se pudo registrar la reproducción:", error.message);

  return NextResponse.json({ ok: true });
}

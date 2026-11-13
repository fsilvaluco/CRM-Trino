import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { PREESCUCHAS_BUCKET, downloadFileName, getActivePreescuchaBySlug, isUuid } from "@/lib/preescuchas";

export const dynamic = "force-dynamic";

// URL firmada para reproducir: alcanza para escuchar la cancion completa
// con pausas. Si vence a mitad de camino el reproductor vuelve a pedir
// esta ruta y recibe una nueva.
const STREAM_URL_SECONDS = 2 * 60 * 60;
const DOWNLOAD_URL_SECONDS = 5 * 60;

// GET /api/public/preescuchas/[slug]/audio/[trackId]            -> reproducir
// GET /api/public/preescuchas/[slug]/audio/[trackId]?download=1 -> descargar
//
// Publica (sin sesion): la protege el slug del link. Valida que la
// preescucha siga vigente y redirige a una URL firmada de corta duracion
// del bucket privado -- el audio lo sirve Supabase Storage (con soporte de
// Range para adelantar/retroceder), no este servidor.
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string; trackId: string }> }) {
  const { slug, trackId } = await params;
  if (!isUuid(trackId)) return NextResponse.json({ error: "No disponible" }, { status: 404 });

  const admin = createAdminClient();
  const preescucha = await getActivePreescuchaBySlug(admin, slug);
  if (!preescucha) return NextResponse.json({ error: "Esta preescucha ya no está disponible" }, { status: 404 });

  const { data: track } = await admin
    .from("preescucha_tracks")
    .select("id, title, file_path, position")
    .eq("id", trackId)
    .eq("preescucha_id", preescucha.id)
    .maybeSingle();
  if (!track?.file_path) return NextResponse.json({ error: "No disponible" }, { status: 404 });

  const wantsDownload = new URL(request.url).searchParams.get("download") === "1";
  if (wantsDownload && !preescucha.allow_download) {
    return NextResponse.json({ error: "La descarga no está habilitada para esta preescucha" }, { status: 403 });
  }

  const { data: signed, error } = await admin.storage
    .from(PREESCUCHAS_BUCKET)
    .createSignedUrl(
      track.file_path,
      wantsDownload ? DOWNLOAD_URL_SECONDS : STREAM_URL_SECONDS,
      wantsDownload ? { download: downloadFileName(track.position, track.title) } : undefined
    );
  if (error || !signed?.signedUrl) {
    console.error("[preescuchas] no se pudo firmar el audio:", error?.message);
    return NextResponse.json({ error: "No disponible" }, { status: 500 });
  }

  if (wantsDownload) {
    const { error: eventError } = await admin.rpc("preescucha_register_event", {
      p_preescucha_id: preescucha.id,
      p_track_id: track.id,
      p_event_type: "download",
    });
    if (eventError) console.error("[preescuchas] no se pudo registrar la descarga:", eventError.message);
  }

  const response = NextResponse.redirect(signed.signedUrl, 302);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

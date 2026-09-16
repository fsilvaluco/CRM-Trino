// Resuelve la campaña (qr_code -> project_id) y trae los spotify_clicks por
// anuncio/día desde qr_scans (vía la función SQL bot_spotify_clicks).
import type { createAdminClient } from "@/lib/supabase-admin";
import { SPOTIFY_QR_SLUG } from "./config";

type Supabase = ReturnType<typeof createAdminClient>;

export interface CampaignRef {
  qrId: string;
  projectId: string | null;
}

/** Ubica el qr_code de la campaña por su slug. Devuelve null si no existe
 *  (ej. slug mal configurado) -- el bot lo reporta y sigue sin spotify_clicks. */
export async function resolveCampaign(supabase: Supabase): Promise<CampaignRef | null> {
  const { data, error } = await supabase
    .from("qr_codes")
    .select("id, project_id")
    .eq("slug", SPOTIFY_QR_SLUG)
    .maybeSingle();
  if (error || !data) return null;
  return { qrId: data.id, projectId: data.project_id ?? null };
}

/** Mapa "adName|YYYY-MM-DD" -> clicks. Solo cuenta scans que llegaron a
 *  Spotify (lo define la función SQL). `sinceDays` acota la ventana leída. */
export async function fetchSpotifyClicks(
  supabase: Supabase,
  qrId: string,
  sinceDays = 4
): Promise<Map<string, number>> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.rpc("bot_spotify_clicks", {
    p_qr_id: qrId,
    p_since: since,
  });
  const map = new Map<string, number>();
  if (error || !data) return map;
  for (const row of data as { ad_name: string; day: string; clicks: number }[]) {
    map.set(`${row.ad_name}|${row.day}`, Number(row.clicks) || 0);
  }
  return map;
}

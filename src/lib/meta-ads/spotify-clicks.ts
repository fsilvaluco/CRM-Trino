// Resuelve la campaña (qr_code -> project_id) y trae los spotify_clicks por
// anuncio/día desde qr_scans (vía la función SQL bot_spotify_clicks).
import type { createAdminClient } from "@/lib/supabase-admin";
import { SPOTIFY_QR_SLUG } from "./config";
import { spotifyKey } from "./rules";

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

export interface SpotifyCount {
  /** Todos los scans que llegaron a Spotify. */
  total: number;
  /** Dedup: mismo IP+UA dentro de 30 min = 1 (para que costo/SC no se infle). */
  unique: number;
}

/** Mapa spotifyKey -> {total, unique}. Solo cuenta scans que llegaron a
 *  Spotify (lo define la función SQL). `sinceDays` acota la ventana leída. */
export async function fetchSpotifyClicks(
  supabase: Supabase,
  qrId: string,
  sinceDays = 4
): Promise<Map<string, SpotifyCount>> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.rpc("bot_spotify_clicks", {
    p_qr_id: qrId,
    p_since: since,
  });
  const map = new Map<string, SpotifyCount>();
  if (error || !data) return map;
  for (const row of data as { ad_name: string; adset_name: string; day: string; clicks: number; clicks_unique: number }[]) {
    map.set(spotifyKey(row.adset_name, row.ad_name, row.day), {
      total: Number(row.clicks) || 0,
      unique: Number(row.clicks_unique) || 0,
    });
  }
  return map;
}

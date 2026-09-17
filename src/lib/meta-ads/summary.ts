// Resumen diario a Telegram (cron 1x/día). Lee lo ya guardado en
// ad_metrics_daily + acciones de las últimas 24h; no llama a Meta.
import { createAdminClient } from "@/lib/supabase-admin";
import { sendTelegram, telegramConfigured } from "./telegram";

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

/** Día "ayer" en zona de Santiago, para alinear con el día de Meta. */
function santiagoDay(offsetDays = 0): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(Date.now() - offsetDays * 86400000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function runDailySummary(): Promise<{ ok: boolean; day: string }> {
  const supabase = createAdminClient();
  const day = santiagoDay(0);

  const { data: metrics } = await supabase
    .from("ad_metrics_daily")
    .select("ad_name, adset_name, spend, impressions, inline_link_clicks, spotify_clicks, spotify_clicks_unique")
    .eq("date", day)
    .order("adset_name", { ascending: true })
    .order("spend", { ascending: false });

  const rows = ((metrics ?? []) as {
    ad_name: string | null; adset_name: string | null; spend: number; impressions: number;
    inline_link_clicks: number; spotify_clicks: number; spotify_clicks_unique: number;
  }[]).map((r) => ({
    ad_name: r.ad_name, adset_name: r.adset_name, spend: Number(r.spend) || 0, impressions: Number(r.impressions) || 0,
    inline_link_clicks: Number(r.inline_link_clicks) || 0,
    spotify_clicks: Number(r.spotify_clicks) || 0,
    spotify_clicks_unique: Number(r.spotify_clicks_unique) || 0,
  }));

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: actions } = await supabase
    .from("ad_actions_log")
    .select("action, reason, dry_run")
    .gte("ts", since)
    .order("ts", { ascending: false });

  if (rows.length === 0) {
    await sendTelegram(`<b>📊 Resumen diario ${day}</b>\nSin métricas registradas hoy (¿campaña sin actividad?).`);
    return { ok: telegramConfigured(), day };
  }

  const tot = rows.reduce(
    (a, r) => ({
      spend: a.spend + r.spend, impr: a.impr + r.impressions,
      clicks: a.clicks + r.inline_link_clicks,
      spotify: a.spotify + r.spotify_clicks, spotifyU: a.spotifyU + r.spotify_clicks_unique,
    }),
    { spend: 0, impr: 0, clicks: 0, spotify: 0, spotifyU: 0 }
  );
  // Costo/SpotifyClick sobre ÚNICOS (no inflado por dobles toques).
  const costPerSpotify = tot.spotifyU > 0 ? tot.spend / tot.spotifyU : null;

  const top = rows.slice(0, 15).map((r) => {
    const cps = r.spotify_clicks_unique > 0 ? clp(r.spend / r.spotify_clicks_unique) : "—";
    const cpc = r.inline_link_clicks > 0 ? clp(r.spend / r.inline_link_clicks) : "—";
    return `• <b>${r.adset_name ?? "?"}</b> / <b>${r.ad_name ?? "?"}</b>: ${clp(r.spend)} · ${r.impressions} impr · ${r.inline_link_clicks} clics · CPC ${cpc} · SC ${r.spotify_clicks_unique}ú/${r.spotify_clicks}t · ${cps}/SCú`;
  }).join("\n");

  const acts = (actions ?? []) as { action: string; reason: string; dry_run: boolean }[];
  const actLine = acts.length === 0
    ? "Sin acciones en 24h."
    : acts.slice(0, 10).map((a) => `• [${a.dry_run ? "dry" : "real"}] ${a.action}: ${a.reason}`).join("\n");

  await sendTelegram(
    `<b>📊 Resumen diario ${day}</b>\n` +
    `Gasto: ${clp(tot.spend)} · Impresiones: ${tot.impr} · Clics: ${tot.clicks}\n` +
    `SpotifyClicks: <b>${tot.spotifyU}</b> únicos (${tot.spotify} totales)\n` +
    `${costPerSpotify != null ? `Costo/SpotifyClick (único): <b>${clp(costPerSpotify)}</b>\n` : ""}` +
    `\n<b>Por anuncio</b>\n${top}\n\n<b>Acciones (24h)</b>\n${actLine}`
  );
  return { ok: telegramConfigured(), day };
}

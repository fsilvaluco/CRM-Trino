import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/**
 * Reporte read-only para revisar la campaña cada 3-4 días. NO llama a Meta:
 * lee lo que el bot ya guardó en ad_metrics_daily (snapshot ≤6h) + las
 * acciones de ad_actions_log del período. Protegido con header
 * `x-report-key: <ADS_REPORT_KEY>`.
 *
 *   GET /api/ads/report?project_id=<uuid>&days=4
 *
 * Devuelve, por anuncio y por día: spend, impresiones, frecuencia, clics al
 * enlace, CPC, hook rate (video_3s/impresiones), SpotifyClicks (desde
 * qr_scans, ya cruzados por el bot), y costo por SpotifyClick. Más las
 * acciones del bot en la ventana.
 */

function santiagoDay(offsetDays: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(Date.now() - offsetDays * 86400000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function keyOk(req: NextRequest): boolean {
  const expected = process.env.ADS_REPORT_KEY ?? "";
  const got = req.headers.get("x-report-key") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

interface DayMetric {
  date: string; spend: number; impressions: number; frequency: number;
  inline_link_clicks: number; cpc: number; hook_rate: number;
  spotify_clicks: number; spotify_clicks_unique: number;
  // costo/SpotifyClick sobre ÚNICOS (dedup IP+UA 30 min) — no inflado.
  cost_per_spotify_click: number | null;
}

export async function GET(req: NextRequest) {
  if (!process.env.ADS_REPORT_KEY) {
    return NextResponse.json({ error: "ADS_REPORT_KEY no configurado en el servidor" }, { status: 500 });
  }
  if (!keyOk(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "Falta project_id" }, { status: 400 });
  }
  const days = Math.min(Math.max(Number(searchParams.get("days")) || 4, 1), 90);
  const sinceDay = santiagoDay(days - 1); // incluye hoy + (days-1) previos
  const sinceTs = new Date(Date.now() - days * 86400000).toISOString();

  const supabase = createAdminClient();

  const { data: metrics, error: mErr } = await supabase
    .from("ad_metrics_daily")
    .select("ad_id, ad_name, adset_name, campaign_name, date, spend, impressions, frequency, inline_link_clicks, cpc, video_3s_views, spotify_clicks, spotify_clicks_unique")
    .eq("project_id", projectId)
    .gte("date", sinceDay)
    .order("ad_name", { ascending: true })
    .order("date", { ascending: true });
  if (mErr) {
    return NextResponse.json({ error: `Métricas: ${mErr.message}` }, { status: 500 });
  }

  interface AdReport {
    ad_id: string; ad_name: string | null; adset_name: string | null;
    campaign_name: string | null; days: DayMetric[];
    totals: {
      spend: number; impressions: number; inline_link_clicks: number;
      spotify_clicks: number; spotify_clicks_unique: number; cpc: number; hook_rate: number;
      cost_per_spotify_click: number | null;
    };
  }

  const byAd = new Map<string, AdReport>();
  for (const row of (metrics ?? []) as Record<string, unknown>[]) {
    const adId = String(row.ad_id);
    let r = byAd.get(adId);
    if (!r) {
      r = {
        ad_id: adId, ad_name: (row.ad_name as string) ?? null,
        adset_name: (row.adset_name as string) ?? null,
        campaign_name: (row.campaign_name as string) ?? null,
        days: [],
        totals: { spend: 0, impressions: 0, inline_link_clicks: 0, spotify_clicks: 0, spotify_clicks_unique: 0, cpc: 0, hook_rate: 0, cost_per_spotify_click: null },
      };
      byAd.set(adId, r);
    }
    const spend = n(row.spend), impr = n(row.impressions), clicks = n(row.inline_link_clicks);
    const v3s = n(row.video_3s_views), sc = n(row.spotify_clicks), scu = n(row.spotify_clicks_unique);
    r.days.push({
      date: String(row.date),
      spend, impressions: impr, frequency: round(n(row.frequency), 3),
      inline_link_clicks: clicks, cpc: round(n(row.cpc), 2),
      hook_rate: impr > 0 ? round(v3s / impr, 4) : 0,
      spotify_clicks: sc, spotify_clicks_unique: scu,
      cost_per_spotify_click: scu > 0 ? round(spend / scu, 2) : null,
    });
    r.totals.spend += spend; r.totals.impressions += impr;
    r.totals.inline_link_clicks += clicks; r.totals.spotify_clicks += sc;
    r.totals.spotify_clicks_unique += scu;
    // acumulamos video_3s en hook_rate temporalmente como suma, se resuelve abajo
    r.totals.hook_rate += v3s;
  }
  // Resolver totales derivados por anuncio.
  for (const r of byAd.values()) {
    const v3sSum = r.totals.hook_rate; // era la suma de video_3s
    r.totals.cpc = r.totals.inline_link_clicks > 0 ? round(r.totals.spend / r.totals.inline_link_clicks, 2) : 0;
    r.totals.hook_rate = r.totals.impressions > 0 ? round(v3sSum / r.totals.impressions, 4) : 0;
    r.totals.cost_per_spotify_click = r.totals.spotify_clicks_unique > 0 ? round(r.totals.spend / r.totals.spotify_clicks_unique, 2) : null;
  }

  const { data: actions, error: aErr } = await supabase
    .from("ad_actions_log")
    .select("ts, action, ad_id, adset_id, reason, rule_key, dry_run, before, after")
    .eq("project_id", projectId)
    .gte("ts", sinceTs)
    .order("ts", { ascending: false });
  if (aErr) {
    return NextResponse.json({ error: `Acciones: ${aErr.message}` }, { status: 500 });
  }

  return NextResponse.json({
    project_id: projectId,
    days,
    since_day: sinceDay,
    generated_at: new Date().toISOString(),
    ads: [...byAd.values()],
    actions: actions ?? [],
  });
}

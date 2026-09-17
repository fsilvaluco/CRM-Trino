// Cliente de la Graph API para el bot. Solo lo que el bot necesita: bajar
// insights a nivel de anuncio y (cuando NO es dry-run) pausar anuncios y
// ajustar presupuesto de conjuntos. El token nunca se loguea.
import { GRAPH_BASE, AD_ACCOUNT_ID, META_SYSTEM_TOKEN } from "./config";

export interface AdInsightRow {
  date: string; // YYYY-MM-DD (date_start)
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  adId: string;
  adName: string | null;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  inlineLinkClicks: number;
  cpc: number;
  ctr: number;
  video3sViews: number;
  thruplays: number;
  raw: unknown;
}

interface GraphAction {
  action_type: string;
  value: string;
}

interface GraphInsight {
  date_start?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  inline_link_clicks?: string;
  cpc?: string;
  ctr?: string;
  actions?: GraphAction[];
  video_thruplay_watched_actions?: GraphAction[];
}

function num(v: string | undefined | null): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Fecha YYYY-MM-DD en la zona de la cuenta (America/Santiago), con offset de
 *  días. Se usa para el time_range de insights: así el corte de medianoche
 *  coincide con el de Meta (que reporta en la TZ de la cuenta, no UTC). */
function santiagoDay(offsetDays: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(Date.now() - offsetDays * 86400000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function actionValue(actions: GraphAction[] | undefined, type: string): number {
  if (!actions) return 0;
  const hit = actions.find((a) => a.action_type === type);
  return hit ? num(hit.value) : 0;
}

// Los cuerpos de error de Meta pueden traer el token en la URL reflejada:
// se limpia antes de propagar.
function scrub(s: string): string {
  return s.replace(/access_token=[^&\s"]+/g, "access_token=[REDACTED]");
}

async function graph(path: string, params: Record<string, string>, method: "GET" | "POST" = "GET") {
  const url = new URL(`${GRAPH_BASE}/${path}`);
  const body = new URLSearchParams({ ...params, access_token: META_SYSTEM_TOKEN });
  const init: RequestInit = { method };
  if (method === "GET") {
    url.search = body.toString();
  } else {
    init.body = body;
  }
  const res = await fetch(url.toString(), init);
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Graph ${method} ${path}: respuesta no-JSON (${res.status})`);
  }
  const err = (json as { error?: { message?: string; code?: number } }).error;
  if (err) {
    throw new Error(`Graph ${method} ${path}: ${scrub(err.message || "error")} (code ${err.code ?? "?"})`);
  }
  return json;
}

/** Baja insights a nivel de anuncio, desglose diario, últimos 3 días. Maneja
 *  paginación por si la cuenta crece. */
export async function fetchAdInsights(): Promise<AdInsightRow[]> {
  const fields = [
    "date_start",
    "campaign_id", "campaign_name",
    "adset_id", "adset_name",
    "ad_id", "ad_name",
    "spend", "impressions", "reach", "frequency",
    "inline_link_clicks", "cpc", "ctr",
    "actions", "video_thruplay_watched_actions",
  ].join(",");

  const rows: AdInsightRow[] = [];
  let after: string | null = null;

  // Ventana de 3 días INCLUYENDO hoy, en la TZ de la cuenta. OJO: date_preset
  // "last_3d" excluye hoy (son los 3 días previos), así que una campaña
  // lanzada hoy devolvería 0 filas. Con time_range en fechas de Santiago el
  // corte de medianoche calza con el de Meta.
  const timeRange = JSON.stringify({ since: santiagoDay(2), until: santiagoDay(0) });

  do {
    const params: Record<string, string> = {
      level: "ad",
      time_range: timeRange,
      time_increment: "1",
      fields,
      limit: "200",
    };
    if (after) params.after = after;

    const page = (await graph(`${AD_ACCOUNT_ID}/insights`, params)) as {
      data?: GraphInsight[];
      paging?: { cursors?: { after?: string }; next?: string };
    };

    for (const r of page.data ?? []) {
      if (!r.ad_id) continue;
      rows.push({
        date: r.date_start ?? "",
        campaignId: r.campaign_id ?? null,
        campaignName: r.campaign_name ?? null,
        adsetId: r.adset_id ?? null,
        adsetName: r.adset_name ?? null,
        adId: r.ad_id,
        adName: r.ad_name ?? null,
        spend: num(r.spend),
        impressions: num(r.impressions),
        reach: num(r.reach),
        frequency: num(r.frequency),
        inlineLinkClicks: num(r.inline_link_clicks),
        cpc: num(r.cpc),
        ctr: num(r.ctr),
        video3sViews: actionValue(r.actions, "video_view"),
        thruplays: actionValue(r.video_thruplay_watched_actions, "video_thruplay_watched_total")
          || actionValue(r.actions, "video_thruplay_watched_total"),
        raw: r,
      });
    }

    after = page.paging?.next ? page.paging?.cursors?.after ?? null : null;
  } while (after);

  return rows;
}

export interface AdStructureRow {
  adId: string;
  adName: string | null;
  effectiveStatus: string | null;
  adsetId: string | null;
  adsetName: string | null;
  adsetBudgetClp: number | null;
  campaignId: string | null;
  campaignName: string | null;
}

interface GraphAdNode {
  id: string;
  name?: string;
  effective_status?: string;
  adset?: { id?: string; name?: string; daily_budget?: string };
  campaign?: { id?: string; name?: string };
}

/** Lista TODOS los anuncios de la cuenta con su conjunto y campaña, sin
 *  depender de que tengan entrega (insights no devuelve ads sin impresiones).
 *  Es lo que permite "ver" la campaña aunque esté en revisión. */
export async function fetchCampaignAds(): Promise<AdStructureRow[]> {
  const fields = "id,name,effective_status,adset{id,name,daily_budget},campaign{id,name}";
  const rows: AdStructureRow[] = [];
  let after: string | null = null;
  do {
    const params: Record<string, string> = { fields, limit: "200" };
    if (after) params.after = after;
    const page = (await graph(`${AD_ACCOUNT_ID}/ads`, params)) as {
      data?: GraphAdNode[];
      paging?: { cursors?: { after?: string }; next?: string };
    };
    for (const a of page.data ?? []) {
      rows.push({
        adId: a.id,
        adName: a.name ?? null,
        effectiveStatus: a.effective_status ?? null,
        adsetId: a.adset?.id ?? null,
        adsetName: a.adset?.name ?? null,
        adsetBudgetClp: a.adset?.daily_budget != null ? num(a.adset.daily_budget) : null,
        campaignId: a.campaign?.id ?? null,
        campaignName: a.campaign?.name ?? null,
      });
    }
    after = page.paging?.next ? page.paging?.cursors?.after ?? null : null;
  } while (after);
  return rows;
}

export interface AdSetInfo {
  id: string;
  name: string | null;
  status: string | null;
  /** daily_budget en CLP (moneda cero-decimales -> unidad = 1 CLP). null si el
   *  conjunto no tiene presupuesto propio (ej. campaña CBO). */
  dailyBudgetClp: number | null;
}

export async function getAdSet(adsetId: string): Promise<AdSetInfo> {
  const j = (await graph(adsetId, { fields: "id,name,status,daily_budget" })) as {
    id: string; name?: string; status?: string; daily_budget?: string;
  };
  return {
    id: j.id,
    name: j.name ?? null,
    status: j.status ?? null,
    dailyBudgetClp: j.daily_budget != null ? num(j.daily_budget) : null,
  };
}

/** Pausa un anuncio (status=PAUSED). Solo llamar cuando NO es dry-run. */
export async function pauseAd(adId: string): Promise<unknown> {
  return graph(adId, { status: "PAUSED" }, "POST");
}

/** Fija el daily_budget (CLP) de un conjunto. Solo llamar cuando NO es dry-run. */
export async function setAdSetDailyBudget(adsetId: string, dailyBudgetClp: number): Promise<unknown> {
  return graph(adsetId, { daily_budget: String(Math.round(dailyBudgetClp)) }, "POST");
}

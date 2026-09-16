// Orquestador del bot: una corrida completa. Sin efectos ocultos -- todo lo
// que decide queda en ad_actions_log (incluso en dry-run) y se avisa por
// Telegram. Las escrituras a Meta solo ocurren si BOT_ENABLED && !BOT_DRY_RUN.
import { createAdminClient } from "@/lib/supabase-admin";
import { BOT_ENABLED, BOT_DRY_RUN, DAILY_BUDGET_CAP_CLP, RULES } from "./config";
import { fetchAdInsights, getAdSet, pauseAd, setAdSetDailyBudget, type AdInsightRow } from "./meta-client";
import { resolveCampaign, fetchSpotifyClicks } from "./spotify-clicks";
import {
  aggregateAds, evaluateAdRules, evaluateBudgetRules,
  type Decision, type AdSetBudgetInput,
} from "./rules";
import { sendTelegram } from "./telegram";

type Supabase = ReturnType<typeof createAdminClient>;

export interface BotRunSummary {
  ranAt: string;
  dryRun: boolean;
  adsSeen: number;
  metricsUpserted: number;
  decisions: number;
  executed: number;
  skippedCooldown: number;
  errors: string[];
}

const actionVerb: Record<Decision["action"], string> = {
  pause: "⏸️ Pausar anuncio",
  budget_up: "⬆️ Subir presupuesto",
  budget_down: "⬇️ Bajar presupuesto",
  alert: "⚠️ Alerta",
};

export async function runMetaAdsBot(): Promise<BotRunSummary> {
  const supabase = createAdminClient();
  const ranAt = new Date().toISOString();
  const summary: BotRunSummary = {
    ranAt, dryRun: BOT_DRY_RUN, adsSeen: 0, metricsUpserted: 0,
    decisions: 0, executed: 0, skippedCooldown: 0, errors: [],
  };

  const campaign = await resolveCampaign(supabase);
  if (!campaign) {
    summary.errors.push("No se pudo resolver la campaña (slug del QR sin match)");
    return summary;
  }

  // 1) Bajar insights + spotify_clicks y agregar.
  let rows: AdInsightRow[];
  try {
    rows = await fetchAdInsights();
  } catch (err) {
    summary.errors.push(`Insights: ${err instanceof Error ? err.message : err}`);
    return summary;
  }
  const spotifyByAdDay = await fetchSpotifyClicks(supabase, campaign.qrId);
  const ads = aggregateAds(rows, spotifyByAdDay);
  summary.adsSeen = ads.length;

  if (rows.length === 0) {
    // Cuenta sin ads todavía (campaña no lanzada): nada que hacer.
    return summary;
  }

  // 2) UPSERT de métricas por (ad_id, date).
  const metricRows = rows.map((r) => ({
    project_id: campaign.projectId,
    date: r.date,
    campaign_id: r.campaignId, campaign_name: r.campaignName,
    adset_id: r.adsetId, adset_name: r.adsetName,
    ad_id: r.adId, ad_name: r.adName,
    spend: r.spend, impressions: r.impressions, reach: r.reach, frequency: r.frequency,
    inline_link_clicks: r.inlineLinkClicks, cpc: r.cpc, ctr: r.ctr,
    video_3s_views: r.video3sViews, thruplays: r.thruplays,
    spotify_clicks: spotifyByAdDay.get(`${r.adName}|${r.date}`) ?? 0,
    raw: r.raw as object,
    updated_at: ranAt,
  }));
  const { error: upsertErr } = await supabase
    .from("ad_metrics_daily")
    .upsert(metricRows, { onConflict: "ad_id,date" });
  if (upsertErr) summary.errors.push(`Upsert métricas: ${upsertErr.message}`);
  else summary.metricsUpserted = metricRows.length;

  // 3) Estado de rachas de CPC.
  const { data: stateRows } = await supabase.from("ad_rule_state").select("ad_id, cpc_breach_streak");
  const cpcStreak = new Map<string, number>();
  for (const s of (stateRows ?? []) as { ad_id: string; cpc_breach_streak: number }[]) {
    cpcStreak.set(s.ad_id, s.cpc_breach_streak);
  }

  // 4) Evaluar reglas de anuncio.
  const { decisions: adDecisions, newCpcStreak } = evaluateAdRules(ads, cpcStreak);

  // Persistir rachas actualizadas.
  const streakRows = [...newCpcStreak.entries()].map(([ad_id, cpc_breach_streak]) => ({
    ad_id, cpc_breach_streak, updated_at: ranAt,
  }));
  if (streakRows.length > 0) {
    await supabase.from("ad_rule_state").upsert(streakRows, { onConflict: "ad_id" });
  }

  // 5) Evaluar reglas de presupuesto (nivel adset).
  const budgetDecisions = await buildAndEvaluateBudgets(rows, spotifyByAdDay, summary);

  const decisions = [...adDecisions, ...budgetDecisions];
  summary.decisions = decisions.length;

  // 6) Aplicar guardrail de cooldown + ejecutar/loguear cada decisión.
  for (const d of decisions) {
    await applyDecision(supabase, d, summary);
  }

  // 7) Aviso de cierre si hubo algo.
  if (decisions.length > 0) {
    const modo = BOT_DRY_RUN ? "🧪 DRY-RUN (no se tocó Meta)" : "✅ real";
    await sendTelegram(
      `<b>Bot Meta Ads</b> — corrida ${modo}\n` +
      `Anuncios: ${summary.adsSeen} · Decisiones: ${summary.decisions} · Ejecutadas: ${summary.executed} · Cooldown: ${summary.skippedCooldown}`
    );
  }

  return summary;
}

async function buildAndEvaluateBudgets(
  rows: AdInsightRow[],
  spotifyByAdDay: Map<string, number>,
  summary: BotRunSummary
): Promise<Decision[]> {
  // Agregar por (adset, día): spend y spotify_clicks -> costo/SpotifyClick.
  const days = [...new Set(rows.map((r) => r.date))].sort();
  const adsetIds = [...new Set(rows.map((r) => r.adsetId).filter((x): x is string => Boolean(x)))];
  const spendByAdsetDay = new Map<string, number>();
  const spotifyByAdsetDay = new Map<string, number>();
  const adsetName = new Map<string, string | null>();
  for (const r of rows) {
    if (!r.adsetId) continue;
    adsetName.set(r.adsetId, r.adsetName);
    const k = `${r.adsetId}|${r.date}`;
    spendByAdsetDay.set(k, (spendByAdsetDay.get(k) ?? 0) + r.spend);
    spotifyByAdsetDay.set(k, (spotifyByAdsetDay.get(k) ?? 0) + (spotifyByAdDay.get(`${r.adName}|${r.date}`) ?? 0));
  }

  const inputs: AdSetBudgetInput[] = [];
  for (const adsetId of adsetIds) {
    let dailyBudgetClp: number | null = null;
    try {
      dailyBudgetClp = (await getAdSet(adsetId)).dailyBudgetClp;
    } catch (err) {
      summary.errors.push(`AdSet ${adsetId}: ${err instanceof Error ? err.message : err}`);
    }
    const costPerSpotifyByDay = new Map<string, number>();
    for (const d of days) {
      const spend = spendByAdsetDay.get(`${adsetId}|${d}`) ?? 0;
      const sc = spotifyByAdsetDay.get(`${adsetId}|${d}`) ?? 0;
      costPerSpotifyByDay.set(d, sc > 0 ? spend / sc : Infinity);
    }
    inputs.push({ adsetId, adsetName: adsetName.get(adsetId) ?? null, dailyBudgetClp, costPerSpotifyByDay });
  }

  return evaluateBudgetRules(inputs, days, DAILY_BUDGET_CAP_CLP);
}

/** Cooldown de 24h por anuncio (pausas) o conjunto (presupuesto). Las alertas
 *  no cuentan como acción y no consumen cooldown. */
async function hasRecentAction(supabase: Supabase, d: Decision): Promise<boolean> {
  const since = new Date(Date.now() - RULES.ACTION_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
  let q = supabase.from("ad_actions_log").select("id").neq("action", "alert").gte("ts", since).limit(1);
  if (d.action === "pause" && d.adId) q = q.eq("ad_id", d.adId);
  else if (d.adsetId) q = q.eq("adset_id", d.adsetId);
  else return false;
  const { data } = await q;
  return (data?.length ?? 0) > 0;
}

async function applyDecision(supabase: Supabase, d: Decision, summary: BotRunSummary): Promise<void> {
  // Cooldown solo para acciones reales (no alertas).
  if (d.action !== "alert" && (await hasRecentAction(supabase, d))) {
    summary.skippedCooldown++;
    return;
  }

  const willExecute = d.action !== "alert" && BOT_ENABLED && !BOT_DRY_RUN;
  let metaResponse: unknown = null;
  let execError: string | null = null;

  if (willExecute) {
    try {
      if (d.action === "pause" && d.adId) {
        metaResponse = await pauseAd(d.adId);
      } else if ((d.action === "budget_up" || d.action === "budget_down") && d.adsetId && d.after) {
        metaResponse = await setAdSetDailyBudget(d.adsetId, Number(d.after.dailyBudgetClp));
      }
      summary.executed++;
    } catch (err) {
      execError = err instanceof Error ? err.message : String(err);
      summary.errors.push(`Ejecutar ${d.action} ${d.adId ?? d.adsetId}: ${execError}`);
    }
  }

  await supabase.from("ad_actions_log").insert({
    project_id: null,
    campaign_id: d.campaignId ?? null,
    adset_id: d.adsetId ?? null,
    ad_id: d.adId ?? null,
    action: d.action,
    reason: d.reason,
    rule_key: d.ruleKey,
    before: d.before ?? null,
    after: d.after ?? null,
    meta_response: (metaResponse ?? (execError ? { error: execError } : null)) as object | null,
    dry_run: !willExecute,
  });

  // Aviso por decisión.
  const tag = willExecute ? "EJECUTADO" : d.action === "alert" ? "ALERTA" : "DRY-RUN";
  await sendTelegram(
    `<b>${actionVerb[d.action]}</b> [${tag}]\n` +
    `${d.adId ? `ad: <code>${d.adId}</code>\n` : ""}${d.adsetId ? `adset: <code>${d.adsetId}</code>\n` : ""}` +
    `${d.reason}${execError ? `\n❌ error: ${execError}` : ""}`
  );
}

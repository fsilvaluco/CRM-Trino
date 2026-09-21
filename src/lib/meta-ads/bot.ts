// Orquestador del bot: una corrida completa. Sin efectos ocultos -- todo lo
// que decide queda en ad_actions_log (incluso en dry-run) y se avisa por
// Telegram. Las escrituras a Meta solo ocurren si BOT_ENABLED && !BOT_DRY_RUN.
import { createAdminClient } from "@/lib/supabase-admin";
import { BOT_ENABLED, BOT_DRY_RUN, DAILY_BUDGET_CAP_CLP, CAMPAIGN_PREFIXES, RULES } from "./config";
import {
  fetchAdInsights, fetchCampaignAds, fetchAdPeriodReach, getAdSet, pauseAd, setAdSetDailyBudget,
  type AdInsightRow, type AdStructureRow,
} from "./meta-client";
import { resolveCampaign, fetchSpotifyClicks } from "./spotify-clicks";
import {
  aggregateAds, evaluateAdRules, evaluateBudgetRules, spotifyKey,
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
  // Blindaje: solo campañas cuyo nombre empiece con un prefijo permitido.
  if (CAMPAIGN_PREFIXES.length > 0) {
    rows = rows.filter((r) => CAMPAIGN_PREFIXES.some((p) => (r.campaignName ?? "").startsWith(p)));
  }

  // 1.b) Estructura de la campaña (independiente de la entrega): así el bot
  //      "ve" los anuncios aunque estén en revisión con 0 impresiones. Avisa
  //      por Telegram el listado con IDs SOLO cuando la estructura cambia.
  const struct = await detectAndReportStructure(supabase, summary);

  const spotify = await fetchSpotifyClicks(supabase, campaign.qrId);
  // Las reglas optimizan por SpotifyClick ÚNICO (dedup IP+UA 30min): mismos
  // umbrales/guardrails, pero sin decidir en base a dobles toques. El TOTAL se
  // guarda igual en ad_metrics_daily para el reporte.
  const spotifyUnique = new Map<string, number>();
  for (const [k, v] of spotify) spotifyUnique.set(k, v.unique);
  const ads = aggregateAds(rows, spotifyUnique);
  summary.adsSeen = ads.length;

  // Frecuencia del PERÍODO desde Meta (alcance no aditivo entre días): corrige
  // el cálculo que inflaba la frecuencia (impresiones sumadas / alcance-máx
  // diario). Si Meta no la trae, se deja el fallback de aggregateAds.
  try {
    const periodReach = await fetchAdPeriodReach();
    for (const w of ads) {
      const p = periodReach.get(w.adId);
      if (p) { w.frequency = p.frequency; w.reachMax = p.reach; }
    }
  } catch (err) {
    summary.errors.push(`Alcance período: ${err instanceof Error ? err.message : err}`);
  }

  if (rows.length === 0) {
    // Sin ENTREGA todavía (ads en revisión) o cuenta vacía. La confirmación de
    // estructura ya la mandó detectAndReportStructure si hubo cambio -- no se
    // spamea cada 6h. Solo si NO hay ninguna campaña se manda el heartbeat.
    if (struct.ads === 0) {
      await sendTelegram(`🤖 <b>Bot Meta Ads</b> activo · 0 campañas · ${BOT_DRY_RUN ? "dry-run" : "real"}`);
    }
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
    spotify_clicks: spotify.get(spotifyKey(r.adsetName, r.adName, r.date))?.total ?? 0,
    spotify_clicks_unique: spotify.get(spotifyKey(r.adsetName, r.adName, r.date))?.unique ?? 0,
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

  // 5) Evaluar reglas de presupuesto (nivel adset) — también por SpotifyClick único.
  const budgetDecisions = await buildAndEvaluateBudgets(rows, spotifyUnique, summary);

  const decisions = [...adDecisions, ...budgetDecisions];
  summary.decisions = decisions.length;

  // 6) Aplicar. Las decisiones de anuncio (pausa/alerta) y las alertas de
  //    presupuesto se aplican individualmente. El par subir/bajar presupuesto
  //    es ATÓMICO: si CUALQUIERA de las dos patas está en cooldown, no se hace
  //    ninguna (si no, se subiría una sin bajar la otra y se rompería el tope).
  const budgetPair = budgetDecisions.filter((d) => d.action === "budget_up" || d.action === "budget_down");
  const individual = [...adDecisions, ...budgetDecisions.filter((d) => d.action === "alert")];
  for (const d of individual) {
    await applyDecision(supabase, d, summary, campaign.projectId);
  }
  if (budgetPair.length > 0) {
    await applyBudgetPairAtomic(supabase, budgetPair, summary, campaign.projectId);
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

/** Lee la estructura viva (campañas→conjuntos→anuncios) filtrada por prefijo,
 *  y avisa por Telegram el listado con IDs SOLO cuando cambió respecto a la
 *  última corrida (firma en bot_kv). Devuelve los conteos para el heartbeat. */
async function detectAndReportStructure(
  supabase: Supabase,
  summary: BotRunSummary
): Promise<{ campaigns: number; adsets: number; ads: number }> {
  let all: AdStructureRow[];
  try {
    all = await fetchCampaignAds();
  } catch (err) {
    summary.errors.push(`Estructura: ${err instanceof Error ? err.message : err}`);
    return { campaigns: 0, adsets: 0, ads: 0 };
  }
  const rows = CAMPAIGN_PREFIXES.length > 0
    ? all.filter((r) => CAMPAIGN_PREFIXES.some((p) => (r.campaignName ?? "").startsWith(p)))
    : all;

  const counts = {
    campaigns: new Set(rows.map((r) => r.campaignId)).size,
    adsets: new Set(rows.map((r) => r.adsetId)).size,
    ads: rows.length,
  };

  const sig = rows
    .map((r) => `${r.campaignId}|${r.adsetId}|${r.adId}|${r.effectiveStatus}`)
    .sort()
    .join(";");
  const { data: kv } = await supabase.from("bot_kv").select("value").eq("key", "structure_sig").maybeSingle();
  const prev = (kv as { value: string } | null)?.value ?? "";

  if (sig !== prev) {
    if (rows.length > 0) await sendTelegram(buildStructureMessage(rows, counts));
    await supabase.from("bot_kv").upsert(
      { key: "structure_sig", value: sig, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  }
  return counts;
}

function buildStructureMessage(
  rows: AdStructureRow[],
  counts: { campaigns: number; adsets: number; ads: number }
): string {
  // Agrupar campaña -> conjunto -> anuncios.
  const byCampaign = new Map<string, AdStructureRow[]>();
  for (const r of rows) {
    const k = r.campaignId ?? "?";
    (byCampaign.get(k) ?? byCampaign.set(k, []).get(k)!).push(r);
  }
  const lines: string[] = [`🤖 <b>Bot Meta Ads</b> · estructura detectada (${BOT_DRY_RUN ? "dry-run" : "real"})`];
  for (const [, cRows] of byCampaign) {
    const c0 = cRows[0];
    lines.push(`\n📣 <b>${c0.campaignName ?? "?"}</b> (<code>${c0.campaignId}</code>)`);
    const byAdset = new Map<string, AdStructureRow[]>();
    for (const r of cRows) {
      const k = r.adsetId ?? "?";
      (byAdset.get(k) ?? byAdset.set(k, []).get(k)!).push(r);
    }
    for (const [, sRows] of byAdset) {
      const s0 = sRows[0];
      const budget = s0.adsetBudgetClp != null ? `${s0.adsetBudgetClp} CLP/día` : "sin budget propio";
      lines.push(`  📦 <b>${s0.adsetName ?? "?"}</b> (<code>${s0.adsetId}</code>) · ${budget} · ${sRows.length} anuncios`);
      for (const r of sRows) {
        lines.push(`     • ${r.adName ?? "?"} — <code>${r.adId}</code> — ${r.effectiveStatus ?? "?"}`);
      }
    }
  }
  lines.push(`\n<b>Total:</b> ${counts.campaigns} campaña(s) · ${counts.adsets} conjunto(s) · ${counts.ads} anuncios`);
  return lines.join("\n");
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
    spotifyByAdsetDay.set(k, (spotifyByAdsetDay.get(k) ?? 0) + (spotifyByAdDay.get(spotifyKey(r.adsetName, r.adName, r.date)) ?? 0));
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

/** Aplica el par subir/bajar presupuesto de forma ATÓMICA: si cualquiera de
 *  las dos patas tuvo una acción en las últimas 24h (cooldown), no se ejecuta
 *  NINGUNA -- así nunca se sube un conjunto sin bajar el otro (rompería el
 *  tope diario). Si ambas pasan, se aplican las dos (con cooldown ya validado). */
async function applyBudgetPairAtomic(
  supabase: Supabase, pair: Decision[], summary: BotRunSummary, projectId: string | null
): Promise<void> {
  for (const d of pair) {
    if (await hasRecentAction(supabase, d)) {
      summary.skippedCooldown += pair.length;
      await sendTelegram(
        `⏸️ <b>Movimiento de presupuesto OMITIDO</b> (cooldown)\n` +
        `Una pata (adset <code>${d.adsetId}</code>) tuvo una acción en las últimas 24h. ` +
        `No se hace ninguna, para no romper el tope diario.`
      );
      return;
    }
  }
  for (const d of pair) {
    await applyDecision(supabase, d, summary, projectId, true);
  }
}

async function applyDecision(
  supabase: Supabase, d: Decision, summary: BotRunSummary, projectId: string | null,
  skipCooldown = false
): Promise<void> {
  // Cooldown solo para acciones reales (no alertas). Se puede omitir cuando el
  // llamador ya validó el cooldown (ej. el par de presupuesto atómico).
  if (!skipCooldown && d.action !== "alert" && (await hasRecentAction(supabase, d))) {
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
    project_id: projectId,
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

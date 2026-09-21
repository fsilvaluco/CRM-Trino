// Motor de reglas puro (sin red ni DB): recibe métricas agregadas y estado, y
// devuelve decisiones + el nuevo estado de rachas. Los guardrails son los
// pedidos, sin reinterpretar (ver RULES en config). Toda la parte con efectos
// (leer Meta/DB, ejecutar, loguear, avisar) vive en bot.ts.
import { RULES } from "./config";
import type { AdInsightRow } from "./meta-client";

/** Métricas de un anuncio agregadas sobre la ventana leída (últimos ~3 días).
 *  El CPC/hook se RECALCULAN desde los totales, no se promedia el diario. */
export interface AdWindow {
  adId: string;
  adName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  campaignId: string | null;
  impressions: number;
  spend: number;
  linkClicks: number;
  video3s: number;
  reachMax: number;
  spotifyClicks: number;
  cpc: number;          // spend / linkClicks
  hookRate: number;     // video3s / impressions
  frequency: number;    // impressions / reachMax (aprox de la ventana)
  costPerSpotify: number; // spend / spotifyClicks (Infinity si 0)
  spotifyPerClick: number; // spotifyClicks / linkClicks
}

export interface Decision {
  action: "pause" | "budget_up" | "budget_down" | "alert";
  adId?: string;
  adsetId?: string | null;
  campaignId?: string | null;
  reason: string;
  ruleKey: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

/** Clave de atribución canónica: conjunto + anuncio + día (utm_term +
 *  utm_content + día). Única fuente de verdad para cruzar Meta con qr_scans;
 *  los creativos se repiten entre conjuntos con el mismo nombre. */
export function spotifyKey(adsetName: string | null, adName: string | null, day: string): string {
  return `${adsetName ?? ""}|${adName ?? ""}|${day}`;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Agrega las filas diarias de insights + spotify_clicks a una AdWindow por
 *  anuncio. `spotifyByAdDay` es el mapa "adName|YYYY-MM-DD" -> clicks. */
export function aggregateAds(
  rows: AdInsightRow[],
  spotifyByAdDay: Map<string, number>
): AdWindow[] {
  const byAd = new Map<string, AdWindow>();
  for (const r of rows) {
    let w = byAd.get(r.adId);
    if (!w) {
      w = {
        adId: r.adId, adName: r.adName, adsetId: r.adsetId, adsetName: r.adsetName,
        campaignId: r.campaignId, impressions: 0, spend: 0, linkClicks: 0, video3s: 0,
        reachMax: 0, spotifyClicks: 0, cpc: 0, hookRate: 0, frequency: 0,
        costPerSpotify: Infinity, spotifyPerClick: 0,
      };
      byAd.set(r.adId, w);
    }
    w.impressions += r.impressions;
    w.spend += r.spend;
    w.linkClicks += r.inlineLinkClicks;
    w.video3s += r.video3sViews;
    w.reachMax = Math.max(w.reachMax, r.reach);
    w.spotifyClicks += spotifyByAdDay.get(spotifyKey(r.adsetName, r.adName, r.date)) ?? 0;
  }
  for (const w of byAd.values()) {
    w.cpc = w.linkClicks > 0 ? w.spend / w.linkClicks : 0;
    w.hookRate = w.impressions > 0 ? w.video3s / w.impressions : 0;
    w.frequency = w.reachMax > 0 ? w.impressions / w.reachMax : 0;
    w.costPerSpotify = w.spotifyClicks > 0 ? w.spend / w.spotifyClicks : Infinity;
    w.spotifyPerClick = w.linkClicks > 0 ? w.spotifyClicks / w.linkClicks : 0;
  }
  return [...byAd.values()];
}

const fmt = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : n);

/** Evalúa las reglas a nivel de ANUNCIO (pausas + alertas). Devuelve las
 *  decisiones y el nuevo estado de rachas de CPC (a persistir). */
export function evaluateAdRules(
  ads: AdWindow[],
  cpcStreak: Map<string, number>
): { decisions: Decision[]; newCpcStreak: Map<string, number> } {
  const decisions: Decision[] = [];
  const newStreak = new Map<string, number>();

  // Solo anuncios con datos suficientes entran a comparaciones/mediana.
  const eligible = ads.filter((a) => a.impressions >= RULES.MIN_IMPRESSIONS);
  const medianCpc = median(eligible.filter((a) => a.linkClicks > 0).map((a) => a.cpc));
  // Mediana del costo por SpotifyClick único del conjunto (para la regla de hook).
  const medianCostPerSC = median(
    eligible.filter((a) => Number.isFinite(a.costPerSpotify)).map((a) => a.costPerSpotify)
  );

  for (const a of ads) {
    // Piso de datos: no se evalúa nada accionable bajo el mínimo.
    if (a.impressions < RULES.MIN_IMPRESSIONS) {
      newStreak.set(a.adId, 0); // sin datos suficientes, la racha no avanza
      continue;
    }

    let paused = false;

    // Regla CPC caro: CPC > 2x mediana en 2 lecturas seguidas.
    const cpcBreach = medianCpc > 0 && a.cpc > RULES.CPC_PAUSE_MULTIPLE * medianCpc;
    const streak = cpcBreach ? (cpcStreak.get(a.adId) ?? 0) + 1 : 0;
    newStreak.set(a.adId, streak);
    if (streak >= RULES.CPC_PAUSE_STREAK) {
      decisions.push({
        action: "pause", adId: a.adId, adsetId: a.adsetId, campaignId: a.campaignId,
        ruleKey: "cpc_over_2x_median",
        reason: `CPC ${fmt(a.cpc)} > ${RULES.CPC_PAUSE_MULTIPLE}× mediana ${fmt(medianCpc)} en ${streak} lecturas seguidas`,
        before: { cpc: fmt(a.cpc), medianCpc: fmt(medianCpc), streak, impressions: a.impressions },
      });
      paused = true;
    }

    // Regla hook débil: hook rate < 20% Y CPC sobre mediana Y ADEMÁS el costo
    // por SpotifyClick único del anuncio sobre la mediana del conjunto -- así
    // no se pausa un anuncio de hook bajo que igual trae escuchas baratas.
    if (
      !paused &&
      a.hookRate < RULES.HOOK_RATE_MIN &&
      medianCpc > 0 && a.cpc > medianCpc &&
      medianCostPerSC > 0 && a.costPerSpotify > medianCostPerSC
    ) {
      decisions.push({
        action: "pause", adId: a.adId, adsetId: a.adsetId, campaignId: a.campaignId,
        ruleKey: "low_hook_high_cpc",
        reason: `hook rate ${(a.hookRate * 100).toFixed(1)}% < ${RULES.HOOK_RATE_MIN * 100}%, CPC ${fmt(a.cpc)} > mediana ${fmt(medianCpc)} y costo/SC ${fmt(a.costPerSpotify)} > mediana ${fmt(medianCostPerSC)}`,
        before: { hookRate: fmt(a.hookRate), cpc: fmt(a.cpc), medianCpc: fmt(medianCpc), costPerSpotify: fmt(a.costPerSpotify), medianCostPerSC: fmt(medianCostPerSC), impressions: a.impressions },
      });
      paused = true;
    }

    // Alertas (no cuentan como acción, no consumen el cooldown de 24h).
    if (a.frequency > RULES.FREQ_ALERT) {
      decisions.push({
        action: "alert", adId: a.adId, adsetId: a.adsetId, campaignId: a.campaignId,
        ruleKey: "frequency_high",
        reason: `frecuencia ${fmt(a.frequency)} > ${RULES.FREQ_ALERT} (fatiga de audiencia)`,
        before: { frequency: fmt(a.frequency), impressions: a.impressions, reach: a.reachMax },
      });
    }
    if (a.linkClicks > 0 && a.spotifyPerClick < RULES.SPOTIFY_PER_CLICK_ALERT) {
      decisions.push({
        action: "alert", adId: a.adId, adsetId: a.adsetId, campaignId: a.campaignId,
        ruleKey: "spotify_per_click_low",
        reason: `SpotifyClick/clic ${(a.spotifyPerClick * 100).toFixed(1)}% < ${RULES.SPOTIFY_PER_CLICK_ALERT * 100}% (fuga entre clic y escucha)`,
        before: { spotifyClicks: a.spotifyClicks, linkClicks: a.linkClicks },
      });
    }
  }

  return { decisions, newCpcStreak: newStreak };
}

// ── Reglas de presupuesto a nivel de CONJUNTO (adset) ───────────────────────

export interface AdSetBudgetInput {
  adsetId: string;
  adsetName: string | null;
  dailyBudgetClp: number | null;
  /** costo/SpotifyClick por día (YYYY-MM-DD -> costo), últimos días. */
  costPerSpotifyByDay: Map<string, number>;
}

/** Escala al conjunto ganador si su costo/SpotifyClick < 70% del otro por 3
 *  días seguidos. Mueve 20%/día del presupuesto del perdedor al ganador,
 *  clamp a +20%/día del ganador, y sin superar el plan diario total. Diseño
 *  neto-cero (mover, no agregar), así el total no cambia. */
export function evaluateBudgetRules(
  adsets: AdSetBudgetInput[],
  recentDays: string[],
  dailyBudgetCapClp: number | null
): Decision[] {
  const decisions: Decision[] = [];
  // Solo conjuntos con presupuesto propio (ABO) y datos en los N días.
  const withBudget = adsets.filter((s) => s.dailyBudgetClp != null && s.dailyBudgetClp > 0);
  if (withBudget.length < 2) {
    if (adsets.length >= 2 && withBudget.length < 2) {
      decisions.push({
        action: "alert", ruleKey: "no_adset_budgets",
        reason: "No hay presupuesto por conjunto (¿campaña CBO?). Las reglas de presupuesto necesitan ABO.",
      });
    }
    return decisions;
  }

  const days = recentDays.slice(-RULES.WINNER_DAYS);
  if (days.length < RULES.WINNER_DAYS) return decisions; // aún no hay 3 días

  // costo/SpotifyClick promedio de la ventana, para ordenar mejor vs peor.
  const avg = (s: AdSetBudgetInput) => {
    const vals = days.map((d) => s.costPerSpotifyByDay.get(d) ?? Infinity);
    return vals.reduce((x, y) => x + y, 0) / vals.length;
  };
  const sorted = [...withBudget].sort((a, b) => avg(a) - avg(b));
  const winner = sorted[0];
  const loser = sorted[sorted.length - 1];
  if (winner.adsetId === loser.adsetId) return decisions;

  // Ganador debe batir al perdedor por el ratio en CADA uno de los N días.
  const beatsEveryDay = days.every((d) => {
    const w = winner.costPerSpotifyByDay.get(d);
    const l = loser.costPerSpotifyByDay.get(d);
    return w != null && l != null && Number.isFinite(w) && Number.isFinite(l) && w < RULES.WINNER_COST_RATIO * l;
  });
  if (!beatsEveryDay) return decisions;

  const winnerBudget = winner.dailyBudgetClp as number;
  const loserBudget = loser.dailyBudgetClp as number;

  // Mover 20% del presupuesto del perdedor, clamp a +20% del ganador.
  const wantMove = RULES.BUDGET_SHIFT_PCT * loserBudget;
  const maxUp = RULES.MAX_BUDGET_UP_PCT * winnerBudget;
  const move = Math.floor(Math.min(wantMove, maxUp));
  if (move <= 0) return decisions;

  const newWinner = winnerBudget + move;
  const newLoser = loserBudget - move;
  if (newLoser <= 0) return decisions; // no dejar al perdedor en 0

  // Guardrail del plan diario total (neto-cero igual lo respeta, pero se
  // verifica de forma defensiva contra el resto de conjuntos).
  if (dailyBudgetCapClp != null) {
    const totalAfter = withBudget.reduce((sum, s) => {
      if (s.adsetId === winner.adsetId) return sum + newWinner;
      if (s.adsetId === loser.adsetId) return sum + newLoser;
      return sum + (s.dailyBudgetClp as number);
    }, 0);
    if (totalAfter > dailyBudgetCapClp) {
      decisions.push({
        action: "alert", ruleKey: "budget_cap_reached",
        reason: `Mover presupuesto superaría el plan diario (${totalAfter} > ${dailyBudgetCapClp} CLP). No se ejecuta.`,
      });
      return decisions;
    }
  }

  const reasonBase = `costo/SpotifyClick del conjunto ganador < ${RULES.WINNER_COST_RATIO * 100}% del perdedor por ${RULES.WINNER_DAYS} días`;
  decisions.push({
    action: "budget_up", adsetId: winner.adsetId,
    ruleKey: "winner_scale_up",
    reason: `${reasonBase}. +${move} CLP/día al ganador (${winner.adsetName ?? winner.adsetId}).`,
    before: { dailyBudgetClp: winnerBudget }, after: { dailyBudgetClp: newWinner },
  });
  decisions.push({
    action: "budget_down", adsetId: loser.adsetId,
    ruleKey: "loser_scale_down",
    reason: `${reasonBase}. -${move} CLP/día al perdedor (${loser.adsetName ?? loser.adsetId}).`,
    before: { dailyBudgetClp: loserBudget }, after: { dailyBudgetClp: newLoser },
  });
  return decisions;
}

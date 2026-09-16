// Tests del motor de reglas (puro). Runner nativo de Node vía tsx:
//   npm test
// Cubren los guardrails que manejan plata: mediana, piso de impresiones,
// racha de CPC (2 lecturas), hook, alertas, y el movimiento neto-cero de
// presupuesto con sus clamps.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  median, aggregateAds, evaluateAdRules, evaluateBudgetRules,
  type AdWindow, type AdSetBudgetInput, type Decision,
} from "./rules";
import type { AdInsightRow } from "./meta-client";

// ── helpers ────────────────────────────────────────────────────────────────
const DEFAULTS: AdWindow = {
  adId: "a", adName: "A", adsetId: "s1", adsetName: "S1", campaignId: "c",
  impressions: 2000, spend: 1000, linkClicks: 20, video3s: 1000, reachMax: 2000,
  spotifyClicks: 20, cpc: 0, hookRate: 0, frequency: 0, costPerSpotify: 0, spotifyPerClick: 0,
};
function ad(over: Partial<AdWindow> & { adId: string }): AdWindow {
  const b: AdWindow = { ...DEFAULTS, ...over };
  b.cpc = over.cpc ?? (b.linkClicks > 0 ? b.spend / b.linkClicks : 0);
  b.hookRate = over.hookRate ?? (b.impressions > 0 ? b.video3s / b.impressions : 0);
  b.frequency = over.frequency ?? (b.reachMax > 0 ? b.impressions / b.reachMax : 0);
  b.spotifyPerClick = over.spotifyPerClick ?? (b.linkClicks > 0 ? b.spotifyClicks / b.linkClicks : 0);
  b.costPerSpotify = over.costPerSpotify ?? (b.spotifyClicks > 0 ? b.spend / b.spotifyClicks : Infinity);
  return b;
}
const pauses = (ds: Decision[], id: string) =>
  ds.filter((d) => d.action === "pause" && d.adId === id);

// ── median ───────────────────────────────────────────────────────────────
test("median: impar, par y vacío", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), 0);
});

// ── aggregateAds ───────────────────────────────────────────────────────────
test("aggregateAds suma días y cruza spotify_clicks por adName|date", () => {
  const rows: AdInsightRow[] = [
    { date: "2026-09-15", campaignId: "c", campaignName: "C", adsetId: "s1", adsetName: "S1",
      adId: "a1", adName: "V00", spend: 500, impressions: 1000, reach: 900, frequency: 1.1,
      inlineLinkClicks: 10, cpc: 50, ctr: 1, video3sViews: 300, thruplays: 50, raw: {} },
    { date: "2026-09-16", campaignId: "c", campaignName: "C", adsetId: "s1", adsetName: "S1",
      adId: "a1", adName: "V00", spend: 500, impressions: 1000, reach: 950, frequency: 1.05,
      inlineLinkClicks: 10, cpc: 50, ctr: 1, video3sViews: 300, thruplays: 40, raw: {} },
  ];
  const spotify = new Map<string, number>([["V00|2026-09-15", 4], ["V00|2026-09-16", 6]]);
  const [w] = aggregateAds(rows, spotify);
  assert.equal(w.impressions, 2000);
  assert.equal(w.spend, 1000);
  assert.equal(w.linkClicks, 20);
  assert.equal(w.spotifyClicks, 10);
  assert.equal(w.cpc, 50);              // 1000 / 20
  assert.equal(w.hookRate, 0.3);        // 600 / 2000
  assert.equal(w.reachMax, 950);        // max, no suma
  assert.equal(w.spotifyPerClick, 0.5); // 10 / 20
});

// ── piso de impresiones ────────────────────────────────────────────────────
test("no actúa bajo 1.500 impresiones y resetea la racha", () => {
  const ads = [ad({ adId: "low", impressions: 1000, spend: 5000, linkClicks: 5 })]; // CPC altísimo
  const { decisions, newCpcStreak } = evaluateAdRules(ads, new Map([["low", 1]]));
  assert.equal(decisions.length, 0);
  assert.equal(newCpcStreak.get("low"), 0);
});

// ── CPC > 2x mediana en 2 lecturas seguidas ─────────────────────────────────
test("CPC caro pausa solo tras 2 lecturas seguidas", () => {
  // 3 baseline cpc=100 (spend2000/clicks20) -> mediana 100. bad cpc=250.
  const base = ["b1", "b2", "b3"].map((id) => ad({ adId: id, spend: 2000, linkClicks: 20 }));
  const bad = ad({ adId: "bad", spend: 2000, linkClicks: 8 }); // cpc 250 > 200
  const ads = [...base, bad];

  // 1ª lectura: racha 0 -> 1, sin pausa.
  const r1 = evaluateAdRules(ads, new Map());
  assert.equal(pauses(r1.decisions, "bad").length, 0);
  assert.equal(r1.newCpcStreak.get("bad"), 1);

  // 2ª lectura: racha 1 -> 2, pausa.
  const r2 = evaluateAdRules(ads, r1.newCpcStreak);
  const p = pauses(r2.decisions, "bad");
  assert.equal(p.length, 1);
  assert.equal(p[0].ruleKey, "cpc_over_2x_median");
  assert.equal(r2.newCpcStreak.get("bad"), 2);
});

test("CPC vuelve a la normalidad resetea la racha (no pausa)", () => {
  const base = ["b1", "b2", "b3"].map((id) => ad({ adId: id, spend: 2000, linkClicks: 20 }));
  const okAd = ad({ adId: "x", spend: 2000, linkClicks: 20 }); // cpc 100 = mediana
  const r = evaluateAdRules([...base, okAd], new Map([["x", 1]]));
  assert.equal(pauses(r.decisions, "x").length, 0);
  assert.equal(r.newCpcStreak.get("x"), 0);
});

// ── hook rate < 20% y CPC > mediana ─────────────────────────────────────────
test("hook débil + CPC sobre mediana pausa en una sola lectura", () => {
  const base = ["b1", "b2"].map((id) => ad({ adId: id, spend: 2000, linkClicks: 20 })); // cpc 100
  const weak = ad({ adId: "weak", spend: 1500, linkClicks: 10, video3s: 200, impressions: 2000 }); // cpc150>100, hook .1
  const r = evaluateAdRules([...base, weak], new Map());
  const p = pauses(r.decisions, "weak");
  assert.equal(p.length, 1);
  assert.equal(p[0].ruleKey, "low_hook_high_cpc");
});

// ── alertas ─────────────────────────────────────────────────────────────────
test("alerta por frecuencia > 3 (sin pausar)", () => {
  const a = ad({ adId: "f", impressions: 2000, reachMax: 500 }); // freq 4
  const r = evaluateAdRules([a], new Map());
  const al = r.decisions.filter((d) => d.action === "alert" && d.ruleKey === "frequency_high");
  assert.equal(al.length, 1);
  assert.equal(pauses(r.decisions, "f").length, 0);
});

test("alerta por SpotifyClick/clic < 40%", () => {
  const a = ad({ adId: "s", linkClicks: 20, spotifyClicks: 1 }); // 5%
  const r = evaluateAdRules([a], new Map());
  const al = r.decisions.filter((d) => d.ruleKey === "spotify_per_click_low");
  assert.equal(al.length, 1);
});

// ── presupuesto ─────────────────────────────────────────────────────────────
function adset(id: string, budget: number | null, costs: number[]): AdSetBudgetInput {
  const days = ["2026-09-14", "2026-09-15", "2026-09-16"];
  return {
    adsetId: id, adsetName: id, dailyBudgetClp: budget,
    costPerSpotifyByDay: new Map(days.map((d, i) => [d, costs[i]])),
  };
}
const DAYS = ["2026-09-14", "2026-09-15", "2026-09-16"];

test("sin presupuesto por conjunto (CBO) -> alerta, no mueve nada", () => {
  const sets = [adset("s1", null, [100, 100, 100]), adset("s2", null, [200, 200, 200])];
  const ds = evaluateBudgetRules(sets, DAYS, null);
  assert.equal(ds.filter((d) => d.ruleKey === "no_adset_budgets").length, 1);
  assert.equal(ds.filter((d) => d.action === "budget_up").length, 0);
});

test("ganador < 70% del perdedor por 3 días -> mueve, neto-cero, clamp +20%", () => {
  // ganador s1 costo 60 vs perdedor s2 costo 100 los 3 días (60 < 70).
  const sets = [adset("s1", 10000, [60, 60, 60]), adset("s2", 10000, [100, 100, 100])];
  const ds = evaluateBudgetRules(sets, DAYS, null);
  const up = ds.find((d) => d.action === "budget_up");
  const down = ds.find((d) => d.action === "budget_down");
  assert.ok(up && down, "debe subir el ganador y bajar el perdedor");
  // move = min(20% de 10000 perdedor, 20% de 10000 ganador) = 2000.
  assert.equal((up!.after as { dailyBudgetClp: number }).dailyBudgetClp, 12000);
  assert.equal((down!.after as { dailyBudgetClp: number }).dailyBudgetClp, 8000);
  assert.equal(up!.adsetId, "s1");
  assert.equal(down!.adsetId, "s2");
});

test("no escala si el ganador no bate al perdedor TODOS los días", () => {
  const sets = [adset("s1", 10000, [60, 90, 60]), adset("s2", 10000, [100, 100, 100])]; // día 2: 90 no < 70
  const ds = evaluateBudgetRules(sets, DAYS, null);
  assert.equal(ds.filter((d) => d.action === "budget_up").length, 0);
});

test("no escala con menos de 3 días de datos", () => {
  const sets = [adset("s1", 10000, [60, 60, 60]), adset("s2", 10000, [100, 100, 100])];
  const ds = evaluateBudgetRules(sets, DAYS.slice(0, 2), null);
  assert.equal(ds.filter((d) => d.action === "budget_up").length, 0);
});

test("clamp: mover no supera el 20% del presupuesto del ganador", () => {
  // perdedor con presupuesto enorme: 20% suyo (4000) > 20% del ganador (400).
  const sets = [adset("s1", 2000, [60, 60, 60]), adset("s2", 20000, [100, 100, 100])];
  const ds = evaluateBudgetRules(sets, DAYS, null);
  const up = ds.find((d) => d.action === "budget_up")!;
  // move clamp a 20% de 2000 = 400.
  assert.equal((up.after as { dailyBudgetClp: number }).dailyBudgetClp, 2400);
});

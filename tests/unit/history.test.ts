import { describe, expect, it } from "vitest";
import { aggregateMonth, FULL_VOLUME_SINCE, median, type DayBlock } from "@/lib/market/history";
import { checkHistory, historyExclusion } from "@/lib/analysis/history-check";
import { buildCandidate, type ScannerContext } from "@/lib/analysis/scanner";
import { topBuys } from "@/lib/analysis/top";
import type { BlockAgg, DayAgg, ItemMeta, MarketRow, MonthAgg } from "@/lib/market/types";

/** Kontrollierte Testdaten (keine echten Marktwerte). */
const NOW = 1_793_000_000;
const DAY0 = Math.floor(NOW / 86_400) * 86_400 - 30 * 86_400;

const blockFor = (mid: number, vol = 5_000, spread = 100): BlockAgg => ({ avgHigh: mid + spread / 2, avgLow: mid - spread / 2, volHigh: vol, volLow: vol });
const days = (mids: Array<number | null>, vol?: (i: number) => number): DayBlock[] =>
  mids.map((m, i) => ({ timestamp: DAY0 + i * 86_400, map: new Map(m == null ? [] : [[1, blockFor(m, vol?.(i))]]) }));

const hist = (o: Partial<MonthAgg> = {}): MonthAgg => ({
  days: 30, median30: 1_050, median7: 1_050, noise: 0.01, dailyVol: 0.01, trend7: 0, change30: 0, spikeDays: 0, spread: 100, volWeaker: 5_000, min: 1_000, max: 1_100, ...o,
});
const day = (o: Partial<DayAgg> = {}): DayAgg => ({ avgHigh: 1_100, avgLow: 1_000, volHigh: 5_000, volLow: 5_000, activeBlocks: 24, bothSidedBlocks: 24, cv: 0.005, minAvg: 1_000, maxAvg: 1_100, firstAvg: 1_050, lastAvg: 1_050, avgSpread: 100, cvRecent: 0.004, cvPrior: 0.005, ...o });
const row = (o: Partial<MarketRow> = {}): MarketRow => ({ id: 1, high: 1_100, highTime: NOW - 60, low: 1_000, lowTime: NOW - 60, m5: null, h1: { avgHigh: 1_100, avgLow: 1_000, volHigh: 200, volLow: 200 }, d1: day(), ...o });
const meta = (o: Partial<ItemMeta> = {}): ItemMeta => ({ id: 1, name: "A", examine: "", members: true, limit: 10_000, value: 1, highalch: 1, icon: "", ...o });
const ctx: ScannerContext = { nowSec: NOW, capital: 5_000_000, priceOffset: 1, thresholds: { freshMinutes: 10, staleMinutes: 60 }, dayBlocksLoaded: 24 };
const withHist = (h: MonthAgg | null): ScannerContext => ({ ...ctx, history: h ? { "1": h } : {} });

describe("30-Tage-Grundlinie (Aggregation)", () => {
  it("Median, Lücken, Ausreisser-Tage und Volumen erst ab Jagex-Daten", () => {
    const mids: Array<number | null> = Array.from({ length: 30 }, () => 1_000);
    mids[5] = null;
    mids[10] = 1_300; // einzelner Ausreisser-Tag
    const agg = aggregateMonth(days(mids, (i) => (DAY0 + i * 86_400 >= FULL_VOLUME_SINCE ? 4_000 : 100))).get(1)!;
    expect(agg.days).toBe(29);
    expect(agg.median30).toBe(1_000);
    expect(agg.spikeDays).toBe(1);
    expect(agg.trend7).toBe(0);
    expect(agg.noise).toBe(0.01); // Untergrenze 1 %
    expect(agg.volWeaker).toBe(4_000);
    expect(agg.spread).toBe(100);
    expect(agg.max).toBe(1_300);
  });
  it("Abwärtstrend: −3 % pro Tag", () => {
    const agg = aggregateMonth(days(Array.from({ length: 30 }, (_, i) => 10_000 * 0.97 ** i))).get(1)!;
    expect(agg.trend7).toBeCloseTo(Math.log(0.97), 3);
    expect(agg.change30).toBeCloseTo(0.97 ** 29 - 1, 3);
    expect(agg.dailyVol).toBeCloseTo(0, 4);
  });
  it("Median gerade/ungerade, leer", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("30-Tage-Abgleich", () => {
  const cur = { mid: 1_050, spread: 100, buy: 1_001, volWeaker24h: 5_000 };
  it("normales Item: keine Warnungen, Faktor 1", () => {
    const hc = checkHistory(hist(), cur);
    expect(hc).toMatchObject({ spike: false, recurringSpikes: false, downtrend: false, erratic: false, thin: false, wideSpread: false, driftCost: 0, factor: 1, marginCap: 200 });
    expect(historyExclusion(hc)).toBeNull();
  });
  it("Preisspitze über dem 7-Tage-Niveau", () => {
    const hc = checkHistory(hist(), { ...cur, mid: 1_150 });
    expect(hc.spike).toBe(true);
    expect(hc.deviation).toBeCloseTo(100 / 1_050, 5);
    expect(historyExclusion(hc)).toBe("spike");
  });
  it("stetiger Aufwärtstrend ist keine Spitze (7-Tage-Niveau wird fortgeschrieben, max. +2 %/Tag)", () => {
    // +1,2 %/Tag: 7-Tage-Median hinkt ~4 % hinterher
    expect(checkHistory(hist({ trend7: 0.012 }), { ...cur, mid: 1_050 * 1.045 }).spike).toBe(false);
    expect(checkHistory(hist({ trend7: 0 }), { ...cur, mid: 1_050 * 1.045 }).spike).toBe(true);
    // Steiler Trend rechtfertigt keine grosse Spitze
    expect(checkHistory(hist({ trend7: 0.1 }), { ...cur, mid: 1_050 * 1.2 }).spike).toBe(true);
  });
  it("wiederkehrende Spitzen: ausgeschlossen erst wenn gerade erhöht", () => {
    expect(historyExclusion(checkHistory(hist({ spikeDays: 4 }), cur))).toBeNull();
    expect(historyExclusion(checkHistory(hist({ spikeDays: 4 }), { ...cur, mid: 1_070 }))).toBe("spike");
  });
  it("Abwärtstrend kostet Marge, Absturz und Sprunghaftigkeit schliessen aus, wenig Historie auch", () => {
    const down = checkHistory(hist({ trend7: -0.02 }), cur);
    expect(down.driftCost).toBe(Math.ceil(0.02 * 0.5 * 1_001));
    expect(historyExclusion(down)).toBeNull();
    expect(historyExclusion(checkHistory(hist({ trend7: -0.06 }), cur))).toBe("crash");
    expect(historyExclusion(checkHistory(hist({ dailyVol: 0.3 }), cur))).toBe("erratic");
    expect(historyExclusion(checkHistory(hist({ days: 10 }), cur))).toBe("thin");
    expect(historyExclusion(checkHistory(null, cur))).toBe("thin");
  });
  it("Volumen: kleineres aus 24 h und normalem Tag", () => {
    const hc = checkHistory(hist({ volWeaker: 1_000 }), cur);
    expect(hc.volWeakerTypical).toBe(1_000);
    expect(hc.volumeBurst).toBe(true);
    expect(checkHistory(hist({ volWeaker: 9_000 }), cur).volWeakerTypical).toBe(5_000);
  });
});

describe("Scanner & Top 10 mit 30-Tage-Grundlinie", () => {
  it("ohne geladene Grundlinie unverändert", () => {
    const a = buildCandidate(meta(), row(), ctx);
    const b = buildCandidate(meta(), row(), withHist(hist()));
    expect(a.histCheck).toBeNull();
    expect(b.netMarginConservative).toBe(a.netMarginConservative);
  });
  it("zu breiter Spread wird auf 2 × normalen Tagesspread begrenzt", () => {
    const c = buildCandidate(meta(), row(), withHist(hist({ spread: 30 })));
    // Kauf 1'001, Verkauf höchstens 1'001 + 60 = 1'061, Steuer 21
    expect(c.netMarginConservative).toBe(1_061 - 21 - 1_001);
    expect(c.histCheck?.wideSpread).toBe(true);
    expect(c.reasons.some((r) => r.text.startsWith("Spread unusually wide"))).toBe(true);
  });
  it("Abwärtstrend reduziert die konservative Marge und den Score", () => {
    const flat = buildCandidate(meta(), row(), withHist(hist()));
    const down = buildCandidate(meta(), row(), withHist(hist({ trend7: -0.02 })));
    expect(down.netMarginConservative).toBe((flat.netMarginConservative ?? 0) - 11);
    expect(down.score).toBeLessThan(flat.score);
  });
  it("Top 10: Preisspitze ausgeschlossen, Menge nach normalem Tagesvolumen", () => {
    const spiking = buildCandidate(meta({ id: 1 }), row({ id: 1 }), { ...ctx, history: { "1": hist({ median7: 900, median30: 900 }) } });
    const busy = buildCandidate(meta({ id: 2, name: "B" }), row({ id: 2 }), { ...ctx, history: { "2": hist({ volWeaker: 1_000 }) } });
    const r = topBuys([spiking, busy], { minVolume24h: 500, minCoverage: 10, sort: "profit" });
    expect(r.excluded.history).toBe(1);
    expect(r.picks.map((p) => p.c.id)).toEqual([2]);
    expect(r.picks[0]!.qty).toBe(100); // ⌊1'000 ÷ 10⌋ statt ⌊5'000 ÷ 10⌋
    expect(r.picks[0]!.volumeWeaker).toBe(1_000);
  });
  it("Tab Volatile: nur vom 30-Tage-Abgleich ausgeschlossene Items, mit Grund", () => {
    const spiking = buildCandidate(meta({ id: 1 }), row({ id: 1 }), { ...ctx, history: { "1": hist({ median7: 900, median30: 900 }) } });
    const normal = buildCandidate(meta({ id: 2, name: "B" }), row({ id: 2 }), { ...ctx, history: { "2": hist() } });
    const r = topBuys([spiking, normal], { minVolume24h: 500, minCoverage: 10, sort: "profit", history: "only" });
    expect(r.picks.map((p) => [p.c.id, p.flag])).toEqual([[1, "spike"]]);
    expect(r.excluded.history).toBe(1);
    // Ohne Grundlinie ist nichts markiert
    expect(topBuys([buildCandidate(meta(), row(), ctx)], { minVolume24h: 500, minCoverage: 10, sort: "profit", history: "only" }).picks).toEqual([]);
  });
});

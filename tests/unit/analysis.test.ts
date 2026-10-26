import { describe, expect, it } from "vitest";
import { assessQuality } from "@/lib/analysis/quality";
import { assessRisk } from "@/lib/analysis/risk";
import { applyFilters, buildCandidate, sortCandidates, type ScannerContext } from "@/lib/analysis/scanner";
import { computeIndicators, median } from "@/lib/analysis/indicators";
import { computeMetrics, detectAnomalies } from "@/lib/analysis/market-analysis";
import { categorize } from "@/lib/analysis/category";
import { buildIndex, searchItems } from "@/lib/search/search";
import { aggregateDay } from "@/lib/market/aggregate";
import type { BlockAgg, DayAgg, ItemMeta, MarketRow } from "@/lib/market/types";
import { DEFAULT_FILTERS } from "@/lib/storage/settings-schema";

const NOW = 1_800_000_000;
const T = { freshMinutes: 10, staleMinutes: 60 };

const day = (over: Partial<DayAgg> = {}): DayAgg => ({
  avgHigh: 1_100, avgLow: 1_000, volHigh: 5_000, volLow: 5_000, activeBlocks: 24, bothSidedBlocks: 24,
  cv: 0.005, minAvg: 1_000, maxAvg: 1_100, firstAvg: 1_050, lastAvg: 1_050, avgSpread: 100, cvRecent: 0.004, cvPrior: 0.005, ...over,
});

const row = (over: Partial<MarketRow> = {}): MarketRow => ({
  id: 4151, high: 1_100, highTime: NOW - 60, low: 1_000, lowTime: NOW - 90,
  m5: null, h1: { avgHigh: 1_100, avgLow: 1_000, volHigh: 200, volLow: 200 }, d1: day(), ...over,
});

const meta = (over: Partial<ItemMeta> = {}): ItemMeta => ({ id: 4151, name: "Abyssal whip", examine: "", members: true, limit: 70, value: 1, highalch: 1, icon: "Abyssal whip.png", ...over });

const ctx: ScannerContext = { nowSec: NOW, capital: 1_000_000, priceOffset: 1, thresholds: T, dayBlocksLoaded: 24 };

describe("Datenqualität", () => {
  it("frische, vollständige Daten → hoch", () => {
    const q = assessQuality(row(), NOW, T);
    expect(q.score).toBe(100);
    expect(q.label).toBe("hoch");
    expect(q.ageSec).toBe(90);
  });
  it("veraltete, einseitige Daten ohne Historie → unzureichend mit Hinweisen", () => {
    const q = assessQuality(row({ highTime: NOW - 7200, low: null, lowTime: null, h1: null, d1: null }), NOW, T);
    expect(q.score).toBeLessThan(25);
    expect(q.label).toBe("unzureichend");
    expect(q.notes.join(" ")).toMatch(/veraltet/);
    expect(q.notes.join(" ")).toMatch(/Instant-Sell/);
  });
  it("invertierter Spread ist nicht plausibel", () => {
    const q = assessQuality(row({ high: 900 }), NOW, T);
    expect(q.components.plausibility).toBe(0);
  });
  it("Schwellen sind konfigurierbar", () => {
    const r = row({ highTime: NOW - 1800, lowTime: NOW - 1800 });
    expect(assessQuality(r, NOW, { freshMinutes: 60, staleMinutes: 120 }).freshness).toBe(30);
    expect(assessQuality(r, NOW, { freshMinutes: 5, staleMinutes: 20 }).freshness).toBe(0);
  });
});

describe("Risiko", () => {
  it("stabiler, liquider Markt → niedrig", () => {
    const r = assessRisk(row(), 70, 100);
    expect(r.riskClass).toBe("niedrig");
    expect(r.coverage).toBeCloseTo(5000 / 70);
  });
  it("volatiler, illiquider Markt → hoch", () => {
    const r = assessRisk(row({ high: 1_300, d1: day({ cv: 0.08, volHigh: 10, volLow: 5 }) }), 70, 30);
    expect(r.riskClass).toBe("hoch");
  });
});

describe("Scanner", () => {
  it("berechnet Schätzwerte mit Offset, Steuer, Limit und Kapital", () => {
    const c = buildCandidate(meta(), row(), ctx);
    expect(c.estBuy).toBe(1_001);
    expect(c.estSell).toBe(1_099);
    expect(c.taxPerItem).toBe(21);
    expect(c.netMargin).toBe(1_099 - 21 - 1_001);
    expect(c.qtyByCapital).toBe(999);
    expect(c.qty).toBe(70); // Limit
    expect(c.capitalRequired).toBe(70 * 1_001);
    expect(c.profitAtCapital).toBe(70 * 77);
    expect(c.potentialPerLimit).toBe(70 * 77);
    expect(c.score).toBeGreaterThan(0);
  });
  it("fehlende Preisseite → keine Marge, Score 0, Grund angegeben", () => {
    const c = buildCandidate(meta(), row({ low: null, lowTime: null }), ctx);
    expect(c.netMargin).toBeNull();
    expect(c.score).toBe(0);
    expect(c.reasons[0]?.text).toMatch(/Preisseite fehlt/);
  });
  it("ohne bekanntes Limit wird nur das Kapital berücksichtigt", () => {
    const c = buildCandidate(meta({ limit: null }), row(), ctx);
    expect(c.qty).toBe(999);
    expect(c.potentialPerLimit).toBeNull();
  });
  it("Filter und deterministische Sortierung (Tiebreaker ID, null zuletzt)", () => {
    const a = buildCandidate(meta({ id: 2, name: "B" }), row({ id: 2 }), ctx);
    const b = buildCandidate(meta({ id: 1, name: "A" }), row({ id: 1 }), ctx);
    const c = buildCandidate(meta({ id: 3, name: "C" }), row({ id: 3, low: null, lowTime: null }), ctx);
    const sorted = sortCandidates([a, c, b], "roi");
    expect(sorted.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(applyFilters([a, b, c], { ...DEFAULT_FILTERS, minRoi: 0.01 }).map((x) => x.id).sort()).toEqual([1, 2]);
    expect(applyFilters([a, b, c], { ...DEFAULT_FILTERS, plausibleOnly: false, search: "c" }).map((x) => x.id)).toEqual([3]);
    expect(applyFilters([a, b, c], { ...DEFAULT_FILTERS, maxRisk: "niedrig", minQuality: 90 }).length).toBe(2);
  });
});

describe("Aggregation & Indikatoren", () => {
  it("aggregiert Stundenblöcke volumengewichtet ohne Interpolation", () => {
    const b = (h: number | null, l: number | null, vh: number, vl: number): Map<number, BlockAgg> => new Map([[1, { avgHigh: h, avgLow: l, volHigh: vh, volLow: vl }]]);
    const d = aggregateDay([b(110, 100, 1, 3), new Map(), b(120, null, 1, 0)]).get(1)!;
    expect(d.activeBlocks).toBe(2);
    expect(d.bothSidedBlocks).toBe(1);
    expect(d.avgHigh).toBe(115);
    expect(d.avgLow).toBe(100);
    expect(d.cv).toBeNull(); // < 6 Blöcke
  });
  it("Indikatoren aus Zeitreihe; unzureichende Daten markiert", () => {
    const pts = Array.from({ length: 12 }, (_, i) => ({ timestamp: i, avgHighPrice: 100 + i, avgLowPrice: 100 + i, highPriceVolume: 1, lowPriceVolume: 1 }));
    pts.push({ timestamp: 99, avgHighPrice: null, avgLowPrice: null, highPriceVolume: 0, lowPriceVolume: 0 } as never);
    const ind = computeIndicators(pts);
    expect(ind.pointsWithData).toBe(12);
    expect(ind.gaps).toBe(1);
    expect(ind.change).toBeCloseTo(0.11);
    expect(ind.median).toBe(105.5);
    expect(ind.sufficient).toBe(true);
    expect(computeIndicators(pts.slice(0, 3)).volatility).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
  });
});

describe("Anomalien", () => {
  it("erkennt starke Preisänderung und Aktivitätsanstieg, ignoriert dünn gehandelte Items", () => {
    const items = [meta(), meta({ id: 2, name: "Thin" })];
    const rows = [
      row({ h1: { avgHigh: 1_300, avgLow: 1_250, volHigh: 2_000, volLow: 2_000 } }),
      row({ id: 2, d1: day({ activeBlocks: 3 }), h1: { avgHigh: 5_000, avgLow: 5_000, volHigh: 1, volLow: 1 } }),
    ];
    const a = detectAnomalies(computeMetrics(items, rows));
    const kinds = a.map((x) => x.kind);
    expect(kinds).toContain("price_move");
    expect(kinds).toContain("activity_high");
    expect(a.every((x) => x.id === 4151)).toBe(true);
  });
});

describe("Kategorien & Suche", () => {
  it("heuristische Kategorien", () => {
    expect(categorize("Nature rune")).toBe("Runen");
    expect(categorize("Prayer potion(4)")).toBe("Tränke");
    expect(categorize("Ranarr seed")).toBe("Samen");
    expect(categorize("Grimy ranarr weed")).toBe("Kräuter");
    expect(categorize("Varrock teleport (tablet)")).toBe("Teleport");
    expect(categorize("Old school bond")).toBe("Sonstiges");
  });
  it("Suche nach Name, Teilstring und ID mit Relevanz", () => {
    const idx = buildIndex([
      meta({ id: 4151, name: "Abyssal whip" }),
      meta({ id: 12006, name: "Abyssal tentacle" }),
      meta({ id: 4587, name: "Dragon scimitar" }),
      meta({ id: 11037, name: "Brine sabre" }),
    ]);
    expect(searchItems(idx, "abyss").map((i) => i.id)).toEqual([4151, 12006]);
    expect(searchItems(idx, "whip")[0]?.id).toBe(4151);
    expect(searchItems(idx, "4587")[0]?.name).toBe("Dragon scimitar");
    expect(searchItems(idx, "  SCIM ")[0]?.id).toBe(4587);
    expect(searchItems(idx, "")).toEqual([]);
  });
});

describe("Konservative Marge & Strategien", () => {
  it("einzelner Ausreisser-Trade: konservative Marge klein, Ranking niedriger, Hinweis vorhanden", () => {
    // letzter Instant-Sell 250, aber Ø 1h Instant-Sell 474 → Ausreisser
    const outlier = row({ id: 9341, high: 500, low: 250, h1: { avgHigh: 485, avgLow: 474, volHigh: 2000, volLow: 2000 }, d1: day({ avgHigh: 504, avgLow: 491, avgSpread: 11 }) });
    const c = buildCandidate(meta({ id: 9341, name: "Dragonstone bolts", limit: 11000 }), outlier, ctx);
    expect(c.netMargin).toBe(499 - 9 - 251);
    // konservativ: Verkauf min(499, 485−1=484), Kauf max(251, 474+1=475) → 484 − 9 − 475 = 0
    expect(c.netMarginConservative).toBe(0);
    expect(c.reasons.some((r) => /Ausreisser/.test(r.text))).toBe(true);
    const normal = buildCandidate(meta(), row(), ctx);
    expect(c.score).toBeLessThan(normal.score);
    // Standardfilter "nur plausible Margen" blendet ihn aus
    expect(applyFilters([c, normal], DEFAULT_FILTERS).map((x) => x.id)).toEqual([4151]);
    expect(applyFilters([c, normal], { ...DEFAULT_FILTERS, plausibleOnly: false })).toHaveLength(2);
  });

  it("Strategien berücksichtigen nur plausible, liquide Kandidaten und verteilen Kapital auf Slots", async () => {
    const { STRATEGIES, summarizeStrategy } = await import("@/lib/analysis/strategy");
    const good = buildCandidate(meta(), row(), ctx);
    const thin = buildCandidate(meta({ id: 2, name: "Thin" }), row({ id: 2, d1: day({ volHigh: 5, volLow: 5 }) }), ctx);
    const roi = summarizeStrategy(STRATEGIES[0]!, [good, thin], 1_000_000, 8);
    expect(roi.picks.map((p) => p.id)).toEqual([4151]);
    // 1 Pick → gesamtes Kapital, begrenzt durch Limit 70: 70 × min(77, konservativ 77)
    expect(roi.estProfitSplit).toBe(70 * 77);
  });
});

describe("Rate-Limit", () => {
  it("begrenzt pro Client und Zeitfenster", async () => {
    const { checkRateLimit, resetRateLimits, clientKey } = await import("@/lib/market/rate-limit");
    resetRateLimits();
    expect(clientKey(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    for (let i = 0; i < 3; i++) expect(checkRateLimit("a", 3, 1000).ok).toBe(true);
    expect(checkRateLimit("a", 3, 1000).ok).toBe(false);
    expect(checkRateLimit("b", 3, 1000).ok).toBe(true);
    expect(checkRateLimit("a", 3, 61_001).ok).toBe(true); // neues Fenster
  });
});

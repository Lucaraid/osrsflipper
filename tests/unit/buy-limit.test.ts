import { describe, expect, it } from "vitest";
import { buildCandidate, type ScannerContext } from "@/lib/analysis/scanner";
import { topBuys } from "@/lib/analysis/top";
import type { ItemMeta, MarketRow } from "@/lib/market/types";
import { BUY_LIMIT_WINDOW_MS, buyLimitUsage, limitLeft, limitUsed } from "@/lib/portfolio/buy-limit";
import type { Trade } from "@/lib/portfolio/schemas";

const H = 3_600_000;
const NOW = 1_800_000_000_000;

function trade(id: string, itemId: number, lots: [number, number][], offers: number[] = []): Trade {
  return {
    id, itemId, itemName: `Item ${itemId}`, createdAt: 0, updatedAt: 0, notes: "", history: [], sales: [],
    lots: lots.map(([date, quantity], i) => ({ id: `${id}l${i}`, date, quantity, price: 100, fees: 0 })),
    offers: offers.map((quantity, i) => ({ id: `${id}o${i}`, date: NOW, quantity, price: 100 })),
  };
}

describe("Kauflimit-Fenster (4 h ab erstem Kauf)", () => {
  it("zählt alle Käufe im Fenster ab dem ersten Kauf", () => {
    const u = buyLimitUsage([trade("a", 1, [[NOW - 3 * H, 20], [NOW - 1 * H, 30]])], NOW).get(1);
    expect(u).toMatchObject({ bought: 50, pending: 0, windowStart: NOW - 3 * H, resetsAt: NOW + 1 * H });
    expect(limitLeft(70, u)).toBe(20);
  });

  it("Fenster abgelaufen → nichts mehr verbraucht", () => {
    expect(buyLimitUsage([trade("a", 1, [[NOW - 5 * H, 70]])], NOW).size).toBe(0);
    // genau nach 4 h ist das Limit wieder frei
    expect(buyLimitUsage([trade("a", 1, [[NOW - BUY_LIMIT_WINDOW_MS, 70]])], NOW).size).toBe(0);
  });

  it("Kauf nach Ablauf startet ein neues Fenster (alte Käufe zählen nicht)", () => {
    const u = buyLimitUsage([trade("a", 1, [[NOW - 6 * H, 70], [NOW - 1 * H, 10]])], NOW).get(1);
    expect(u).toMatchObject({ bought: 10, windowStart: NOW - 1 * H, resetsAt: NOW + 3 * H });
  });

  it("Fenster startet beim ersten Kauf, nicht beim letzten", () => {
    // Fenster 1: −5 h bis −1 h (enthält den Kauf vor 3.5 h). Der Kauf vor 0.5 h startet Fenster 2.
    // Würde das Fenster am letzten Kauf hängen, zählten 7 + 9.
    const u = buyLimitUsage([trade("a", 1, [[NOW - 5 * H, 5], [NOW - 3.5 * H, 7], [NOW - 0.5 * H, 9]])], NOW).get(1);
    expect(u).toMatchObject({ bought: 9, windowStart: NOW - 0.5 * H });
    // Alle Käufe im selben, bereits abgelaufenen Fenster → frei
    expect(buyLimitUsage([trade("a", 1, [[NOW - 4.5 * H, 5], [NOW - 3 * H, 7], [NOW - 1 * H, 9]])], NOW).size).toBe(0);
  });

  it("fasst mehrere Trades desselben Items zusammen, Items getrennt", () => {
    const m = buyLimitUsage([trade("a", 1, [[NOW - 2 * H, 20]]), trade("b", 1, [[NOW - 3 * H, 15]]), trade("c", 2, [[NOW - 1 * H, 4]])], NOW);
    expect(m.get(1)).toMatchObject({ bought: 35, windowStart: NOW - 3 * H });
    expect(m.get(2)?.bought).toBe(4);
  });

  it("offene Kaufangebote zählen mit, auch ohne Fenster", () => {
    const u = buyLimitUsage([trade("a", 1, [], [25])], NOW).get(1);
    expect(u).toMatchObject({ bought: 0, pending: 25, windowStart: null, resetsAt: null });
    expect(limitUsed(u)).toBe(25);
    expect(limitLeft(20, u)).toBe(0);
  });

  it("Käufe in der Zukunft (Tippfehler) zählen noch nicht", () => {
    expect(buyLimitUsage([trade("a", 1, [[NOW + H, 10]])], NOW).size).toBe(0);
  });

  it("unbekanntes Limit → null", () => {
    expect(limitLeft(null, undefined)).toBeNull();
    expect(limitLeft(70, undefined)).toBe(70);
  });
});

describe("Kauflimit im Scanner und in den Top 10", () => {
  const NOW_SEC = 1_800_000_000;
  const meta: ItemMeta = { id: 4151, name: "Abyssal whip", examine: "", members: true, limit: 70, value: 1, highalch: 1, icon: "Abyssal whip.png" };
  const row: MarketRow = {
    id: 4151, high: 1_100, highTime: NOW_SEC - 60, low: 1_000, lowTime: NOW_SEC - 90, m5: null,
    h1: { avgHigh: 1_100, avgLow: 1_000, volHigh: 200, volLow: 200 },
    d1: { avgHigh: 1_100, avgLow: 1_000, volHigh: 5_000, volLow: 5_000, activeBlocks: 24, bothSidedBlocks: 24, cv: 0.005, minAvg: 1_000, maxAvg: 1_100, firstAvg: 1_050, lastAvg: 1_050, avgSpread: 100, cvRecent: 0.004, cvPrior: 0.005 },
  };
  const ctx = (used?: number): ScannerContext => ({
    nowSec: NOW_SEC, capital: 1_000_000, priceOffset: 1, thresholds: { freshMinutes: 10, staleMinutes: 60 }, dayBlocksLoaded: 24,
    limitUsed: used != null ? new Map([[4151, used]]) : undefined,
  });

  it("Menge wird auf das Restlimit begrenzt", () => {
    expect(buildCandidate(meta, row, ctx()).qty).toBe(70);
    const c = buildCandidate(meta, row, ctx(50));
    expect(c).toMatchObject({ qty: 20, limitUsed: 50, limitLeft: 20 });
    expect(c.potentialPerLimit).toBe(70 * c.netMargin!); // Potenzial bleibt pro volles Limit
    expect(c.reasons.map((r) => r.text).join(" ")).toMatch(/20 of 70 left/);
  });

  it("aufgebrauchtes Limit → Menge 0, Grund, in Top 10 ausgeschlossen", () => {
    const c = buildCandidate(meta, row, ctx(80));
    expect(c).toMatchObject({ qty: 0, limitLeft: 0 });
    expect(c.reasons.map((r) => r.text).join(" ")).toMatch(/Buy limit used up/);
    const r = topBuys([c], { minVolume24h: 100, minCoverage: 1, sort: "profit" });
    expect(r.picks).toHaveLength(0);
    expect(r.excluded.limitUsedUp).toBe(1);
  });

  it("Top 10 rechnet mit der reduzierten Menge", () => {
    const r = topBuys([buildCandidate(meta, row, ctx(60))], { minVolume24h: 100, minCoverage: 1, sort: "profit" });
    expect(r.picks[0]?.qty).toBe(10);
  });
});

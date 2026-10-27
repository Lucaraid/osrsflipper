import { describe, expect, it } from "vitest";
import { computeFifo, estimateOpenSale, investedInOpenFlips, recommendedSellPrice, validateTrade } from "@/lib/portfolio/fifo";
import { checkPositionRules, computePortfolio, computeTimeline } from "@/lib/portfolio/portfolio";
import type { CapitalEvent, Trade } from "@/lib/portfolio/schemas";

const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 1);

function trade(partial: Partial<Trade> & Pick<Trade, "lots" | "sales">): Trade {
  return { id: "t1", itemId: 4151, itemName: "Abyssal whip", createdAt: T0, updatedAt: T0, offers: [], notes: "", history: [], ...partial };
}

describe("FIFO-Einstandskosten", () => {
  it("Teilverkauf über mehrere Kaufchargen mit unterschiedlichen Preisen", () => {
    const t = trade({
      lots: [
        { id: "a", date: T0, quantity: 10, price: 1_000, fees: 0 },
        { id: "b", date: T0 + H, quantity: 10, price: 1_200, fees: 0 },
      ],
      sales: [{ id: "s1", date: T0 + 2 * H, quantity: 15, price: 1_500, tax: null, fees: 0 }],
    });
    const s = computeFifo(t);
    // Einstand: 10×1000 + 5×1200 = 16'000; Erlös 15×1500 − 15×30 = 22'050
    expect(s.sales[0]?.costBasis).toBe(16_000);
    expect(s.sales[0]?.proceedsNet).toBe(22_050);
    expect(s.realized).toBe(6_050);
    expect(s.openQty).toBe(5);
    expect(s.openCostBasis).toBe(6_000);
    expect(s.status).toBe("teilweise");
    expect(s.avgBuyPrice).toBe(1_100);
    // Haltedauer gewichtet: 10×2h + 5×1h = 25h / 15
    expect(s.avgHoldMs).toBeCloseTo((25 / 15) * H, 5);
  });

  it("verteilt Kaufgebühren auf die Stücke und nutzt tatsächliche Steuer", () => {
    const t = trade({
      lots: [{ id: "a", date: T0, quantity: 4, price: 100, fees: 20 }],
      sales: [{ id: "s", date: T0 + H, quantity: 4, price: 150, tax: 10, fees: 0 }],
    });
    const s = computeFifo(t);
    expect(s.sales[0]?.costBasis).toBe(420);
    expect(s.realized).toBe(600 - 10 - 420);
    expect(s.status).toBe("geschlossen");
  });

  it("verhindert Doppelzählung bei Überverkauf", () => {
    const t = trade({
      lots: [{ id: "a", date: T0, quantity: 5, price: 1_000, fees: 0 }],
      sales: [
        { id: "s1", date: T0 + H, quantity: 5, price: 1_100, tax: null, fees: 0 },
        { id: "s2", date: T0 + 2 * H, quantity: 5, price: 1_100, tax: null, fees: 0 },
      ],
    });
    const s = computeFifo(t);
    expect(s.errors).toHaveLength(1);
    expect(s.sales[1]?.matchedQuantity).toBe(0);
    expect(s.sales[1]?.realized).toBe(0);
    expect(s.realized).toBe(5 * (1_100 - 22 - 1_000));
    expect(validateTrade(t)).toHaveLength(1);
  });

  it("ein Verkauf vor dem Kaufdatum gilt als Fehler", () => {
    const t = trade({
      lots: [{ id: "a", date: T0 + H, quantity: 1, price: 10, fees: 0 }],
      sales: [{ id: "s", date: T0, quantity: 1, price: 20, tax: null, fees: 0 }],
    });
    expect(validateTrade(t)).toHaveLength(1);
  });
});

describe("Investiert in offenen Flips", () => {
  it("summiert den FIFO-Einstand offener Stücke, geschlossene Flips zählen nicht", () => {
    const partly = trade({
      id: "p",
      lots: [
        { id: "a", date: T0, quantity: 10, price: 1_000, fees: 0 },
        { id: "b", date: T0 + H, quantity: 10, price: 1_200, fees: 0 },
      ],
      sales: [{ id: "s1", date: T0 + 2 * H, quantity: 15, price: 1_500, tax: null, fees: 0 }],
    });
    const closed = trade({
      id: "c",
      lots: [{ id: "c1", date: T0, quantity: 5, price: 500, fees: 0 }],
      sales: [{ id: "c2", date: T0 + H, quantity: 5, price: 600, tax: null, fees: 0 }],
    });
    const fresh = trade({ id: "f", lots: [{ id: "f1", date: T0, quantity: 3, price: 2_000, fees: 0 }], sales: [] });
    const r = investedInOpenFlips([partly, closed, fresh].map(computeFifo));
    // 5 × 1200 (restliche Charge b) + 3 × 2000
    expect(r.invested).toBe(12_000);
    expect(r.openFlips).toBe(2);
    expect(r.pending).toBe(0);
    expect(r.total).toBe(12_000);
    expect(investedInOpenFlips([])).toEqual({ invested: 0, openFlips: 0, pending: 0, pendingFlips: 0, total: 0 });
  });

  it("offene Kaufangebote (auch leere Flips) zählen als „not bought yet“ und zum GE-Total", () => {
    const empty = trade({ id: "e", lots: [], sales: [], offers: [{ id: "o1", date: T0, quantity: 100, price: 250 }] });
    const mixed = trade({ id: "m", lots: [{ id: "m1", date: T0, quantity: 2, price: 1_000, fees: 0 }], sales: [], offers: [{ id: "o2", date: T0, quantity: 3, price: 900 }] });
    const r = investedInOpenFlips([empty, mixed].map(computeFifo));
    expect(r.invested).toBe(2_000);
    expect(r.openFlips).toBe(1);
    // 100 × 250 + 3 × 900
    expect(r.pending).toBe(27_700);
    expect(r.pendingFlips).toBe(2);
    expect(r.total).toBe(29_700);
  });
});

describe("Empfohlener Verkaufspreis", () => {
  it("letzter Instant-Buy minus Offset, nie unter 1 gp, ohne Preis null", () => {
    expect(recommendedSellPrice(1_100, 1)).toBe(1_099);
    expect(recommendedSellPrice(1, 5)).toBe(1);
    expect(recommendedSellPrice(null, 1)).toBeNull();
  });
  it("geschätzter Gewinn für die offenen Stücke nach Steuer (FIFO-Einstand)", () => {
    const t = trade({
      lots: [
        { id: "a", date: T0, quantity: 10, price: 1_000, fees: 0 },
        { id: "b", date: T0 + H, quantity: 10, price: 1_200, fees: 0 },
      ],
      sales: [{ id: "s1", date: T0 + 2 * H, quantity: 15, price: 1_500, tax: null, fees: 0 }],
    });
    const s = computeFifo(t);
    // offen: 5 × 1200 = 6000; Verkauf 5 × 1300 = 6500 − 5 × 26 Steuer = 6370 → +370
    expect(estimateOpenSale(s, 1_300)).toEqual({ profit: 370, tax: 130 });
    // geschlossener Trade → null
    const closed = computeFifo(trade({ lots: [{ id: "c", date: T0, quantity: 1, price: 100, fees: 0 }], sales: [{ id: "d", date: T0 + H, quantity: 1, price: 120, tax: null, fees: 0 }] }));
    expect(estimateOpenSale(closed, 200)).toBeNull();
  });
});

describe("Portfolio ohne Doppelzählung", () => {
  const events: CapitalEvent[] = [{ id: "c", date: T0 - H, amount: 100_000, kind: "deposit", note: "" }];
  const t = trade({
    lots: [{ id: "a", date: T0, quantity: 20, price: 1_000, fees: 0 }],
    sales: [{ id: "s", date: T0 + H, quantity: 10, price: 1_200, tax: null, fees: 0 }],
    offers: [{ id: "o", date: T0 + 2 * H, quantity: 5, price: 900 }],
  });

  it("Cash, Reserve, gebundenes Kapital und Gesamtwert", () => {
    const p = computePortfolio([t], events, () => ({ low: 1_100, high: 1_150 }));
    // Cash = 100'000 − 20'000 + (12'000 − 240) = 91'760
    expect(p.cash).toBe(91_760);
    expect(p.reserved).toBe(4_500);
    expect(p.available).toBe(87_260);
    expect(p.bound).toBe(10_000);
    // Marktwert = 10 × (1100 − 22) = 10'780
    expect(p.marketValueOpen).toBe(10_780);
    expect(p.totalValue).toBe(91_760 + 10_780);
    expect(p.unrealized).toBe(780);
    expect(p.realized).toBe(1_760);
    expect(p.roi).toBeCloseTo(0.176, 10);
    expect(p.openTrades).toBe(1);
    // Konsistenz: Gesamtwert = Einzahlungen + realisiert + unrealisiert
    expect(p.totalValue).toBe(p.capitalIn + p.realized + p.unrealized);
  });

  it("bewertet Positionen ohne Marktpreis zum Einstand (keine erfundenen Preise)", () => {
    const p = computePortfolio([t], events, () => null);
    expect(p.unpricedPositions).toBe(1);
    expect(p.marketValueOpen).toBe(10_000);
    expect(p.unrealized).toBe(0);
  });

  it("Erfolgsquote und Durchschnittsgewinn geschlossener Flips", () => {
    const win = trade({ id: "w", lots: [{ id: "a", date: T0, quantity: 1, price: 100, fees: 0 }], sales: [{ id: "s", date: T0 + H, quantity: 1, price: 200, tax: null, fees: 0 }] });
    const loss = trade({ id: "l", lots: [{ id: "a", date: T0, quantity: 1, price: 200, fees: 0 }], sales: [{ id: "s", date: T0 + H, quantity: 1, price: 150, tax: null, fees: 0 }] });
    const p = computePortfolio([win, loss], [], () => null);
    expect(p.closedTrades).toBe(2);
    expect(p.winRate).toBe(0.5);
    expect(p.avgProfitClosed).toBe(((200 - 4 - 100) + (150 - 3 - 200)) / 2);
  });

  it("Zeitreihe aus Transaktionen: Buchwert steigt nur um realisierte Gewinne", () => {
    const tl = computeTimeline([t], events);
    expect(tl.map((p) => p.bookValue)).toEqual([100_000, 100_000, 101_760]);
    expect(tl[tl.length - 1]?.cash).toBe(91_760);
  });

  it("Positionsregeln erzeugen Warnungen", () => {
    const p = computePortfolio([t], events, () => ({ low: 1_100, high: 1_150 }));
    const w = checkPositionRules(p, { maxCapitalPerItem: 5_000, maxPositionPct: 0.05, maxOpenPositions: 0, minReserve: 95_000 }, 1, 2);
    expect(w.map((x) => x.rule).sort()).toEqual(["geSlots", "maxCapitalPerItem", "maxOpenPositions", "maxPositionPct", "minReserve"]);
  });
});

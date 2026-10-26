import { describe, expect, it } from "vitest";
import { breakEvenSellPrice, calculateFlip, maxBuyPriceForProfit, maxQuantity, MAX_GE_PRICE } from "@/lib/calc/profit";

describe("calculateFlip", () => {
  it("profitabler Trade", () => {
    // Kauf 1000, Verkauf 1100, 10 Stück: Steuer 22/Stk → 220; netto 11000-220-10000 = 780
    const r = calculateFlip({ itemId: 4151, buyPrice: 1000, sellPrice: 1100, quantity: 10 });
    expect(r.ok).toBe(true);
    expect(r.purchaseCost).toBe(10_000);
    expect(r.revenueGross).toBe(11_000);
    expect(r.taxPerItem).toBe(22);
    expect(r.taxTotal).toBe(220);
    expect(r.grossProfit).toBe(1_000);
    expect(r.netProfit).toBe(780);
    expect(r.roi).toBeCloseTo(0.078, 10);
  });

  it("Verlusttrade", () => {
    // Kauf 1000, Verkauf 1010: Steuer 20 → netto 990 − 1000 = −10 pro Stück
    const r = calculateFlip({ buyPrice: 1000, sellPrice: 1010, quantity: 5 });
    expect(r.netProfit).toBe(-50);
    expect(r.grossProfit).toBe(50);
    expect(r.roi).toBeCloseTo(-0.01, 10);
  });

  it("Break-even genau getroffen", () => {
    // Kosten 980/Stk → Verkauf 1000: 1000 − 20 = 980 → 0 Gewinn
    const r = calculateFlip({ buyPrice: 980, sellPrice: 1000, quantity: 7 });
    expect(r.netProfit).toBe(0);
    // kleinster Preis ohne Verlust ist 999: 999 − floor(19.98) = 980
    expect(r.breakEvenSellPrice).toBe(999);
  });

  it("unterschiedliche Stückzahlen skalieren linear", () => {
    const one = calculateFlip({ buyPrice: 5_000, sellPrice: 5_400, quantity: 1 });
    const many = calculateFlip({ buyPrice: 5_000, sellPrice: 5_400, quantity: 1_000 });
    expect(many.netProfit).toBe(one.netProfit * 1_000);
  });

  it("steuerbefreites Item", () => {
    const r = calculateFlip({ itemId: 13190, buyPrice: 9_000_000, sellPrice: 9_100_000, quantity: 2 });
    expect(r.taxTotal).toBe(0);
    expect(r.netProfit).toBe(200_000);
  });

  it("Steuergrenze 50 gp und Cap 5M", () => {
    expect(calculateFlip({ buyPrice: 40, sellPrice: 49, quantity: 100 }).netProfit).toBe(900);
    expect(calculateFlip({ buyPrice: 40, sellPrice: 50, quantity: 100 }).netProfit).toBe(900); // 50−1−40 = 9
    const cap = calculateFlip({ buyPrice: 290_000_000, sellPrice: 300_000_000, quantity: 1 });
    expect(cap.taxTotal).toBe(5_000_000);
    expect(cap.netProfit).toBe(5_000_000);
  });

  it("Rundung: Dezimal-Eingaben werden auf ganze gp abgeschnitten", () => {
    const r = calculateFlip({ buyPrice: 100.9, sellPrice: 150.7, quantity: 2.8 });
    expect(r.buyPrice).toBe(100);
    expect(r.sellPrice).toBe(150);
    expect(r.quantity).toBe(2);
    expect(r.taxPerItem).toBe(3);
    expect(r.netProfit).toBe((150 - 3 - 100) * 2);
  });

  it("fehlende Eingaben", () => {
    const r = calculateFlip({ buyPrice: null, sellPrice: undefined, quantity: null });
    expect(r.ok).toBe(false);
    expect(r.issues.filter((i) => i.code === "missing")).toHaveLength(3);
    expect(r.breakEvenSellPrice).toBeNull();
  });

  it("Extremwerte: Maximalpreis und ungültige Werte", () => {
    const r = calculateFlip({ buyPrice: MAX_GE_PRICE, sellPrice: MAX_GE_PRICE, quantity: 1 });
    expect(r.ok).toBe(true);
    expect(r.netProfit).toBe(-5_000_000);
    const bad = calculateFlip({ buyPrice: MAX_GE_PRICE + 1, sellPrice: 0, quantity: -1 });
    expect(bad.ok).toBe(false);
    expect(bad.issues.filter((i) => i.code === "invalid")).toHaveLength(3);
    // grosse Mengen bleiben exakt (unter 2^53)
    const big = calculateFlip({ buyPrice: 1_000_000, sellPrice: 1_100_000, quantity: 1_000_000 });
    expect(big.netProfit).toBe((1_100_000 - 22_000 - 1_000_000) * 1_000_000);
  });

  it("unzureichendes Kapital und Limit werden gemeldet, Berechnung bleibt gültig", () => {
    const r = calculateFlip({ buyPrice: 1_000, sellPrice: 1_100, quantity: 100, capital: 50_000, buyLimit: 70 });
    expect(r.ok).toBe(true);
    expect(r.issues).toContainEqual({ code: "insufficient_capital", required: 100_000, available: 50_000 });
    expect(r.issues).toContainEqual({ code: "exceeds_limit", quantity: 100, limit: 70 });
  });

  it("tatsächliche Steuer und sonstige Kosten werden berücksichtigt", () => {
    const r = calculateFlip({ buyPrice: 1_000, sellPrice: 1_100, quantity: 10, actualTax: 100, otherCosts: 50 });
    expect(r.taxIsActual).toBe(true);
    expect(r.capitalRequired).toBe(10_050);
    expect(r.netProfit).toBe(11_000 - 100 - 10_050);
  });
});

describe("breakEvenSellPrice", () => {
  it("berücksichtigt die abgerundete Steuer", () => {
    expect(breakEvenSellPrice(49)).toBe(49);
    expect(breakEvenSellPrice(49.5)).toBe(51); // 50 → 49 netto, 51 → 50 netto
    expect(breakEvenSellPrice(98)).toBe(99); // 99 − 1 = 98
    expect(breakEvenSellPrice(1_000, 13190)).toBe(1_000); // steuerfrei
  });
  it("ist null, wenn selbst der Maximalpreis nicht reicht", () => {
    expect(breakEvenSellPrice(MAX_GE_PRICE)).toBeNull();
  });
});

describe("maxBuyPriceForProfit / maxQuantity", () => {
  it("maximaler Einkaufspreis für Zielgewinn", () => {
    // Verkauf 1100 → netto 1078; Ziel 50 → max Kauf 1028
    expect(maxBuyPriceForProfit(1_100, 50)).toBe(1_028);
    expect(maxBuyPriceForProfit(10, 100)).toBeNull();
  });
  it("maximale Stückzahl nach Kapital und Limit", () => {
    expect(maxQuantity(10_000, 300)).toEqual({ byCapital: 33, byLimit: null, max: 33 });
    expect(maxQuantity(10_000, 300, 20)).toEqual({ byCapital: 33, byLimit: 20, max: 20 });
    expect(maxQuantity(0, 300).max).toBe(0);
  });
});

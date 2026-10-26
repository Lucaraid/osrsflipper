import { describe, expect, it } from "vitest";
import { netSellPerItem, taxPerItem, taxTotal } from "@/lib/tax/tax";
import { TAX_RULES, isTaxExempt } from "@/lib/tax/rules";

// Referenzwerte unabhängig von Hand berechnet: floor(preis × 2 / 100), max 5'000'000
describe("GE-Steuer pro Stück", () => {
  it.each([
    [1, 0],
    [49, 0], // < 50 gp → 0 (Abrundung)
    [50, 1], // Grenze: 50 × 0.02 = 1.0 (ohne Fliesskomma-Fehler)
    [99, 1],
    [100, 2],
    [149, 2],
    [150, 3],
    [1_000, 20],
    [1_234_567, 24_691],
    [249_999_999, 4_999_999],
    [250_000_000, 5_000_000], // Cap greift genau hier
    [300_000_000, 5_000_000],
    [2_147_483_647, 5_000_000],
  ])("Preis %i → Steuer %i", (price, expected) => {
    expect(taxPerItem(price, 4151)).toBe(expected);
  });

  it("ist 0 für steuerbefreite Items (Old school bond, Energy potion, Werkzeuge)", () => {
    expect(taxPerItem(9_000_000, 13190)).toBe(0);
    expect(taxPerItem(500, 3008)).toBe(0);
    expect(taxPerItem(100, 2347)).toBe(0);
    expect(isTaxExempt(13190)).toBe(true);
    expect(isTaxExempt(4151)).toBe(false);
  });

  it("ist 0 für ungültige Preise", () => {
    expect(taxPerItem(0)).toBe(0);
    expect(taxPerItem(-5)).toBe(0);
    expect(taxPerItem(Number.NaN)).toBe(0);
  });

  it("schneidet Nachkommastellen beim Preis ab", () => {
    expect(taxPerItem(50.9)).toBe(1);
    expect(taxPerItem(49.99)).toBe(0);
  });

  it("berechnet die Gesamtsteuer pro Stück (nicht auf den Gesamtbetrag)", () => {
    // 10 × 49 gp: pro Stück 0 → gesamt 0 (auf Gesamtbetrag 490 wären es 9)
    expect(taxTotal(49, 10)).toBe(0);
    expect(taxTotal(1_000, 3)).toBe(60);
    expect(taxTotal(300_000_000, 2)).toBe(10_000_000);
    expect(taxTotal(1_000, 0)).toBe(0);
  });

  it("Nettoerlös entspricht Preis minus Steuer; 49 und 50 liefern beide 49", () => {
    expect(netSellPerItem(49)).toBe(49);
    expect(netSellPerItem(50)).toBe(49);
    expect(netSellPerItem(99)).toBe(98);
    expect(netSellPerItem(100)).toBe(98);
  });

  it("Regeln sind zentral dokumentiert", () => {
    expect(TAX_RULES.rate).toBe(0.02);
    expect(TAX_RULES.capPerItem).toBe(5_000_000);
    expect(Object.keys(TAX_RULES.exemptItems)).toHaveLength(48);
  });
});

import { TAX_RULES, type TaxRules } from "../tax/rules";
import { netSellPerItem, taxPerItem } from "../tax/tax";

/** Höchster im GE eingebbarer Stückpreis (signed int32). */
export const MAX_GE_PRICE = 2_147_483_647;

export interface FlipInput {
  itemId?: number | null;
  buyPrice: number | null | undefined;
  sellPrice: number | null | undefined;
  quantity: number | null | undefined;
  /** Zusätzliche, bereits bezahlte Kosten (gesamt), z. B. sonstige Gebühren. */
  otherCosts?: number | null;
  /** Tatsächlich bezahlte Steuer (gesamt) – überschreibt die berechnete Steuer, z. B. aus eigenen Trades. */
  actualTax?: number | null;
  /** Verfügbares Kapital (optional) für Kapitalprüfung. */
  capital?: number | null;
  /** Bekanntes GE-Kauflimit (optional). */
  buyLimit?: number | null;
}

export type FlipIssue =
  | { code: "missing"; field: "buyPrice" | "sellPrice" | "quantity" }
  | { code: "invalid"; field: string; message: string }
  | { code: "insufficient_capital"; required: number; available: number }
  | { code: "exceeds_limit"; quantity: number; limit: number };

export interface FlipResult {
  ok: boolean;
  issues: FlipIssue[];
  buyPrice: number;
  sellPrice: number;
  quantity: number;
  /** Einkaufskosten (Kaufpreis × Stück) */
  purchaseCost: number;
  /** Kapitalbedarf inkl. sonstiger Kosten */
  capitalRequired: number;
  /** Verkaufsumsatz brutto */
  revenueGross: number;
  /** Steuer pro Stück (berechnet) */
  taxPerItem: number;
  /** Gesamte Steuer (berechnet oder tatsächlich) */
  taxTotal: number;
  taxIsActual: boolean;
  revenueNet: number;
  /** Bruttogewinn = Umsatz − Einkauf (vor Steuer & Kosten) */
  grossProfit: number;
  /** Nettogewinn = Umsatz − Steuer − Einkauf − sonstige Kosten */
  netProfit: number;
  netProfitPerItem: number;
  /** ROI auf den Kapitalbedarf (Anteil, 0.05 = 5 %); null wenn Kapitalbedarf 0 */
  roi: number | null;
  /** Kleinster ganzzahliger Verkaufspreis ohne Verlust (berechnete Steuer) */
  breakEvenSellPrice: number | null;
}

function toInt(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.floor(v);
}

/**
 * Zentrale Flip-Berechnung. Alle UI-Komponenten nutzen ausschliesslich diese Funktion.
 * Gibt auch bei ungültigen Eingaben ein vollständiges Ergebnis (mit ok=false und issues) zurück.
 */
export function calculateFlip(input: FlipInput, rules: TaxRules = TAX_RULES): FlipResult {
  const issues: FlipIssue[] = [];
  const buy = toInt(input.buyPrice);
  const sell = toInt(input.sellPrice);
  const qty = toInt(input.quantity);
  const otherCosts = toInt(input.otherCosts) ?? 0;
  const actualTax = toInt(input.actualTax);

  if (buy == null) issues.push({ code: "missing", field: "buyPrice" });
  if (sell == null) issues.push({ code: "missing", field: "sellPrice" });
  if (qty == null) issues.push({ code: "missing", field: "quantity" });
  if (buy != null && (buy < 1 || buy > MAX_GE_PRICE))
    issues.push({ code: "invalid", field: "buyPrice", message: `Buy price must be between 1 and ${MAX_GE_PRICE} gp.` });
  if (sell != null && (sell < 1 || sell > MAX_GE_PRICE))
    issues.push({ code: "invalid", field: "sellPrice", message: `Sell price must be between 1 and ${MAX_GE_PRICE} gp.` });
  if (qty != null && qty < 1) issues.push({ code: "invalid", field: "quantity", message: "Quantity must be at least 1." });
  if (otherCosts < 0) issues.push({ code: "invalid", field: "otherCosts", message: "Other costs can’t be negative." });
  if (actualTax != null && actualTax < 0) issues.push({ code: "invalid", field: "actualTax", message: "Tax can’t be negative." });

  const b = buy ?? 0;
  const s = sell ?? 0;
  const q = qty != null && qty > 0 ? qty : 0;

  const purchaseCost = b * q;
  const capitalRequired = purchaseCost + Math.max(0, otherCosts);
  const revenueGross = s * q;
  const tPer = taxPerItem(s, input.itemId, rules);
  const taxIsActual = actualTax != null && actualTax >= 0;
  const taxTotal = taxIsActual ? (actualTax as number) : tPer * q;
  const revenueNet = revenueGross - taxTotal;
  const grossProfit = revenueGross - purchaseCost;
  const netProfit = revenueNet - capitalRequired;

  const capital = toInt(input.capital);
  if (capital != null && capitalRequired > capital) {
    issues.push({ code: "insufficient_capital", required: capitalRequired, available: capital });
  }
  const limit = toInt(input.buyLimit);
  if (limit != null && limit > 0 && q > limit) {
    issues.push({ code: "exceeds_limit", quantity: q, limit });
  }

  const blocking = issues.some((i) => i.code === "missing" || i.code === "invalid");

  return {
    ok: !blocking,
    issues,
    buyPrice: b,
    sellPrice: s,
    quantity: q,
    purchaseCost,
    capitalRequired,
    revenueGross,
    taxPerItem: tPer,
    taxTotal,
    taxIsActual,
    revenueNet,
    grossProfit,
    netProfit,
    netProfitPerItem: q > 0 ? netProfit / q : 0,
    roi: capitalRequired > 0 ? netProfit / capitalRequired : null,
    breakEvenSellPrice: q > 0 && !blocking ? breakEvenSellPrice(capitalRequired / q, input.itemId, rules) : null,
  };
}

/**
 * Kleinster ganzzahliger Verkaufspreis p mit netSellPerItem(p) ≥ costPerItem.
 * netSellPerItem ist monoton nicht-fallend in p (Steuer steigt pro gp höchstens um 1 gp),
 * daher ist eine binäre Suche korrekt. null, wenn selbst MAX_GE_PRICE nicht reicht.
 */
export function breakEvenSellPrice(costPerItem: number, itemId?: number | null, rules: TaxRules = TAX_RULES): number | null {
  if (!Number.isFinite(costPerItem) || costPerItem <= 0) return costPerItem <= 0 ? 1 : null;
  if (netSellPerItem(MAX_GE_PRICE, itemId, rules) < costPerItem) return null;
  let lo = 1;
  let hi = MAX_GE_PRICE;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (netSellPerItem(mid, itemId, rules) >= costPerItem) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * Kleinster ganzzahliger Verkaufspreis, bei dem nach GE-Steuer noch Gewinn (> 0) übrig bleibt.
 * Netto-Erlös ist ganzzahlig, daher: netSell > costPerItem ⇔ netSell ≥ ⌊costPerItem⌋ + 1.
 */
export function minProfitableSellPrice(costPerItem: number, itemId?: number | null, rules: TaxRules = TAX_RULES): number | null {
  if (!Number.isFinite(costPerItem)) return null;
  return breakEvenSellPrice(Math.max(0, Math.floor(costPerItem)) + 1, itemId, rules);
}

/**
 * Höchster ganzzahliger Kaufpreis pro Stück, um bei gegebenem Verkaufspreis
 * mindestens `targetProfitPerItem` netto pro Stück zu erzielen.
 * null, wenn kein positiver Kaufpreis das Ziel erreicht.
 */
export function maxBuyPriceForProfit(
  sellPrice: number,
  targetProfitPerItem: number,
  itemId?: number | null,
  rules: TaxRules = TAX_RULES,
): number | null {
  if (!Number.isFinite(sellPrice) || sellPrice < 1 || !Number.isFinite(targetProfitPerItem)) return null;
  const max = Math.floor(netSellPerItem(sellPrice, itemId, rules) - targetProfitPerItem);
  return max >= 1 ? max : null;
}

/**
 * Maximale Stückzahl bei gegebenem Kapital und Kaufpreis, optional begrenzt durch das GE-Limit.
 */
export function maxQuantity(capital: number, buyPrice: number, buyLimit?: number | null): { byCapital: number; byLimit: number | null; max: number } {
  if (!Number.isFinite(capital) || !Number.isFinite(buyPrice) || capital <= 0 || buyPrice <= 0) {
    return { byCapital: 0, byLimit: buyLimit && buyLimit > 0 ? buyLimit : null, max: 0 };
  }
  const byCapital = Math.floor(capital / Math.floor(buyPrice));
  const byLimit = buyLimit != null && buyLimit > 0 ? Math.floor(buyLimit) : null;
  return { byCapital, byLimit, max: byLimit != null ? Math.min(byCapital, byLimit) : byCapital };
}

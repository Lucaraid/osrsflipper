import { TAX_RULES, isTaxExempt, type TaxRules } from "./rules";

/**
 * GE-Steuer für EIN Stück bei gegebenem Verkaufspreis.
 * floor(preis × satz), gedeckelt auf capPerItem; 0 für befreite Items.
 *
 * Um Fliesskomma-Artefakte zu vermeiden (z. B. 50 × 0.02 = 1.0000000000000002),
 * wird in ganzzahligen Basispunkten gerechnet.
 */
export function taxPerItem(sellPrice: number, itemId?: number | null, rules: TaxRules = TAX_RULES): number {
  if (!Number.isFinite(sellPrice) || sellPrice <= 0) return 0;
  if (isTaxExempt(itemId, rules)) return 0;
  const price = Math.floor(sellPrice);
  const rateBp = Math.round(rules.rate * 10_000); // 2 % → 200 bp
  const raw = Math.floor((price * rateBp) / 10_000);
  return Math.min(raw, rules.capPerItem);
}

/** Gesamte Steuer für eine Stückzahl (Steuer wird pro Stück berechnet). */
export function taxTotal(sellPrice: number, quantity: number, itemId?: number | null, rules: TaxRules = TAX_RULES): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return taxPerItem(sellPrice, itemId, rules) * Math.floor(quantity);
}

/** Nettoerlös pro Stück nach Steuer. */
export function netSellPerItem(sellPrice: number, itemId?: number | null, rules: TaxRules = TAX_RULES): number {
  return Math.floor(sellPrice) - taxPerItem(sellPrice, itemId, rules);
}

import type { MarketRow } from "../market/types";

/**
 * Risiko- & Liquiditätsbewertung (0–100, höher = riskanter). Rein regelbasiert, keine Prognose.
 *
 * | Komponente   | max | Grundlage                                                                         |
 * |--------------|-----|-----------------------------------------------------------------------------------|
 * | Volatilität  | 30  | Variationskoeffizient der stündlichen Durchschnittspreise (24 h); 0 % → 0, ≥ 5 % → 30; unbekannt → 15 |
 * | Liquidität   | 30  | 24h-Volumen der schwächeren Seite ÷ geplante Stückzahl; ≥ 5× → 0, ≤ 0,5× → 30; unbekannt → 30 |
 * | Spread       | 20  | (Instant-Buy − Instant-Sell) ÷ Instant-Sell; ≤ 1 % → 0, ≥ 10 % → 20                |
 * | Datenqualität| 20  | (100 − Qualitätsscore) × 0,2                                                       |
 */

export type RiskClass = "niedrig" | "mittel" | "hoch";

export interface RiskResult {
  score: number;
  riskClass: RiskClass;
  components: { volatility: number; liquidity: number; spread: number; data: number };
  /** Abdeckung: 24h-Volumen der schwächeren Seite / geplante Menge */
  coverage: number | null;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function riskClass(score: number): RiskClass {
  return score < 30 ? "niedrig" : score < 60 ? "mittel" : "hoch";
}

export const RISK_ORDER: Record<RiskClass, number> = { niedrig: 0, mittel: 1, hoch: 2 };

export function assessRisk(row: MarketRow, plannedQty: number, qualityScore: number): RiskResult {
  const cv = row.d1?.cv ?? null;
  const volatility = cv == null ? 15 : 30 * clamp01(cv / 0.05);

  let coverage: number | null = null;
  let liquidity = 30;
  if (row.d1 && plannedQty > 0) {
    const weaker = Math.min(row.d1.volHigh, row.d1.volLow);
    coverage = weaker / plannedQty;
    // log-Skala zwischen 0,5× und 5×
    liquidity = coverage >= 5 ? 0 : coverage <= 0.5 ? 30 : 30 * (1 - Math.log10(coverage / 0.5));
  }

  let spread = 10;
  if (row.high != null && row.low != null && row.low > 0) {
    const sp = (row.high - row.low) / row.low;
    spread = sp <= 0.01 ? 0 : 20 * clamp01((sp - 0.01) / 0.09);
  }

  const data = (100 - Math.max(0, Math.min(100, qualityScore))) * 0.2;
  const score = Math.round(volatility + liquidity + spread + data);
  return { score, riskClass: riskClass(score), components: { volatility, liquidity, spread, data }, coverage };
}

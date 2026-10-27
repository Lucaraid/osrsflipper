import type { MarketRow } from "../market/types";

/**
 * Risiko- & Liquiditätsbewertung (0–100, höher = riskanter). Rein regelbasiert, keine Prognose.
 *
 * | Komponente   | max | Grundlage                                                                         |
 * |--------------|-----|-----------------------------------------------------------------------------------|
 * | Volatilität  | 30  | CV der Stundenpreise (24 h; ≥ 5 % → voll) und tägliche Schwankung (30 d; ≥ 10 % → voll), je zur Hälfte; nur eine bekannt → diese allein; keine → 15 |
 * | Liquidität   | 30  | Volumen der schwächeren Seite (min. aus 24 h und normalem Tag der letzten 30 d) ÷ geplante Stückzahl; ≥ 5× → 0, ≤ 0,5× → 30; unbekannt → 30 |
 * | Spread       | 20  | (Instant-Buy − Instant-Sell) ÷ Instant-Sell; ≤ 1 % → 0, ≥ 10 % → 20                |
 * | Datenqualität| 20  | (100 − Qualitätsscore) × 0,2                                                       |
 */

export type RiskClass = "niedrig" | "mittel" | "hoch";

export interface RiskResult {
  score: number;
  riskClass: RiskClass;
  components: { volatility: number; liquidity: number; spread: number; data: number };
  /** Abdeckung: Volumen der schwächeren Seite (24 h bzw. normaler Tag) / geplante Menge */
  coverage: number | null;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function riskClass(score: number): RiskClass {
  return score < 30 ? "niedrig" : score < 60 ? "mittel" : "hoch";
}

export const RISK_ORDER: Record<RiskClass, number> = { niedrig: 0, mittel: 1, hoch: 2 };

export interface RiskHistory {
  /** Volumen der schwächeren Seite für die Mengenplanung (ersetzt das 24h-Volumen) */
  volWeaker: number | null;
  /** Tägliche Schwankung über 30 Tage */
  dailyVol: number | null;
}

export function assessRisk(row: MarketRow, plannedQty: number, qualityScore: number, hist?: RiskHistory): RiskResult {
  const cv = row.d1?.cv ?? null;
  const dv = hist?.dailyVol ?? null;
  const cvPart = cv == null ? null : clamp01(cv / 0.05);
  const dvPart = dv == null ? null : clamp01(dv / 0.1);
  const volatility = cvPart != null && dvPart != null ? 15 * cvPart + 15 * dvPart : cvPart != null ? 30 * cvPart : dvPart != null ? 30 * dvPart : 15;

  let coverage: number | null = null;
  let liquidity = 30;
  const weaker = hist ? hist.volWeaker : row.d1 ? Math.min(row.d1.volHigh, row.d1.volLow) : null;
  if (weaker != null && plannedQty > 0) {
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

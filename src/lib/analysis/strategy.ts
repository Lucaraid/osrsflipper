import { RISK_ORDER } from "./risk";
import type { FlipCandidate } from "./scanner";

/**
 * Vergleich hypothetischer Strategien auf Basis der AKTUELLEN Scanner-Schätzungen.
 * Es werden keine historischen Ergebnisse simuliert und keine zukünftigen Gewinne versprochen.
 */

export interface Strategy {
  id: string;
  name: string;
  /** Sortierwert (höher = besser) */
  rank: (c: FlipCandidate) => number;
  filter: (c: FlipCandidate) => boolean;
  pros: string[];
  cons: string[];
}

/**
 * Grundfilter für alle Strategien: positive Marge sowohl nach letzter Beobachtung als auch
 * konservativ (Durchschnittspreise), plausible Marge, mindestens mittlere Datenqualität und
 * 24h-Volumen ≥ geplanter Menge. Verhindert, dass einzelne Ausreisser-Trades Strategien dominieren.
 */
const positive = (c: FlipCandidate) =>
  c.netMargin != null &&
  c.netMargin > 0 &&
  c.netMarginConservative != null &&
  c.netMarginConservative > 0 &&
  c.qty > 0 &&
  c.quality.score >= 60 &&
  c.quality.components.plausibility >= 10 &&
  (c.risk.coverage ?? 0) >= 1;
const consRoi = (c: FlipCandidate) => Math.min(c.roi ?? 0, c.roiConservative ?? 0);
const consProfit = (c: FlipCandidate) => Math.min(c.profitAtCapital ?? 0, c.profitConservative ?? 0);

export const STRATEGIES: Strategy[] = [
  {
    id: "roi",
    name: "Hoher ROI",
    rank: consRoi,
    filter: positive,
    pros: ["Effiziente Kapitalnutzung", "Gut für kleines Kapital"],
    cons: ["Oft günstige Items mit kleinen absoluten Gewinnen", "Hohe ROIs sind häufig Ausreisser bei dünnem Handel"],
  },
  {
    id: "profit",
    name: "Hoher absoluter Gewinn",
    rank: consProfit,
    filter: positive,
    pros: ["Grosse Gewinne pro Slot", "Weniger Slot-Wechsel nötig"],
    cons: ["Hoher Kapitalbedarf", "Teure Items haben oft niedrige Limits und wenig Volumen"],
  },
  {
    id: "liquidity",
    name: "Hohe Liquidität",
    rank: (c) => c.vol24h ?? 0,
    filter: (c) => positive(c) && (c.risk.coverage ?? 0) >= 5,
    pros: ["Schnellere Ausführung wahrscheinlicher", "Preise gut beobachtet"],
    cons: ["Margen meist sehr eng", "Konkurrenz durch viele Flipper"],
  },
  {
    id: "lowrisk",
    name: "Niedriges historisches Risiko",
    rank: (c) => -c.risk.score,
    filter: (c) => positive(c) && RISK_ORDER[c.risk.riskClass] === 0,
    pros: ["Stabile Preise, gute Datenlage"],
    cons: ["Geringere Margen", "Historische Stabilität garantiert keine künftige Stabilität"],
  },
  {
    id: "lowcapital",
    name: "Geringer Kapitalbedarf",
    rank: (c) => -(c.estBuy ?? Infinity),
    filter: positive,
    pros: ["Einstieg mit wenig Kapital", "Geringer Verlust bei Fehleinschätzung"],
    cons: ["Kleine Gewinne pro Stück", "Viele Items nötig, um Kapital auszulasten"],
  },
];

export interface StrategySummary {
  strategy: Strategy;
  picks: FlipCandidate[];
  count: number;
  avgRoi: number | null;
  /** Summe der gesch. Gewinne, wenn das Kapital gleichmässig auf die Picks verteilt wird (max. GE-Slots) */
  estProfitSplit: number | null;
  avgQuality: number | null;
  avgRisk: number | null;
  medianCoverage: number | null;
}

export function summarizeStrategy(strategy: Strategy, cands: FlipCandidate[], capital: number, slots: number, topN = 10): StrategySummary {
  const filtered = cands.filter(strategy.filter).sort((a, b) => strategy.rank(b) - strategy.rank(a) || a.id - b.id);
  const picks = filtered.slice(0, topN);
  const slotPicks = picks.slice(0, Math.max(1, slots));
  const share = slotPicks.length ? capital / slotPicks.length : 0;
  let profit = 0;
  for (const c of slotPicks) {
    if (c.estBuy == null || c.netMargin == null) continue;
    let q = Math.floor(share / c.estBuy);
    if (c.limit != null) q = Math.min(q, c.limit);
    profit += q * Math.min(c.netMargin, c.netMarginConservative ?? c.netMargin);
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const covs = picks.map((p) => p.risk.coverage).filter((v): v is number => v != null).sort((a, b) => a - b);
  return {
    strategy,
    picks,
    count: filtered.length,
    avgRoi: avg(picks.map(consRoi)),
    estProfitSplit: slotPicks.length ? profit : null,
    avgQuality: avg(picks.map((p) => p.quality.score)),
    avgRisk: avg(picks.map((p) => p.risk.score)),
    medianCoverage: covs.length ? (covs[Math.floor(covs.length / 2)] as number) : null,
  };
}

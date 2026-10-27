import { historyExclusion } from "./history-check";
import type { FlipCandidate } from "./scanner";

/**
 * „Top 10 Käufe“: die besten aktuellen Flip-Kandidaten unter der Bedingung, dass in den letzten
 * 24 Stunden genug gehandelt wurde.
 *
 * Volumen-Kriterien (beide müssen erfüllt sein, gemessen auf der SCHWÄCHEREN Seite, weil sowohl
 * der Kauf als auch der Verkauf gefüllt werden muss). Ist die 30-Tage-Grundlinie geladen, zählt das
 * kleinere aus 24h-Volumen und normalem Tagesvolumen (Median 30 d), damit ein einzelner Ausreisser-Tag
 * keine zu grosse Menge erlaubt:
 *  1. Volumen ≥ minVolume24h Stück
 *  2. Volumen ≥ minCoverage × empfohlene Menge
 * Ist die nach Kapital/Limit mögliche Menge zu gross für Kriterium 2, wird die Menge reduziert
 * (auf ⌊24h-Volumen ÷ minCoverage⌋), statt das Item auszuschliessen.
 *
 * Weitere Voraussetzungen: positive Marge nach letzter Beobachtung UND mit Durchschnittspreisen,
 * Datenqualität ≥ 60, plausible Marge, keine veralteten Preise. Mit 30-Tage-Grundlinie zusätzlich ausgeschlossen:
 * aktuelle Preisspitze, wiederkehrende Spitzen bei erhöhtem Preis, Absturz, sprunghafter Preis, < 14 Handelstage.
 * Gewinne werden konservativ gerechnet (kleinere der beiden Margen).
 */

export interface TopOptions {
  minVolume24h: number;
  minCoverage: number;
  sort: "score" | "profit" | "roi";
  /** Mindestgewinn pro Trade (konservativ, nach Steuer); Standard 0 */
  minProfit?: number;
  /** Items, die ausgeschlossen werden (z. B. bereits gehalten) */
  excludeIds?: Set<number>;
  limit?: number;
}

export interface TopPick {
  c: FlipCandidate;
  /** empfohlene Menge (Kapital, GE-Limit und Volumen berücksichtigt) */
  qty: number;
  /** durch das Volumen-Kriterium reduziert? */
  qtyReducedByVolume: boolean;
  /** konservative Nettomarge pro Stück */
  margin: number;
  roi: number;
  capital: number;
  profit: number;
  volumeWeaker: number;
  coverage: number;
}

export interface TopResult {
  picks: TopPick[];
  considered: number;
  excluded: { noMargin: number; lowVolume: number; quality: number; stale: number; excluded: number; lowProfit: number; history: number };
}

export const TOP_MIN_QUALITY = 60;

export function topBuys(cands: FlipCandidate[], o: TopOptions): TopResult {
  const ex = { noMargin: 0, lowVolume: 0, quality: 0, stale: 0, excluded: 0, lowProfit: 0, history: 0 };
  const picks: TopPick[] = [];
  for (const c of cands) {
    if (o.excludeIds?.has(c.id)) { ex.excluded++; continue; }
    if (c.netMargin == null || c.netMargin <= 0 || c.netMarginConservative == null || c.netMarginConservative <= 0 || c.estBuy == null || c.qty <= 0) { ex.noMargin++; continue; }
    if (c.quality.score < TOP_MIN_QUALITY || c.quality.components.plausibility < 10) { ex.quality++; continue; }
    if (c.quality.freshness <= 0) { ex.stale++; continue; }
    if (historyExclusion(c.histCheck)) { ex.history++; continue; }
    const weaker = c.volWeakerTypical ?? 0;
    if (weaker < o.minVolume24h || weaker <= 0) { ex.lowVolume++; continue; }
    const maxByVolume = o.minCoverage > 0 ? Math.floor(weaker / o.minCoverage) : Infinity;
    const qty = Math.min(c.qty, maxByVolume);
    if (qty < 1) { ex.lowVolume++; continue; }
    const margin = Math.min(c.netMargin, c.netMarginConservative);
    if (o.minProfit != null && o.minProfit > 0 && qty * margin < o.minProfit) { ex.lowProfit++; continue; }
    picks.push({
      c,
      qty,
      qtyReducedByVolume: qty < c.qty,
      margin,
      roi: margin / c.estBuy,
      capital: qty * c.estBuy,
      profit: qty * margin,
      volumeWeaker: weaker,
      coverage: weaker / qty,
    });
  }
  const key = (p: TopPick) => (o.sort === "profit" ? p.profit : o.sort === "roi" ? p.roi : p.c.score);
  picks.sort((a, b) => key(b) - key(a) || b.profit - a.profit || a.c.id - b.c.id);
  return { picks: picks.slice(0, o.limit ?? 10), considered: cands.length, excluded: ex };
}

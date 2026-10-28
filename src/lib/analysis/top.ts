import { historyExclusion, type HistoryFlag } from "./history-check";
import type { FlipCandidate } from "./scanner";
import { breakEvenSellPrice } from "../calc/profit";
import { netSellPerItem } from "../tax/tax";

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
 * Items, deren Kauflimit durch eigene Käufe im 4-h-Fenster aufgebraucht ist, fallen weg; sonst
 * begrenzt das Restlimit die Menge (siehe scanner.ts / portfolio/buy-limit.ts).
 *
 * Weitere Voraussetzungen: positive Marge nach letzter Beobachtung UND mit Durchschnittspreisen,
 * Datenqualität ≥ 60, plausible Marge, keine veralteten Preise. Mit 30-Tage-Grundlinie zusätzlich ausgeschlossen:
 * aktuelle Preisspitze, wiederkehrende Spitzen bei erhöhtem Preis, Absturz, sprunghafter Preis, < 14 Handelstage.
 * Gewinne werden konservativ gerechnet (kleinere der beiden Margen).
 *
 * Mit `history: "only"` wird die Auswahl umgekehrt: nur Items, die der 30-Tage-Abgleich ausschliesst
 * (Tab „Volatile“ – zur manuellen Prüfung, alle übrigen Kriterien gelten weiterhin).
 */

export interface TopOptions {
  minVolume24h: number;
  minCoverage: number;
  /** "reward": Gewinn ÷ geschätztes Verlustrisiko (nur sinnvoll mit history "only") */
  sort: "score" | "profit" | "roi" | "reward";
  /** Mindestgewinn pro Trade (konservativ, nach Steuer); Standard 0 */
  minProfit?: number;
  /** Items, die ausgeschlossen werden (z. B. bereits gehalten) */
  excludeIds?: Set<number>;
  limit?: number;
  /** "exclude" (Standard): Ausschlüsse des 30-Tage-Abgleichs weglassen; "only": nur diese zeigen */
  history?: "exclude" | "only";
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
  /** Ausschlussgrund aus dem 30-Tage-Abgleich (nur bei history "only" gesetzt) */
  flag: HistoryFlag | null;
  /** Geschätzter Verlust, wenn sich der Preis gegen einen bewegt (nur bei markierten Items; null = nicht schätzbar) */
  downside: Downside | null;
}

export interface Downside {
  /** angenommener Verkaufspreis im ungünstigen Fall */
  sellPrice: number;
  /** Verlust pro Stück nach Steuer (0 = auch dann kein Verlust) */
  perItem: number;
  total: number;
  /** welches Szenario den tiefsten Preis ergibt */
  scenario: "fallback" | "trend" | "swing";
}

/**
 * Ungünstiger Fall für markierte Items (Schätzung, keine Prognose). Ausgangspunkt ist der realistische
 * Verkaufspreis zur konservativen Marge (Kauf + Marge + Steuer), nicht der letzte Instant-Buy:
 *  - Preisspitze: Rückfall auf das 7-Tage-Niveau (Verkaufspreis ÷ (1 + Abweichung))
 *  - Absturz: ein weiterer Tag im 7-Tage-Trend
 *  - sprunghaft: eine typische Tagesbewegung (1 × tägliche Schwankung) nach unten
 * Bei mehreren Gründen zählt der tiefste Preis. Ohne Historie (thin) keine Schätzung.
 */
export function downsideEstimate(c: FlipCandidate, qty: number, margin: number): Downside | null {
  const hc = c.histCheck;
  const h = c.hist;
  if (!hc || !h || hc.thin || c.estBuy == null || c.estSell == null) return null;
  // kleinster Verkaufspreis, der nach Steuer Kauf + Marge ergibt
  const sell = Math.min(c.estSell, breakEvenSellPrice(c.estBuy + margin, c.id) ?? c.estSell);
  const options: Array<[Downside["scenario"], number]> = [];
  if ((hc.spike || (hc.recurringSpikes && hc.elevated)) && hc.deviation != null && hc.deviation > 0) options.push(["fallback", sell / (1 + hc.deviation)]);
  if (hc.crash && h.trend7 != null) options.push(["trend", sell * Math.exp(h.trend7)]);
  if (hc.erratic && h.dailyVol != null) options.push(["swing", sell * Math.exp(-h.dailyVol)]);
  if (!options.length) return null;
  const [scenario, raw] = options.reduce((a, b) => (b[1] < a[1] ? b : a));
  const sellPrice = Math.max(1, Math.floor(raw));
  const perItem = Math.max(0, c.estBuy - netSellPerItem(sellPrice, c.id));
  return { sellPrice, perItem, total: perItem * qty, scenario };
}

export interface TopResult {
  picks: TopPick[];
  considered: number;
  excluded: { noMargin: number; lowVolume: number; quality: number; stale: number; excluded: number; lowProfit: number; limitUsedUp: number; history: number };
}

export const TOP_MIN_QUALITY = 60;

export function topBuys(cands: FlipCandidate[], o: TopOptions): TopResult {
  const ex = { noMargin: 0, lowVolume: 0, quality: 0, stale: 0, excluded: 0, lowProfit: 0, limitUsedUp: 0, history: 0 };
  const picks: TopPick[] = [];
  for (const c of cands) {
    if (o.excludeIds?.has(c.id)) { ex.excluded++; continue; }
    if (c.limitLeft === 0) { ex.limitUsedUp++; continue; }
    if (c.netMargin == null || c.netMargin <= 0 || c.netMarginConservative == null || c.netMarginConservative <= 0 || c.estBuy == null || c.qty <= 0) { ex.noMargin++; continue; }
    if (c.quality.score < TOP_MIN_QUALITY || c.quality.components.plausibility < 10) { ex.quality++; continue; }
    if (c.quality.freshness <= 0) { ex.stale++; continue; }
    const flag = historyExclusion(c.histCheck);
    // history "exclude": markierte Items zählen als ausgeschlossen; "only": unmarkierte (stehen in der Standard-Liste)
    if ((o.history === "only") !== (flag != null)) { ex.history++; continue; }
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
      flag,
      downside: flag ? downsideEstimate(c, qty, margin) : null,
    });
  }
  const key = (p: TopPick) => {
    if (o.sort === "reward") return p.downside ? p.profit / Math.max(1, p.downside.total) : -1;
    return o.sort === "profit" ? p.profit : o.sort === "roi" ? p.roi : p.c.score;
  };
  picks.sort((a, b) => key(b) - key(a) || b.profit - a.profit || a.c.id - b.c.id);
  return { picks: picks.slice(0, o.limit ?? 10), considered: cands.length, excluded: ex };
}

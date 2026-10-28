import type { MonthAgg } from "../market/types";

/**
 * Abgleich der aktuellen Preise mit der 30-Tage-Grundlinie. Schützt Scanner und Top 10 vor Items,
 * die gerade eine Preisspitze haben, regelmässig ausschlagen, fallen oder sprunghaft sind.
 * Schwellen am 27.10.2026 an ca. 700 liquiden Items kalibriert (Anteil betroffener Items in Klammern).
 */
export const HIST_RULES = {
  /** Mitte > 3 × Streuung über dem 7-Tage-Median → Preisspitze (≈ 4 %) */
  spikeZ: 3,
  /** Maximaler Aufwärtstrend pro Tag, um den das 7-Tage-Niveau fortgeschrieben wird */
  trendCap: 0.02,
  /** Bei wiederkehrenden Spitzen gilt schon > 1,5 × Streuung als „gerade erhöht“ */
  elevatedZ: 1.5,
  /** ≥ 3 Ausreisser-Tage in 30 Tagen → wiederkehrende Spitzen (≈ 4 %) */
  recurringSpikeDays: 3,
  /** Trend 7 Tage < −1 %/Tag → Abwärtstrend, < −5 %/Tag → Absturz (≈ 5 %) */
  downtrend: -0.01,
  crash: -0.05,
  /** Tägliche Schwankung > 25 % → sprunghaft (≈ 5 %) */
  erraticVol: 0.25,
  /** Weniger als 14 von 30 Tagen gehandelt → zu wenig Historie */
  minDays: 14,
  /** Bruttomarge höchstens 2 × typischer Tagesspread (aktueller Spread > 2× bei ≈ 20 %) */
  spreadCap: 2,
  /** Erwartete Haltedauer eines Flips (Tage) für die Kosten eines Abwärtstrends */
  holdDays: 0.5,
  /** 24h-Volumen > 3 × normales Tagesvolumen → ungewöhnlicher Handelstag */
  volumeBurst: 3,
} as const;

export interface HistoryCheck {
  /** Abweichung der aktuellen Mitte vom 7-Tage-Median (relativ) und in Vielfachen der Streuung */
  deviation: number | null;
  z: number | null;
  spike: boolean;
  elevated: boolean;
  recurringSpikes: boolean;
  downtrend: boolean;
  crash: boolean;
  erratic: boolean;
  thin: boolean;
  wideSpread: boolean;
  volumeBurst: boolean;
  /** Obergrenze der Bruttomarge pro Stück (null ohne Spread-Historie) */
  marginCap: number | null;
  /** Erwarteter Wertverlust pro Stück während der Haltedauer bei Abwärtstrend */
  driftCost: number;
  /** Volumen der schwächeren Seite für die Mengenplanung: min(24 h, normaler Tag) */
  volWeakerTypical: number | null;
  /** Ranking-Faktor 0,3–1 */
  factor: number;
}

export interface CurrentPrices {
  /** Aktuelle Mitte (höherer Wert aus letzter Beobachtung und 1h-Mittel) */
  mid: number | null;
  /** Aktueller Spread (letzter Instant-Buy − letzter Instant-Sell) */
  spread: number | null;
  /** Geschätzter Kaufpreis */
  buy: number | null;
  /** 24h-Volumen der schwächeren Seite */
  volWeaker24h: number | null;
}

/** null = keine Grundlinie geladen (dann keine Aussage); h = null bei geladener Grundlinie = Item ohne Historie. */
export function checkHistory(h: MonthAgg | null, cur: CurrentPrices): HistoryCheck {
  const R = HIST_RULES;
  const thin = h == null || h.days < R.minDays;
  // Der 7-Tage-Median hinkt einem stetigen Aufwärtstrend ~3,5 Tage hinterher → entlang des Trends fortschreiben.
  // Nur aufwärts (eine Erholung nach einem Abwärtstrend ist keine Spitze; Abwärtstrends haben eigene Regeln)
  // und auf +2 %/Tag begrenzt, damit eine frische Spitze sich nicht selbst rechtfertigt.
  const trendShift = h?.median7 != null && h.trend7 != null ? Math.exp(Math.max(0, Math.min(R.trendCap, h.trend7)) * 3.5) : 1;
  const ref = h ? (h.median7 != null ? h.median7 * trendShift : h.median30) : null;
  const deviation = h && ref && cur.mid != null ? cur.mid / ref - 1 : null;
  const z = deviation != null && h ? deviation / h.noise : null;
  const spike = z != null && z > R.spikeZ;
  const elevated = z != null && z > R.elevatedZ;
  const recurringSpikes = (h?.spikeDays ?? 0) >= R.recurringSpikeDays;
  const trend = h?.trend7 ?? null;
  const crash = trend != null && trend < R.crash;
  const downtrend = trend != null && trend < R.downtrend;
  const erratic = h?.dailyVol != null && h.dailyVol > R.erraticVol;
  const marginCap = h?.spread != null && h.spread > 0 ? Math.ceil(R.spreadCap * h.spread) : null;
  const wideSpread = marginCap != null && cur.spread != null && cur.spread > marginCap;
  const driftCost = downtrend && trend != null && cur.buy != null ? Math.ceil(-trend * R.holdDays * cur.buy) : 0;

  const normalVol = h?.volWeaker ?? null;
  const volWeakerTypical = normalVol != null ? (cur.volWeaker24h != null ? Math.min(cur.volWeaker24h, normalVol) : normalVol) : cur.volWeaker24h;
  const volumeBurst = normalVol != null && normalVol > 0 && cur.volWeaker24h != null && cur.volWeaker24h > R.volumeBurst * normalVol;

  let factor = 1;
  if (spike) factor *= 0.5;
  else if (recurringSpikes && elevated) factor *= 0.6;
  else if (recurringSpikes) factor *= 0.85;
  if (crash) factor *= 0.5;
  else if (downtrend) factor *= 0.85;
  if (erratic) factor *= 0.6;
  if (thin) factor *= 0.8;

  return {
    deviation,
    z,
    spike,
    elevated,
    recurringSpikes,
    downtrend,
    crash,
    erratic,
    thin,
    wideSpread,
    volumeBurst,
    marginCap,
    driftCost,
    volWeakerTypical,
    factor: Math.max(0.3, factor),
  };
}

export type HistoryFlag = "thin" | "crash" | "erratic" | "spike";

export const HISTORY_FLAG_LABEL: Record<HistoryFlag, string> = {
  thin: "Little history",
  crash: "Crashing",
  erratic: "Erratic",
  spike: "Price spike",
};

/** Ausschlussgrund für die Top 10 (null = unbedenklich). */
export function historyExclusion(hc: HistoryCheck | null): HistoryFlag | null {
  if (!hc) return null;
  // Grundlegende Ursachen zuerst melden (eine Spitze relativ zum fallenden Trend ist Folge des Absturzes)
  if (hc.thin) return "thin";
  if (hc.crash) return "crash";
  if (hc.erratic) return "erratic";
  if (hc.spike) return "spike";
  if (hc.recurringSpikes && hc.elevated) return "spike";
  return null;
}

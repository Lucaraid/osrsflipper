import { blockMidPrice } from "../market/aggregate";
import type { ItemMeta, MarketRow } from "../market/types";

/**
 * Marktweite Kennzahlen und regelbasierte Anomalieerkennung auf Basis des Snapshots
 * (letzte Beobachtung, letzter 1h-Block, 24h aus Stundenblöcken).
 *
 * Eine erkannte Anomalie ist eine statistische Auffälligkeit – KEIN Beleg für Manipulation
 * oder eine Handelsempfehlung.
 */

export interface MarketMetrics {
  id: number;
  name: string;
  icon: string;
  /** Mittelpreis (Ø Instant-Buy + Ø Instant-Sell)/2 im letzten 1h-Block */
  price1h: number | null;
  /** Mittelpreis aus den volumengewichteten 24h-Durchschnitten beider Seiten */
  price24h: number | null;
  /** Änderung erster → letzter aktiver Stundenblock im 24h-Fenster */
  change24h: number | null;
  /** Abweichung 1h-Durchschnitt vom 24h-Durchschnitt */
  change1hVs24h: number | null;
  /** Abweichung der letzten Instant-Preise (Mitte) vom 24h-Durchschnitt */
  deviationLatest: number | null;
  vol1h: number;
  /** durchschnittliches Stundenvolumen im 24h-Fenster */
  avgHourlyVol24h: number | null;
  volumeRatio: number | null;
  cv24h: number | null;
  cvRecent: number | null;
  cvPrior: number | null;
  spreadNow: number | null;
  spread24h: number | null;
  spreadChange: number | null;
  activeBlocks: number;
  /** Beide Preisseiten im letzten 1h-Block mit je ≥ MIN_SIDE_VOLUME Stück gehandelt */
  h1BothSides: boolean;
}

export const MIN_ACTIVE_BLOCKS = 12;
export const MIN_HOURLY_VOLUME = 10;
/** Strengere Anforderungen für die Anomalieerkennung (reduziert Fehlalarme bei dünnem/einseitigem Handel) */
export const ANOMALY_MIN_ACTIVE_BLOCKS = 20;
export const ANOMALY_MIN_HOURLY_VOLUME = 50;
export const MIN_SIDE_VOLUME = 5;
/** Preisregeln erst ab diesem Mittelpreis – bei sehr billigen Items erzeugen 1-gp-Schritte grosse Prozentwerte */
export const ANOMALY_MIN_PRICE = 100;

export function computeMetrics(items: ItemMeta[], rows: MarketRow[]): MarketMetrics[] {
  const meta = new Map(items.map((i) => [i.id, i]));
  const out: MarketMetrics[] = [];
  for (const r of rows) {
    const m = meta.get(r.id);
    if (!m || !r.d1) continue;
    const d = r.d1;
    const vol24 = d.volHigh + d.volLow;
    const price24h = blockMidPrice({ avgHigh: d.avgHigh, avgLow: d.avgLow, volHigh: d.volHigh, volLow: d.volLow });
    const price1h = blockMidPrice(r.h1);
    const vol1h = r.h1 ? r.h1.volHigh + r.h1.volLow : 0;
    const avgHourly = d.activeBlocks > 0 ? vol24 / 24 : null;
    const mid = r.high != null && r.low != null ? (r.high + r.low) / 2 : null;
    const spreadNow = r.high != null && r.low != null ? r.high - r.low : null;
    out.push({
      id: r.id,
      name: m.name,
      icon: m.icon,
      price1h,
      price24h,
      change24h: d.firstAvg && d.lastAvg ? (d.lastAvg - d.firstAvg) / d.firstAvg : null,
      change1hVs24h: price1h != null && price24h ? (price1h - price24h) / price24h : null,
      deviationLatest: mid != null && price24h ? (mid - price24h) / price24h : null,
      vol1h,
      avgHourlyVol24h: avgHourly,
      volumeRatio: avgHourly && avgHourly > 0 ? vol1h / avgHourly : null,
      cv24h: d.cv,
      cvRecent: d.cvRecent,
      cvPrior: d.cvPrior,
      spreadNow,
      spread24h: d.avgSpread,
      spreadChange: spreadNow != null && d.avgSpread && d.avgSpread > 0 ? (spreadNow - d.avgSpread) / d.avgSpread : null,
      activeBlocks: d.activeBlocks,
      h1BothSides: !!r.h1 && r.h1.avgHigh != null && r.h1.avgLow != null && r.h1.volHigh >= MIN_SIDE_VOLUME && r.h1.volLow >= MIN_SIDE_VOLUME,
    });
  }
  return out;
}

/** Nur ausreichend gehandelte Items – vermeidet irreführende Statistiken bei dünnem Handel. */
export function isLiquidEnough(m: MarketMetrics): boolean {
  return m.activeBlocks >= MIN_ACTIVE_BLOCKS && (m.avgHourlyVol24h ?? 0) >= MIN_HOURLY_VOLUME;
}

export type AnomalyKind = "price_move" | "activity_high" | "activity_low" | "volatility_jump" | "deviation";

export interface Anomaly {
  id: number;
  name: string;
  icon: string;
  kind: AnomalyKind;
  severity: number; // Vielfaches des Schwellwerts (≥ 1)
  text: string;
}

export const ANOMALY_RULES = {
  priceMove: 0.2, // |Mittelpreis 1h vs 24h| ≥ 20 % (nur bei beidseitigem Handel in der letzten Stunde)
  activityHigh: 4, // 1h-Volumen ≥ 4× Stundenmittel
  activityLow: 0.1, // 1h-Volumen ≤ 0,1× Stundenmittel
  volatilityJump: 4, // CV letzte 6 h ≥ 4× CV davor (und ≥ 2 %)
  deviation: 0.25, // Mitte der letzten Instant-Preise ≥ 25 % vom 24h-Mittelpreis (nur bei beidseitigem Handel)
} as const;

/** Anforderungen für die Anomalieerkennung: ausreichend und gleichmässig gehandelt. */
export function eligibleForAnomalies(m: MarketMetrics): boolean {
  return m.activeBlocks >= ANOMALY_MIN_ACTIVE_BLOCKS && (m.avgHourlyVol24h ?? 0) >= ANOMALY_MIN_HOURLY_VOLUME;
}

const pctTxt = (v: number) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)} %`;

export function detectAnomalies(metrics: MarketMetrics[]): Anomaly[] {
  const out: Anomaly[] = [];
  for (const m of metrics) {
    if (!eligibleForAnomalies(m)) continue;
    const base = { id: m.id, name: m.name, icon: m.icon };
    const priced = (m.price24h ?? 0) >= ANOMALY_MIN_PRICE;
    if (priced && m.h1BothSides && m.change1hVs24h != null && Math.abs(m.change1hVs24h) >= ANOMALY_RULES.priceMove) {
      out.push({ ...base, kind: "price_move", severity: Math.abs(m.change1hVs24h) / ANOMALY_RULES.priceMove, text: `Ungewöhnlich starke Preisänderung: 1h-Durchschnitt ${pctTxt(m.change1hVs24h)} ggü. 24h-Durchschnitt.` });
    }
    if (m.volumeRatio != null && m.volumeRatio >= ANOMALY_RULES.activityHigh) {
      out.push({ ...base, kind: "activity_high", severity: m.volumeRatio / ANOMALY_RULES.activityHigh, text: `Handelsaktivität stark erhöht: ${m.volumeRatio.toFixed(1)}× das durchschnittliche Stundenvolumen.` });
    }
    if (m.volumeRatio != null && m.volumeRatio <= ANOMALY_RULES.activityLow) {
      out.push({ ...base, kind: "activity_low", severity: ANOMALY_RULES.activityLow / Math.max(m.volumeRatio, 0.01), text: `Handelsaktivität stark gesunken: ${m.volumeRatio.toFixed(2)}× das durchschnittliche Stundenvolumen.` });
    }
    if (m.cvRecent != null && m.cvPrior != null && m.cvRecent >= 0.02 && m.cvRecent >= ANOMALY_RULES.volatilityJump * Math.max(m.cvPrior, 0.001)) {
      out.push({ ...base, kind: "volatility_jump", severity: m.cvRecent / Math.max(m.cvPrior, 0.001) / ANOMALY_RULES.volatilityJump, text: `Abrupter Volatilitätsanstieg: Schwankung der letzten 6 h ${(m.cvRecent * 100).toFixed(1)} % vs. ${(m.cvPrior * 100).toFixed(1)} % davor.` });
    }
    if (priced && m.h1BothSides && m.deviationLatest != null && Math.abs(m.deviationLatest) >= ANOMALY_RULES.deviation) {
      out.push({ ...base, kind: "deviation", severity: Math.abs(m.deviationLatest) / ANOMALY_RULES.deviation, text: `Letzte Preise weichen ${pctTxt(m.deviationLatest)} vom 24h-Durchschnitt ab.` });
    }
  }
  return out.sort((a, b) => b.severity - a.severity || a.id - b.id);
}

export const ANOMALY_LABELS: Record<AnomalyKind, string> = {
  price_move: "Preisänderung",
  activity_high: "Aktivität ↑",
  activity_low: "Aktivität ↓",
  volatility_jump: "Volatilität ↑",
  deviation: "Abweichung",
};

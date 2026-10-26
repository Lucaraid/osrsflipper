import type { TimeseriesPoint } from "../market/types";
import { meanStd } from "../market/aggregate";

/**
 * Marktindikatoren aus einer Zeitreihe (/timeseries). Methoden:
 * - Preis je Punkt = Mittelpreis (avgHighPrice + avgLowPrice) / 2; ist nur eine Seite gehandelt, deren Wert.
 * - Preisänderung = (letzter − erster Punkt mit Daten) / erster.
 * - Historische Volatilität = Standardabweichung der Log-Renditen aufeinanderfolgender Punkte mit Daten
 *   (nicht annualisiert; bezieht sich auf die gelieferte Schrittweite).
 * - Median, Mittelwert, Min/Max (Schwankungsbreite = (max − min) / Mittelwert).
 * - Abweichung = (letzter Preis − Mittelwert) / Mittelwert.
 * - Handelsaktivität = Summe der Volumina beider Seiten; Anteil Punkte mit Handel.
 * Unter MIN_POINTS Punkten mit Daten werden statistische Kennzahlen als unzureichend markiert.
 */

export const MIN_POINTS = 10;

export function pointPrice(p: TimeseriesPoint): number | null {
  if (p.avgHighPrice != null && p.avgLowPrice != null) return (p.avgHighPrice + p.avgLowPrice) / 2;
  return p.avgHighPrice ?? p.avgLowPrice ?? null;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

export interface Indicators {
  points: number;
  pointsWithData: number;
  gaps: number;
  sufficient: boolean;
  first: number | null;
  last: number | null;
  change: number | null;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  range: number | null;
  volatility: number | null;
  deviation: number | null;
  totalVolume: number;
  avgVolumePerPoint: number | null;
  activeShare: number | null;
  avgSpread: number | null;
}

export function computeIndicators(points: TimeseriesPoint[]): Indicators {
  const prices: number[] = [];
  let totalVolume = 0;
  let spreadSum = 0, spreadN = 0;
  for (const p of points) {
    totalVolume += p.highPriceVolume + p.lowPriceVolume;
    const pr = pointPrice(p);
    if (pr != null) prices.push(pr);
    if (p.avgHighPrice != null && p.avgLowPrice != null) {
      spreadSum += p.avgHighPrice - p.avgLowPrice;
      spreadN++;
    }
  }
  const n = prices.length;
  const sufficient = n >= MIN_POINTS;
  const ms = meanStd(prices);
  const first = prices[0] ?? null;
  const last = prices[n - 1] ?? null;
  const rets: number[] = [];
  for (let i = 1; i < n; i++) {
    const a = prices[i - 1] as number, b = prices[i] as number;
    if (a > 0 && b > 0) rets.push(Math.log(b / a));
  }
  const vol = rets.length >= 2 ? meanStd(rets)?.std ?? null : null;
  const min = n ? Math.min(...prices) : null;
  const max = n ? Math.max(...prices) : null;
  return {
    points: points.length,
    pointsWithData: n,
    gaps: points.length - n,
    sufficient,
    first,
    last,
    change: first != null && last != null && first > 0 ? (last - first) / first : null,
    mean: ms?.mean ?? null,
    median: median(prices),
    min,
    max,
    range: ms && ms.mean > 0 && min != null && max != null ? (max - min) / ms.mean : null,
    volatility: sufficient ? vol : null,
    deviation: ms && ms.mean > 0 && last != null ? (last - ms.mean) / ms.mean : null,
    totalVolume,
    avgVolumePerPoint: points.length ? totalVolume / points.length : null,
    activeShare: points.length ? n / points.length : null,
    avgSpread: spreadN ? spreadSum / spreadN : null,
  };
}

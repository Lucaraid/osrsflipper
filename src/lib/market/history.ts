import { blockMidPrice, meanStd } from "./aggregate";
import type { BlockAgg, MonthAgg } from "./types";

/**
 * 30-Tage-Grundlinie aus Tagesblöcken (`/24h?timestamp=`, je 00:00–24:00 UTC).
 * Kalibriert am 27.10.2026 an ca. 700 liquiden Items (≥ 1'000 gp, ≥ 100 Stück/Tag, positive Marge).
 */

export const HISTORY_DAYS = 30;
/** Seit 30.09.2026 stammen die Daten von Jagex (alle Clients); davor nur RuneLite → Volumen davor zu klein. */
export const FULL_VOLUME_SINCE = 1_790_726_400;
/** Ein Tag gilt als Ausreisser nach oben, wenn sein Mittel > Median × (1 + max(5 %, 4 × Streuung)) liegt. */
export const SPIKE_DAY_MIN = 0.05;
export const SPIKE_DAY_NOISE = 4;

export interface DayBlock {
  timestamp: number;
  map: Map<number, BlockAgg>;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/** Steigung der Log-Preise pro Index-Schritt (kleinste Quadrate); Lücken bleiben Lücken. */
export function logSlope(points: Array<[number, number]>): number | null {
  if (points.length < 2) return null;
  const xm = points.reduce((a, [x]) => a + x, 0) / points.length;
  const ym = points.reduce((a, [, y]) => a + Math.log(y), 0) / points.length;
  let num = 0, den = 0;
  for (const [x, y] of points) {
    num += (x - xm) * (Math.log(y) - ym);
    den += (x - xm) ** 2;
  }
  return den > 0 ? num / den : null;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r5 = (v: number | null) => (v == null ? null : Math.round(v * 1e5) / 1e5);

/** Aggregiert Tagesblöcke (beliebige Reihenfolge) zu einer 30-Tage-Grundlinie je Item. */
export function aggregateMonth(blocks: DayBlock[]): Map<number, MonthAgg> {
  const days = [...blocks].sort((a, b) => a.timestamp - b.timestamp);
  const ids = new Set<number>();
  for (const d of days) for (const id of d.map.keys()) ids.add(id);
  const out = new Map<number, MonthAgg>();

  for (const id of ids) {
    // Index = Tagesposition, damit Lücken im Trend und in den Renditen berücksichtigt werden
    const mids: Array<number | null> = [];
    const spreads: number[] = [];
    const vols: number[] = [];
    for (const d of days) {
      const e = d.map.get(id);
      mids.push(blockMidPrice(e));
      if (e?.avgHigh != null && e.avgLow != null) spreads.push(e.avgHigh - e.avgLow);
      if (e && d.timestamp >= FULL_VOLUME_SINCE) vols.push(Math.min(e.volHigh, e.volLow));
    }
    const active = mids.filter((m): m is number => m != null);
    const median30 = median(active);
    if (median30 == null || median30 <= 0) continue;

    const last7 = mids.slice(-7).filter((m): m is number => m != null);
    const mad = median(active.map((m) => Math.abs(m / median30 - 1))) ?? 0;
    const noise = Math.max(1.4826 * mad, 0.01, 2 / median30);

    const rets: number[] = [];
    for (let i = 1; i < mids.length; i++) {
      const a = mids[i - 1], b = mids[i];
      if (a != null && b != null && a > 0 && b > 0) rets.push(Math.log(b / a));
    }
    const rs = rets.length >= 10 ? meanStd(rets) : null;

    const trendPts: Array<[number, number]> = [];
    const start = Math.max(0, mids.length - 7);
    for (let i = start; i < mids.length; i++) {
      const m = mids[i];
      if (m != null && m > 0) trendPts.push([i, m]);
    }
    const first = active[0] as number;
    const last = active[active.length - 1] as number;
    const spikeLimit = median30 * (1 + Math.max(SPIKE_DAY_MIN, SPIKE_DAY_NOISE * noise));

    out.set(id, {
      days: active.length,
      median30: r2(median30),
      median7: last7.length > 0 ? r2(median(last7) as number) : null,
      noise: r5(noise) as number,
      dailyVol: r5(rs ? rs.std : null),
      trend7: r5(trendPts.length >= 5 ? logSlope(trendPts) : null),
      change30: r5(active.length >= 2 ? last / first - 1 : null),
      spikeDays: active.filter((m) => m > spikeLimit).length,
      spread: spreads.length > 0 ? r2(median(spreads) as number) : null,
      volWeaker: median(vols),
      min: r2(Math.min(...active)),
      max: r2(Math.max(...active)),
    });
  }
  return out;
}

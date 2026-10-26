import type { BlockAgg, DayAgg } from "./types";

/**
 * Mittelpreis eines Blocks: (Ø Instant-Buy + Ø Instant-Sell) / 2, wenn beide Seiten gehandelt wurden,
 * sonst der Durchschnitt der vorhandenen Seite. Unabhängig vom Verhältnis Kauf-/Verkaufsvolumen und
 * daher robuster für Preisvergleiche und Volatilität als ein volumengewichteter Mittelwert.
 */
export function blockMidPrice(b: BlockAgg | null | undefined): number | null {
  if (!b) return null;
  if (b.avgHigh != null && b.avgLow != null) return (b.avgHigh + b.avgLow) / 2;
  return b.avgHigh ?? b.avgLow ?? null;
}

/** Volumengewichteter Durchschnittspreis eines Blocks über beide Seiten; null ohne Handel. */
export function blockAvgPrice(b: BlockAgg | null | undefined): number | null {
  if (!b) return null;
  const hv = b.avgHigh != null ? b.volHigh : 0;
  const lv = b.avgLow != null ? b.volLow : 0;
  const vol = hv + lv;
  if (vol <= 0) return null;
  return ((b.avgHigh ?? 0) * hv + (b.avgLow ?? 0) * lv) / vol;
}

export const MIN_BLOCKS_FOR_CV = 6;

const r2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
const r5 = (v: number | null) => (v == null ? null : Math.round(v * 1e5) / 1e5);

/** Mittelwert & Standardabweichung (Stichprobe). */
export function meanStd(values: number[]): { mean: number; std: number } | null {
  if (values.length === 0) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (values.length < 2) return { mean, std: 0 };
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / (values.length - 1);
  return { mean, std: Math.sqrt(variance) };
}

/**
 * Aggregiert bis zu 24 stündliche Blöcke (chronologisch, ältester zuerst) je Item.
 * Fehlende Blöcke bzw. Blöcke ohne Handel werden NICHT interpoliert, sondern gezählt.
 */
export function aggregateDay(blocks: Array<Map<number, BlockAgg>>): Map<number, DayAgg> {
  const ids = new Set<number>();
  for (const b of blocks) for (const id of b.keys()) ids.add(id);
  const out = new Map<number, DayAgg>();

  for (const id of ids) {
    let hSum = 0, hVol = 0, lSum = 0, lVol = 0;
    let active = 0, both = 0, spreadSum = 0;
    const avgs: number[] = [];
    for (const block of blocks) {
      const e = block.get(id);
      if (!e) continue;
      if (e.avgHigh != null) { hSum += e.avgHigh * e.volHigh; hVol += e.volHigh; }
      if (e.avgLow != null) { lSum += e.avgLow * e.volLow; lVol += e.volLow; }
      const avg = blockMidPrice(e);
      if (avg != null) { active++; avgs.push(avg); }
      if (e.avgHigh != null && e.avgLow != null) { both++; spreadSum += e.avgHigh - e.avgLow; }
    }
    if (active === 0) continue;
    const ms = avgs.length >= MIN_BLOCKS_FOR_CV ? meanStd(avgs) : null;
    out.set(id, {
      avgHigh: r2(hVol > 0 ? hSum / hVol : null),
      avgLow: r2(lVol > 0 ? lSum / lVol : null),
      volHigh: hVol,
      volLow: lVol,
      activeBlocks: active,
      bothSidedBlocks: both,
      cv: r5(ms && ms.mean > 0 ? ms.std / ms.mean : null),
      minAvg: r2(Math.min(...avgs)),
      maxAvg: r2(Math.max(...avgs)),
      firstAvg: r2(avgs[0] ?? null),
      lastAvg: r2(avgs[avgs.length - 1] ?? null),
      avgSpread: r2(both > 0 ? spreadSum / both : null),
      ...recentVsPrior(avgs),
    });
  }
  return out;
}

/**
 * Variationskoeffizient der letzten 6 aktiven Blöcke im Vergleich zu den davor liegenden.
 * Grundlage für die Erkennung eines abrupten Volatilitätsanstiegs. null bei zu wenig Daten.
 */
export function recentVsPrior(avgs: number[]): { cvRecent: number | null; cvPrior: number | null } {
  if (avgs.length < 12) return { cvRecent: null, cvPrior: null };
  const recent = meanStd(avgs.slice(-6));
  const prior = meanStd(avgs.slice(0, -6));
  return {
    cvRecent: r5(recent && recent.mean > 0 ? recent.std / recent.mean : null),
    cvPrior: r5(prior && prior.mean > 0 ? prior.std / prior.mean : null),
  };
}

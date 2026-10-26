/**
 * ⚠️ SYNTHETISCHE TESTDATEN – KEINE ECHTEN MARKTDATEN ⚠️
 *
 * Diese Datei erzeugt deterministische, künstliche Preis- und Volumendaten im Format der
 * OSRS Wiki API v2. Sie wird ausschliesslich verwendet, wenn MARKET_DATA_SOURCE=fixtures gesetzt ist
 * (automatisierte Tests). Die UI zeigt in diesem Modus ein unübersehbares "TESTDATEN"-Banner.
 *
 * Item-Metadaten (IDs, Namen, Limits) stammen aus einem echten /mapping-Auszug (mapping-subset.json),
 * die PREISE sind frei erfunden und dürfen nicht für Handelsentscheidungen genutzt werden.
 */
import mappingSubset from "./mapping-subset.json";

export const FIXTURE_MAPPING = mappingSubset as Array<{ id: number; name: string; limit?: number }>;

/** Spezialfälle für Tests */
export const FIXTURE_CASES = {
  taxExempt: 13190, // Old school bond – steuerfrei
  aboveCap: 20997, // Stückpreis > 250M → Steuer-Cap greift
  spike: 4151, // starker Preisanstieg in der letzten Stunde (Anomalie)
  staleLatest: 1127, // letzte Beobachtung 3 h alt
  oneSided: 5295, // nur Instant-Buy-Seite vorhanden
  noVolume: 1777, // keine Handelsaktivität in 1h/5m
} as const;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Synthetischer Basispreis je Item (deterministisch, ohne Bezug zu echten Preisen) */
export function basePrice(id: number): number {
  if (id === FIXTURE_CASES.aboveCap) return 300_000_000;
  if (id === FIXTURE_CASES.taxExempt) return 9_000_000;
  const r = rng(id * 7919)();
  const magnitude = [40, 300, 2_000, 15_000, 120_000, 900_000, 6_000_000][id % 7] ?? 1000;
  return Math.round(magnitude * (0.6 + r * 0.8));
}

function spreadFor(id: number, price: number) {
  const r = rng(id * 104729)();
  return Math.max(1, Math.round(price * (0.004 + r * 0.03)));
}

function volumeFor(id: number, limit: number | undefined) {
  const r = rng(id * 31337)();
  return Math.max(1, Math.round((limit ?? 50) * (0.05 + r * 0.6)));
}

function priceAt(id: number, tsSec: number, nowSec: number) {
  const base = basePrice(id);
  const wave = Math.sin((tsSec / 3600 + id) / 5) * 0.02;
  let p = base * (1 + wave);
  if (id === FIXTURE_CASES.spike && nowSec - tsSec < 3600) p *= 1.25;
  return p;
}

export function fixtureLatest(nowMs: number) {
  const now = Math.floor(nowMs / 1000);
  const data: Record<string, unknown> = {};
  for (const it of FIXTURE_MAPPING) {
    const p = priceAt(it.id, now, now);
    const s = spreadFor(it.id, p);
    const age = it.id === FIXTURE_CASES.staleLatest ? 3 * 3600 : 30 + (it.id % 240);
    data[it.id] = {
      high: Math.round(p + s / 2),
      highTime: now - age,
      low: it.id === FIXTURE_CASES.oneSided ? null : Math.round(p - s / 2),
      lowTime: it.id === FIXTURE_CASES.oneSided ? null : now - age - 20,
    };
  }
  return { data };
}

function block(nowMs: number, blockTs: number, seconds: number) {
  const now = Math.floor(nowMs / 1000);
  const data: Record<string, unknown> = {};
  for (const it of FIXTURE_MAPPING) {
    if (it.id === FIXTURE_CASES.noVolume) continue;
    const p = priceAt(it.id, blockTs + seconds / 2, now);
    const s = spreadFor(it.id, p);
    const vol = Math.max(1, Math.round((volumeFor(it.id, it.limit) * seconds) / 3600));
    data[it.id] = {
      avgHighPrice: Math.round((p + s / 2) * 100) / 100,
      highPriceVolume: vol,
      avgLowPrice: it.id === FIXTURE_CASES.oneSided ? null : Math.round((p - s / 2) * 100) / 100,
      lowPriceVolume: it.id === FIXTURE_CASES.oneSided ? 0 : Math.round(vol * 1.3),
    };
  }
  return { data, timestamp: blockTs };
}

export function fixture5m(nowMs: number) {
  const now = Math.floor(nowMs / 1000);
  return block(nowMs, now - (now % 300) - 300, 300);
}

export function fixture1h(nowMs: number, timestamp?: number) {
  const now = Math.floor(nowMs / 1000);
  const latestBlock = now - (now % 3600) - 3600;
  return block(nowMs, timestamp ?? latestBlock, 3600);
}

const LOOKBACK_STEPS: Record<string, [number, number]> = {
  "6h": [300, 72],
  "24h": [300, 288],
  "7d": [3600, 168],
  "30d": [21600, 120],
  "6m": [86400, 180],
  "1y": [86400, 365],
};

export function fixtureTimeseries(nowMs: number, id: number, lookback: string) {
  const now = Math.floor(nowMs / 1000);
  const [step, count] = LOOKBACK_STEPS[lookback] ?? [300, 72];
  const end = now - (now % step) - step;
  const data = [];
  const known = FIXTURE_MAPPING.some((m) => m.id === id);
  if (known) {
    for (let i = count - 1; i >= 0; i--) {
      const ts = end - i * step;
      // Lücken: jeder 17. Punkt ohne Handel
      const gap = (ts / step) % 17 === 0;
      const p = priceAt(id, ts, now);
      const s = spreadFor(id, p);
      data.push({
        timestamp: ts,
        avgHighPrice: gap ? null : Math.round((p + s / 2) * 100) / 100,
        avgLowPrice: gap || id === FIXTURE_CASES.oneSided ? null : Math.round((p - s / 2) * 100) / 100,
        highPriceVolume: gap ? 0 : 3 + (ts % 11),
        lowPriceVolume: gap ? 0 : 4 + (ts % 7),
      });
    }
  }
  return { data, itemId: id, startTimestamp: end - (count - 1) * step, endTimestamp: end + step, timestep: step };
}

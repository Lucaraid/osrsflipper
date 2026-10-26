import {
  AvgEntrySchema,
  LatestEntrySchema,
  MappingItemSchema,
  TimeseriesPointSchema,
  TimeseriesResponseSchema,
  type BlockAgg,
  type ItemMeta,
  type LatestEntry,
  type TimeseriesPoint,
} from "./types";

/**
 * Robuste Parser für API-Antworten: Ungültige Einzeleinträge werden verworfen und gezählt,
 * statt die ganze Antwort abzulehnen. Ist die Grundstruktur falsch, wird ein Fehler geworfen.
 */

export class InvalidResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidResponseError";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseMapping(raw: unknown): { items: ItemMeta[]; invalid: number } {
  if (!Array.isArray(raw)) throw new InvalidResponseError("/mapping: Liste erwartet");
  const items: ItemMeta[] = [];
  let invalid = 0;
  const seen = new Set<number>();
  for (const entry of raw) {
    const r = MappingItemSchema.safeParse(entry);
    if (!r.success || seen.has(r.data.id)) {
      invalid++;
      continue;
    }
    seen.add(r.data.id);
    const d = r.data;
    items.push({
      id: d.id,
      name: d.name,
      examine: d.examine,
      members: d.members,
      limit: d.limit != null && d.limit > 0 ? d.limit : null, // 0 = kein belastbares Limit
      value: d.value ?? null,
      highalch: d.highalch ?? null,
      icon: d.icon,
    });
  }
  items.sort((a, b) => a.id - b.id);
  return { items, invalid };
}

function parseIdMap<T>(raw: unknown, endpoint: string, parse: (v: unknown) => T | null): { map: Map<number, T>; invalid: number } {
  if (!isRecord(raw) || !isRecord(raw.data)) throw new InvalidResponseError(`${endpoint}: Objekt mit "data" erwartet`);
  const map = new Map<number, T>();
  let invalid = 0;
  for (const [key, value] of Object.entries(raw.data)) {
    const id = Number(key);
    if (!Number.isInteger(id) || id <= 0) {
      invalid++;
      continue;
    }
    const parsed = parse(value);
    if (parsed == null) invalid++;
    else map.set(id, parsed);
  }
  return { map, invalid };
}

export function parseLatest(raw: unknown): { map: Map<number, LatestEntry>; invalid: number } {
  return parseIdMap(raw, "/latest", (v) => {
    const r = LatestEntrySchema.safeParse(v);
    if (!r.success) return null;
    const e = r.data;
    // Preis ohne Zeitstempel (oder umgekehrt) ist nicht interpretierbar → Seite verwerfen
    return {
      high: e.high != null && e.highTime != null && e.high > 0 ? e.high : null,
      highTime: e.high != null && e.highTime != null && e.high > 0 ? e.highTime : null,
      low: e.low != null && e.lowTime != null && e.low > 0 ? e.low : null,
      lowTime: e.low != null && e.lowTime != null && e.low > 0 ? e.lowTime : null,
    };
  });
}

export function parseBlock(raw: unknown, endpoint: string): { timestamp: number | null; map: Map<number, BlockAgg>; invalid: number } {
  const { map, invalid } = parseIdMap(raw, endpoint, (v) => {
    const r = AvgEntrySchema.safeParse(v);
    if (!r.success) return null;
    const e = r.data;
    return {
      avgHigh: e.avgHighPrice != null && e.avgHighPrice > 0 && e.highPriceVolume > 0 ? e.avgHighPrice : null,
      avgLow: e.avgLowPrice != null && e.avgLowPrice > 0 && e.lowPriceVolume > 0 ? e.avgLowPrice : null,
      volHigh: e.highPriceVolume,
      volLow: e.lowPriceVolume,
    };
  });
  const ts = isRecord(raw) && typeof raw.timestamp === "number" ? raw.timestamp : null;
  return { timestamp: ts, map, invalid };
}

export function parseTimeseries(raw: unknown): {
  points: TimeseriesPoint[];
  timestep: number | null;
  start: number | null;
  end: number | null;
  invalid: number;
} {
  const r = TimeseriesResponseSchema.safeParse(raw);
  if (!r.success) throw new InvalidResponseError("/timeseries: unerwartetes Format");
  const points: TimeseriesPoint[] = [];
  let invalid = 0;
  for (const p of r.data.data) {
    const pr = TimeseriesPointSchema.safeParse(p);
    if (!pr.success) {
      invalid++;
      continue;
    }
    const d = pr.data;
    points.push({
      ...d,
      avgHighPrice: d.avgHighPrice != null && d.avgHighPrice > 0 ? d.avgHighPrice : null,
      avgLowPrice: d.avgLowPrice != null && d.avgLowPrice > 0 ? d.avgLowPrice : null,
    });
  }
  points.sort((a, b) => a.timestamp - b.timestamp);
  return {
    points,
    timestep: r.data.timestep ?? null,
    start: r.data.startTimestamp ?? null,
    end: r.data.endTimestamp ?? null,
    invalid,
  };
}

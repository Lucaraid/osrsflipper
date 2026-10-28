import { z } from "zod";

/* ------------------------------------------------------------------ *
 * Rohformate der OSRS Wiki Real-time Prices API v2 (verifiziert 2026-10-24)
 * ------------------------------------------------------------------ */

const nullableNum = z.number().finite().nullable().optional().transform((v) => (v == null ? null : v));
const volume = z.number().finite().nonnegative().nullable().optional().transform((v) => v ?? 0);

export const MappingItemSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(200),
  examine: z.string().max(500).optional().default(""),
  members: z.boolean().optional().default(false),
  limit: z.number().int().nonnegative().optional(),
  value: z.number().int().nonnegative().optional(),
  highalch: z.number().int().nonnegative().optional(),
  lowalch: z.number().int().nonnegative().optional(),
  icon: z.string().max(200).optional().default(""),
});
export type MappingItemRaw = z.infer<typeof MappingItemSchema>;

export const LatestEntrySchema = z.object({
  high: nullableNum,
  highTime: nullableNum,
  low: nullableNum,
  lowTime: nullableNum,
});
export type LatestEntry = z.infer<typeof LatestEntrySchema>;

export const AvgEntrySchema = z.object({
  avgHighPrice: nullableNum,
  highPriceVolume: volume,
  avgLowPrice: nullableNum,
  lowPriceVolume: volume,
});
export type AvgEntry = z.infer<typeof AvgEntrySchema>;

export const TimeseriesPointSchema = z.object({
  timestamp: z.number().int(),
  avgHighPrice: nullableNum,
  avgLowPrice: nullableNum,
  highPriceVolume: volume,
  lowPriceVolume: volume,
});
export type TimeseriesPoint = z.infer<typeof TimeseriesPointSchema>;

export const TimeseriesResponseSchema = z.object({
  data: z.array(z.unknown()),
  itemId: z.number().int().optional(),
  startTimestamp: z.number().int().optional(),
  endTimestamp: z.number().int().optional(),
  timestep: z.number().int().positive().optional(),
});

export const LOOKBACKS = ["6h", "24h", "7d", "30d", "6m", "1y"] as const;
export type Lookback = (typeof LOOKBACKS)[number];
export const LookbackSchema = z.enum(LOOKBACKS);

/* ------------------------------------------------------------------ *
 * Interne, an den Client ausgelieferte Modelle
 * ------------------------------------------------------------------ */

export interface ItemMeta {
  id: number;
  name: string;
  examine: string;
  members: boolean;
  /** GE-Kauflimit pro 4 h; null = nicht verfügbar */
  limit: number | null;
  value: number | null;
  highalch: number | null;
  icon: string;
}

/** Aggregat eines Zeitblocks (5 min oder 1 h) */
export interface BlockAgg {
  avgHigh: number | null;
  avgLow: number | null;
  volHigh: number;
  volLow: number;
}

/** Aus bis zu 24 stündlichen Blöcken aggregierte 24-h-Werte */
export interface DayAgg {
  /** volumengewichteter Durchschnitt der Instant-Buy-Preise */
  avgHigh: number | null;
  /** volumengewichteter Durchschnitt der Instant-Sell-Preise */
  avgLow: number | null;
  volHigh: number;
  volLow: number;
  /** Anzahl stündlicher Blöcke mit mindestens einem Trade */
  activeBlocks: number;
  /** Anzahl Blöcke mit beiden Preisseiten */
  bothSidedBlocks: number;
  /** Variationskoeffizient der stündlichen Durchschnittspreise (null bei < 6 Blöcken) */
  cv: number | null;
  /** Kleinster / grösster stündlicher Durchschnittspreis */
  minAvg: number | null;
  maxAvg: number | null;
  /** Durchschnittspreis im ältesten / jüngsten aktiven Block */
  firstAvg: number | null;
  lastAvg: number | null;
  /** Durchschnittlicher Spread (avgHigh − avgLow) über Blöcke mit beiden Seiten */
  avgSpread: number | null;
  /** Variationskoeffizient der letzten 6 aktiven Blöcke bzw. der Blöcke davor (null bei < 12 Blöcken) */
  cvRecent: number | null;
  cvPrior: number | null;
}

/**
 * 30-Tage-Grundlinie je Item aus bis zu 30 abgeschlossenen Tagesblöcken (`/24h?timestamp=`).
 * Preise sind Tagesmittel ((Ø Instant-Buy + Ø Instant-Sell) / 2). Lücken werden nicht interpoliert.
 */
export interface MonthAgg {
  /** Anzahl Tage mit Handel */
  days: number;
  /** Median der Tagesmittel über 30 bzw. 7 Tage */
  median30: number;
  median7: number | null;
  /** Robuste relative Streuung der Tagesmittel um den 30-Tage-Median (1,4826 × MAD, mind. 1 % bzw. 2 gp) */
  noise: number;
  /** Standardabweichung der täglichen Log-Renditen (null bei < 10 Renditen) */
  dailyVol: number | null;
  /** Trend der letzten 7 Tage: Steigung der Log-Preise pro Tag (null bei < 5 Tagen) */
  trend7: number | null;
  /** Veränderung erster → letzter Tag mit Handel */
  change30: number | null;
  /** Tage, deren Mittel deutlich über dem 30-Tage-Median lag (Ausreisser nach oben) */
  spikeDays: number;
  /** Median des Tagesspreads (Ø Instant-Buy − Ø Instant-Sell) */
  spread: number | null;
  /** Median des Tagesvolumens der schwächeren Seite (nur Tage mit vollständigen Jagex-Daten) */
  volWeaker: number | null;
  min: number;
  max: number;
}

export interface HistoryResponse {
  meta: {
    source: DataSourceKind;
    generatedAt: number;
    daysLoaded: number;
    daysExpected: number;
    /** Beginn des ältesten / Ende des jüngsten geladenen Tages (Unix-Sekunden) */
    from: number | null;
    to: number | null;
    error: string | null;
  };
  items: Record<string, MonthAgg>;
}

export interface MarketRow {
  id: number;
  high: number | null;
  highTime: number | null;
  low: number | null;
  lowTime: number | null;
  m5: BlockAgg | null;
  h1: BlockAgg | null;
  d1: DayAgg | null;
}

export type DataSourceKind = "wiki" | "fixtures";

export interface DatasetStatus {
  /** Zeitpunkt (ms) des letzten erfolgreichen Abrufs */
  fetchedAt: number | null;
  /** true, wenn wegen eines Fehlers ältere zwischengespeicherte Daten geliefert werden */
  stale: boolean;
  error: string | null;
}

export interface MarketSnapshotMeta {
  source: DataSourceKind;
  generatedAt: number;
  latest: DatasetStatus;
  fiveMin: DatasetStatus & { blockTimestamp: number | null };
  oneHour: DatasetStatus & { blockTimestamp: number | null };
  day: { blocksLoaded: number; blocksExpected: number; from: number | null; to: number | null; error: string | null };
  invalidEntries: number;
}

export interface MarketSnapshot {
  meta: MarketSnapshotMeta;
  rows: MarketRow[];
}

export interface ItemsResponse {
  meta: { source: DataSourceKind; fetchedAt: number | null; stale: boolean; error: string | null; count: number };
  items: ItemMeta[];
}

export interface TimeseriesResponse {
  meta: { source: DataSourceKind; fetchedAt: number | null; stale: boolean; error: string | null; lookback: Lookback; timestep: number | null; start: number | null; end: number | null };
  itemId: number;
  points: TimeseriesPoint[];
}

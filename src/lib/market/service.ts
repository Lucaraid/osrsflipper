import { aggregateDay } from "./aggregate";
import { TtlCache, type CacheResult } from "./cache";
import { aggregateMonth, HISTORY_DAYS, type DayBlock } from "./history";
import { parseBlock, parseLatest, parseMapping, parseTimeseries } from "./parse";
import type { MarketSource } from "./sources";
import type {
  BlockAgg,
  DayAgg,
  HistoryResponse,
  ItemMeta,
  ItemsResponse,
  LatestEntry,
  Lookback,
  MarketRow,
  MarketSnapshot,
  MonthAgg,
  TimeseriesResponse,
} from "./types";

/** Cache-Laufzeiten (ms), abgeleitet aus API-Doku und Cache-Control-Headern der Wiki (max-age=60). */
export const TTL = {
  mapping: 6 * 60 * 60_000,
  latest: 60_000,
  fiveMin: 60_000,
  oneHour: 5 * 60_000,
  hourBlock: 26 * 60 * 60_000, // abgeschlossene Stundenblöcke sind unveränderlich
  snapshot: 20_000,
  dayBlock: 32 * 24 * 60 * 60_000, // abgeschlossene Tage sind unveränderlich
  timeseries: { "6h": 60_000, "24h": 120_000, "7d": 10 * 60_000, "30d": 30 * 60_000, "6m": 60 * 60_000, "1y": 60 * 60_000 } as Record<Lookback, number>,
} as const;

export const DAY_BLOCKS = 24;

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class MarketService {
  private dayLoad: Promise<void> | null = null;
  private monthLoad: Promise<void> | null = null;
  /** Eigener Cache für die 30 Tagesblöcke, damit Zeitreihen-Abrufe sie nicht verdrängen */
  private readonly dayCache: TtlCache;
  private historyMemo: { key: string; value: HistoryResponse } | null = null;

  constructor(
    private readonly source: MarketSource,
    private readonly cache = new TtlCache(120),
    private readonly now: () => number = Date.now,
    private readonly dayWaitMs = 4_000,
    private readonly historyWaitMs = 8_000,
  ) {
    this.dayCache = new TtlCache(HISTORY_DAYS + 5, now);
  }

  get sourceKind() {
    return this.source.kind;
  }

  private mapping(): Promise<CacheResult<{ items: ItemMeta[]; invalid: number }>> {
    return this.cache.get("mapping", TTL.mapping, async () => parseMapping(await this.source.mapping()));
  }

  async getItems(): Promise<ItemsResponse> {
    try {
      const r = await this.mapping();
      return {
        meta: { source: this.source.kind, fetchedAt: r.fetchedAt, stale: r.stale, error: r.error, count: r.value.items.length },
        items: r.value.items,
      };
    } catch (err) {
      return { meta: { source: this.source.kind, fetchedAt: null, stale: false, error: msg(err), count: 0 }, items: [] };
    }
  }

  private hourBlock(ts: number) {
    return this.cache.get(`1h:${ts}`, TTL.hourBlock, async () => parseBlock(await this.source.oneHour(ts), "/1h"));
  }

  /** Lädt die 23 vorherigen Stundenblöcke (der aktuelle kommt aus /1h). Läuft im Hintergrund weiter. */
  private ensureDayBlocks(latestBlockTs: number): Promise<void> {
    const pending: Promise<unknown>[] = [];
    for (let k = 1; k < DAY_BLOCKS; k++) {
      const ts = latestBlockTs - k * 3600;
      const e = this.cache.peek(`1h:${ts}`);
      if (!e || e.lastError) pending.push(this.hourBlock(ts).catch(() => undefined));
    }
    if (pending.length === 0) return Promise.resolve();
    if (!this.dayLoad) {
      this.dayLoad = Promise.allSettled(pending).then(() => {
        this.dayLoad = null;
      });
    }
    return this.dayLoad;
  }

  async getSnapshot(): Promise<MarketSnapshot> {
    const r = await this.cache.get("snapshot", TTL.snapshot, () => this.buildSnapshot());
    if (!r.stale) return r.value;
    // Neuaufbau fehlgeschlagen → letzten Snapshot mit klarer Kennzeichnung ausliefern
    return { ...r.value, meta: { ...r.value.meta, latest: { ...r.value.meta.latest, stale: true, error: r.error } } };
  }

  private async buildSnapshot(): Promise<MarketSnapshot> {
    const [latestR, fiveR, hourR] = await Promise.allSettled([
      this.cache.get("latest", TTL.latest, async () => parseLatest(await this.source.latest())),
      this.cache.get("5m", TTL.fiveMin, async () => parseBlock(await this.source.fiveMin(), "/5m")),
      this.cache.get("1h", TTL.oneHour, async () => parseBlock(await this.source.oneHour(), "/1h")),
    ]);

    const latest = latestR.status === "fulfilled" ? latestR.value : null;
    const five = fiveR.status === "fulfilled" ? fiveR.value : null;
    const hour = hourR.status === "fulfilled" ? hourR.value : null;

    if (!latest) {
      // Ohne /latest gibt es keine Marktdaten → Fehler weiterreichen (Route liefert 503, UI zeigt Hinweis).
      throw new Error(`Market data unavailable: ${latestR.status === "rejected" ? msg(latestR.reason) : "unknown"}`);
    }

    // 24h-Fenster aus Stundenblöcken
    const blocks: Array<Map<number, BlockAgg>> = [];
    let dayError: string | null = null;
    const hourTs = hour?.value.timestamp ?? null;
    if (hour && hourTs != null) {
      const load = this.ensureDayBlocks(hourTs);
      await Promise.race([load, new Promise((r) => setTimeout(r, this.dayWaitMs))]);
      for (let k = DAY_BLOCKS - 1; k >= 1; k--) {
        const e = this.cache.peek<{ map: Map<number, BlockAgg> }>(`1h:${hourTs - k * 3600}`);
        if (e && !e.lastError) blocks.push(e.value.map);
      }
      blocks.push(hour.value.map);
    } else {
      dayError = "Hourly data unavailable";
    }
    const day = blocks.length > 0 ? aggregateDay(blocks) : new Map<number, DayAgg>();

    const ids = new Set<number>([...latest.value.map.keys(), ...(hour?.value.map.keys() ?? []), ...(five?.value.map.keys() ?? [])]);
    const rows: MarketRow[] = [];
    for (const id of ids) {
      const l: LatestEntry | undefined = latest.value.map.get(id);
      rows.push({
        id,
        high: l?.high ?? null,
        highTime: l?.highTime ?? null,
        low: l?.low ?? null,
        lowTime: l?.lowTime ?? null,
        m5: five?.value.map.get(id) ?? null,
        h1: hour?.value.map.get(id) ?? null,
        d1: day.get(id) ?? null,
      });
    }
    rows.sort((a, b) => a.id - b.id);

    const status = <T,>(r: PromiseSettledResult<CacheResult<T>>) =>
      r.status === "fulfilled"
        ? { fetchedAt: r.value.fetchedAt, stale: r.value.stale, error: r.value.error }
        : { fetchedAt: null, stale: false, error: msg(r.reason) };

    return {
      meta: {
        source: this.source.kind,
        generatedAt: this.now(),
        latest: status(latestR),
        fiveMin: { ...status(fiveR), blockTimestamp: five?.value.timestamp ?? null },
        oneHour: { ...status(hourR), blockTimestamp: hourTs },
        day: {
          blocksLoaded: blocks.length,
          blocksExpected: DAY_BLOCKS,
          from: hourTs != null ? hourTs - (DAY_BLOCKS - 1) * 3600 : null,
          to: hourTs != null ? hourTs + 3600 : null,
          error: dayError,
        },
        invalidEntries: latest.value.invalid + (five?.value.invalid ?? 0) + (hour?.value.invalid ?? 0),
      },
      rows,
    };
  }

  /** Mitternacht UTC (Unix-Sekunden) der letzten HISTORY_DAYS abgeschlossenen Tage, ältester zuerst. */
  historyDays(): number[] {
    const today = Math.floor(this.now() / 86_400_000) * 86_400;
    return Array.from({ length: HISTORY_DAYS }, (_, i) => today - (HISTORY_DAYS - i) * 86_400);
  }

  private dayBlock(ts: number) {
    return this.dayCache.get(`24h:${ts}`, TTL.dayBlock, async () => {
      const b = parseBlock(await this.source.oneDay(ts), "/24h");
      // Noch nicht veröffentlichter Tag → nicht als leeren Block cachen
      if (b.map.size === 0) throw new Error(`Day ${new Date(ts * 1000).toISOString().slice(0, 10)} not available yet`);
      return { timestamp: ts, map: b.map };
    });
  }

  /** Lädt fehlende Tagesblöcke im Hintergrund (läuft nach Ablauf der Wartezeit weiter). */
  private ensureMonth(days: number[]): Promise<void> {
    const missing = days.filter((ts) => {
      const e = this.dayCache.peek(`24h:${ts}`);
      return !e || e.lastError;
    });
    if (missing.length === 0) return Promise.resolve();
    if (!this.monthLoad) {
      // Jüngste Tage zuerst: Trend und 7-Tage-Median sind am wichtigsten
      this.monthLoad = Promise.allSettled([...missing].reverse().map((ts) => this.dayBlock(ts))).then(() => {
        this.monthLoad = null;
      });
    }
    return this.monthLoad;
  }

  /**
   * 30-Tage-Grundlinie aller Items. Liefert nach höchstens `historyWaitMs` auch einen Teilstand
   * (meta.daysLoaded < daysExpected); der Client fragt dann häufiger nach.
   */
  async getHistory(): Promise<HistoryResponse> {
    const days = this.historyDays();
    const load = this.ensureMonth(days);
    await Promise.race([load, new Promise((r) => setTimeout(r, this.historyWaitMs))]);

    const blocks: DayBlock[] = [];
    let error: string | null = null;
    for (const ts of days) {
      const e = this.dayCache.peek<DayBlock>(`24h:${ts}`);
      if (e && !e.lastError) blocks.push(e.value);
      else if (e?.lastError && ts < (days[days.length - 1] ?? 0)) error = e.lastError;
    }
    const key = blocks.map((b) => b.timestamp).join(",");
    if (this.historyMemo?.key === key) return { ...this.historyMemo.value, meta: { ...this.historyMemo.value.meta, error } };

    const items: Record<string, MonthAgg> = {};
    for (const [id, agg] of aggregateMonth(blocks)) items[id] = agg;
    const value: HistoryResponse = {
      meta: {
        source: this.source.kind,
        generatedAt: this.now(),
        daysLoaded: blocks.length,
        daysExpected: days.length,
        from: blocks[0]?.timestamp ?? null,
        to: blocks.length > 0 ? (blocks[blocks.length - 1] as DayBlock).timestamp + 86_400 : null,
        error,
      },
      items,
    };
    this.historyMemo = { key, value };
    return value;
  }

  async getTimeseries(id: number, lookback: Lookback): Promise<TimeseriesResponse> {
    const r = await this.cache.get(`ts:${id}:${lookback}`, TTL.timeseries[lookback], async () => parseTimeseries(await this.source.timeseries(id, lookback)));
    return {
      meta: {
        source: this.source.kind,
        fetchedAt: r.fetchedAt,
        stale: r.stale,
        error: r.error,
        lookback,
        timestep: r.value.timestep,
        start: r.value.start,
        end: r.value.end,
      },
      itemId: id,
      points: r.value.points,
    };
  }
}

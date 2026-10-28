import type { Lookback } from "./types";
import { WikiClient } from "./wiki-client";

/**
 * Datenquellen-Abstraktion. Weitere Quellen (z. B. ein eigener Aggregator) können ergänzt werden,
 * ohne Service oder UI anzupassen. Liefert ROHE API-Antworten; Parsing passiert im Service.
 */
export interface MarketSource {
  readonly kind: "wiki" | "fixtures";
  mapping(): Promise<unknown>;
  latest(): Promise<unknown>;
  fiveMin(): Promise<unknown>;
  oneHour(timestamp?: number): Promise<unknown>;
  /** Tagesblock 00:00–24:00 UTC; `timestamp` muss auf Mitternacht UTC fallen. */
  oneDay(timestamp: number): Promise<unknown>;
  timeseries(id: number, lookback: Lookback): Promise<unknown>;
}

export class WikiSource implements MarketSource {
  readonly kind = "wiki" as const;
  constructor(private readonly client: WikiClient) {}
  mapping() {
    return this.client.getJson("/mapping", { timeoutMs: 20_000 });
  }
  latest() {
    return this.client.getJson("/latest");
  }
  fiveMin() {
    return this.client.getJson("/5m");
  }
  oneHour(timestamp?: number) {
    return this.client.getJson(timestamp ? `/1h?timestamp=${Math.floor(timestamp)}` : "/1h");
  }
  oneDay(timestamp: number) {
    return this.client.getJson(`/24h?timestamp=${Math.floor(timestamp)}`, { timeoutMs: 20_000 });
  }
  timeseries(id: number, lookback: Lookback) {
    return this.client.getJson(`/timeseries?id=${Math.floor(id)}&lookback=${encodeURIComponent(lookback)}`);
  }
}

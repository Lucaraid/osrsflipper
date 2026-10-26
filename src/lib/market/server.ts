import "server-only";
import { MarketService } from "./service";
import { WikiSource, type MarketSource } from "./sources";
import type { Lookback } from "./types";
import { WikiClient } from "./wiki-client";

/**
 * Server-Singleton des Marktdatenservices. Wird von allen API-Routen geteilt,
 * damit Caches und In-flight-Deduplizierung pro Server-Instanz greifen.
 */

class FixtureSource implements MarketSource {
  readonly kind = "fixtures" as const;
  private mod = import("../../../tests/fixtures/synthetic-market");
  async mapping() {
    return (await this.mod).FIXTURE_MAPPING;
  }
  async latest() {
    return (await this.mod).fixtureLatest(Date.now());
  }
  async fiveMin() {
    return (await this.mod).fixture5m(Date.now());
  }
  async oneHour(ts?: number) {
    return (await this.mod).fixture1h(Date.now(), ts);
  }
  async timeseries(id: number, lookback: Lookback) {
    return (await this.mod).fixtureTimeseries(Date.now(), id, lookback);
  }
}

const g = globalThis as unknown as { __marketService?: MarketService };

export function getMarketService(): MarketService {
  if (!g.__marketService) {
    const source: MarketSource =
      process.env.MARKET_DATA_SOURCE === "fixtures"
        ? new FixtureSource()
        : new WikiSource(new WikiClient({ userAgent: process.env.WIKI_USER_AGENT || undefined, maxConcurrent: 3 }));
    g.__marketService = new MarketService(source);
  }
  return g.__marketService;
}

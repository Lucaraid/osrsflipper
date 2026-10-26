/**
 * Einfacher In-Memory-Cache mit
 * - TTL pro Eintrag,
 * - Deduplizierung paralleler Ladevorgänge (in-flight),
 * - "stale-on-error": Schlägt ein Neuladen fehl, wird der letzte erfolgreiche Wert
 *   mit stale=true und Fehlermeldung zurückgegeben – niemals ein erfundener Wert.
 *
 * Hinweis: Auf Serverless-Plattformen lebt der Cache pro Instanz. Das ist gewollt –
 * die Wiki-API cached zusätzlich per CDN (Cache-Control max-age=60).
 */

export interface CacheResult<T> {
  value: T;
  fetchedAt: number;
  stale: boolean;
  error: string | null;
}

interface Entry<T> {
  value: T;
  fetchedAt: number;
  lastError: string | null;
  lastAttemptAt: number;
}

export class TtlCache {
  private entries = new Map<string, Entry<unknown>>();
  private inflight = new Map<string, Promise<CacheResult<unknown>>>();
  constructor(
    private readonly maxEntries = 200,
    private readonly now: () => number = Date.now,
    private readonly errorCooldownMs = 15_000,
  ) {}

  peek<T>(key: string): Entry<T> | undefined {
    return this.entries.get(key) as Entry<T> | undefined;
  }

  clear(): void {
    this.entries.clear();
    this.inflight.clear();
  }

  async get<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<CacheResult<T>> {
    const existing = this.entries.get(key) as Entry<T> | undefined;
    if (existing && existing.lastError == null && this.now() - existing.fetchedAt < ttlMs) {
      return { value: existing.value, fetchedAt: existing.fetchedAt, stale: false, error: null };
    }
    // Nach Fehlern nicht bei jeder Anfrage erneut die API belasten: kurze Sperre (min(ttl, 15 s)).
    if (existing && existing.lastError != null && this.now() - existing.lastAttemptAt < Math.min(ttlMs, this.errorCooldownMs)) {
      return { value: existing.value, fetchedAt: existing.fetchedAt, stale: true, error: existing.lastError };
    }
    const running = this.inflight.get(key) as Promise<CacheResult<T>> | undefined;
    if (running) return running;

    const p = (async (): Promise<CacheResult<T>> => {
      try {
        const value = await loader();
        const fetchedAt = this.now();
        this.set(key, { value, fetchedAt, lastError: null, lastAttemptAt: fetchedAt });
        return { value, fetchedAt, stale: false, error: null };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (existing) {
          existing.lastError = message;
          existing.lastAttemptAt = this.now();
          return { value: existing.value, fetchedAt: existing.fetchedAt, stale: true, error: message };
        }
        throw err;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p as Promise<CacheResult<unknown>>);
    return p;
  }

  private set(key: string, entry: Entry<unknown>) {
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

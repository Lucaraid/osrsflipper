/**
 * HTTP-Client für die OSRS Wiki Real-time Prices API v2.
 * - beschreibender User-Agent (Pflicht laut API-Doku)
 * - Timeout via AbortController
 * - Wiederholungen mit exponentiellem Backoff + Jitter bei Netzwerkfehlern, Timeouts, 5xx und 429
 * - Begrenzung paralleler Anfragen (globaler Semaphor)
 */

export const WIKI_BASE_URL = "https://prices.runescape.wiki/api/v2/osrs";

export const DEFAULT_USER_AGENT = "osrs-ge-flipper (open-source GE flipping assistant; set WIKI_USER_AGENT with contact)";

export class WikiApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "WikiApiError";
  }
}

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  baseDelayMs?: number;
  signal?: AbortSignal;
}

type FetchFn = typeof fetch;

class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];
  constructor(private readonly max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class WikiClient {
  private readonly sem: Semaphore;
  constructor(
    private readonly opts: {
      baseUrl?: string;
      userAgent?: string;
      fetchFn?: FetchFn;
      maxConcurrent?: number;
      sleepFn?: (ms: number) => Promise<unknown>;
    } = {},
  ) {
    this.sem = new Semaphore(opts.maxConcurrent ?? 3);
  }

  private get fetchFn(): FetchFn {
    return this.opts.fetchFn ?? fetch;
  }

  async getJson(path: string, options: FetchOptions = {}): Promise<unknown> {
    const { timeoutMs = 12_000, retries = 3, baseDelayMs = 500 } = options;
    const url = `${this.opts.baseUrl ?? WIKI_BASE_URL}${path}`;
    const sleepFn = this.opts.sleepFn ?? sleep;
    let lastError: WikiApiError | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        const retryAfter = (lastError as WikiApiError & { retryAfterMs?: number })?.retryAfterMs;
        const backoff = retryAfter ?? baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * baseDelayMs * 0.25);
        await sleepFn(Math.min(backoff, 10_000));
      }
      try {
        return await this.sem.run(() => this.once(url, timeoutMs, options.signal));
      } catch (err) {
        lastError = err instanceof WikiApiError ? err : new WikiApiError(String(err), null, true);
        if (!lastError.retryable || options.signal?.aborted) throw lastError;
      }
    }
    throw lastError ?? new WikiApiError("Unknown error", null, false);
  }

  private async once(url: string, timeoutMs: number, outer?: AbortSignal): Promise<unknown> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error("timeout")), timeoutMs);
    const onAbort = () => ctrl.abort(outer?.reason);
    outer?.addEventListener("abort", onAbort, { once: true });
    try {
      let res: Response;
      try {
        res = await this.fetchFn(url, {
          headers: { "User-Agent": this.opts.userAgent ?? DEFAULT_USER_AGENT, Accept: "application/json" },
          signal: ctrl.signal,
          cache: "no-store",
        });
      } catch (err) {
        const timedOut = ctrl.signal.aborted && !outer?.aborted;
        throw new WikiApiError(timedOut ? `Timed out after ${timeoutMs} ms` : `Network error: ${(err as Error)?.message ?? err}`, null, !outer?.aborted);
      }
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        const e = new WikiApiError(`OSRS Wiki API responded with HTTP ${res.status}`, res.status, retryable) as WikiApiError & { retryAfterMs?: number };
        const ra = Number(res.headers.get("retry-after"));
        if (res.status === 429 && Number.isFinite(ra) && ra > 0) e.retryAfterMs = ra * 1000;
        throw e;
      }
      try {
        return await res.json();
      } catch {
        throw new WikiApiError("Invalid JSON response from the OSRS Wiki API", res.status, true);
      }
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onAbort);
    }
  }
}

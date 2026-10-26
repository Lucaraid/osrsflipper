import { describe, expect, it, vi } from "vitest";
import { TtlCache } from "@/lib/market/cache";
import { WikiApiError, WikiClient } from "@/lib/market/wiki-client";
import { MarketService } from "@/lib/market/service";
import { parseBlock, parseLatest, parseMapping, parseTimeseries, InvalidResponseError } from "@/lib/market/parse";
import type { MarketSource } from "@/lib/market/sources";

/** Kontrollierte Testdaten im Format der API v2 (keine echten Marktwerte). */
const MAPPING = [
  { examine: "x", id: 4151, members: true, lowalch: 1, limit: 70, value: 1, highalch: 1, icon: "Abyssal whip.png", name: "Abyssal whip" },
  { examine: "y", id: 2, members: true, value: 5, icon: "Steel cannonball.png", name: "Steel cannonball" }, // ohne limit
  { id: -1, name: "kaputt" },
];
const LATEST = { data: { "4151": { high: 1100, highTime: 1000, low: 1000, lowTime: 990 }, "2": { high: 200, highTime: 1000, low: null, lowTime: null }, abc: {} } };
const BLOCK = (ts: number) => ({ data: { "4151": { avgHighPrice: 1100.5, highPriceVolume: 10, avgLowPrice: 1000.25, lowPriceVolume: 12 }, "2": { avgHighPrice: null, highPriceVolume: 0, avgLowPrice: 199, lowPriceVolume: 50 } }, timestamp: ts });

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

describe("Parser", () => {
  it("Mapping: verwirft ungültige Einträge, fehlendes Limit → null", () => {
    const r = parseMapping(MAPPING);
    expect(r.items).toHaveLength(2);
    expect(r.invalid).toBe(1);
    expect(r.items.find((i) => i.id === 2)?.limit).toBeNull();
  });
  it("Latest: null-Seiten bleiben null, ungültige Keys gezählt", () => {
    const r = parseLatest(LATEST);
    expect(r.map.get(2)).toEqual({ high: 200, highTime: 1000, low: null, lowTime: null });
    expect(r.invalid).toBe(1);
  });
  it("Blöcke und Zeitreihe; Grundstrukturfehler werfen", () => {
    const b = parseBlock(BLOCK(3600), "/1h");
    expect(b.timestamp).toBe(3600);
    expect(b.map.get(2)?.avgHigh).toBeNull();
    const ts = parseTimeseries({ data: [{ timestamp: 2, avgHighPrice: 1, avgLowPrice: null, highPriceVolume: 1, lowPriceVolume: 0 }, { timestamp: 1, avgHighPrice: 2, avgLowPrice: 2, highPriceVolume: 1, lowPriceVolume: 1 }, { bad: true }], timestep: 300 });
    expect(ts.points.map((p) => p.timestamp)).toEqual([1, 2]);
    expect(ts.invalid).toBe(1);
    expect(() => parseLatest([])).toThrow(InvalidResponseError);
    expect(() => parseMapping({})).toThrow(InvalidResponseError);
  });
});

describe("WikiClient", () => {
  const noSleep = () => Promise.resolve();
  it("setzt User-Agent und liefert JSON", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ ok: 1 }));
    const c = new WikiClient({ fetchFn: fetchFn as never, userAgent: "test-agent", sleepFn: noSleep });
    expect(await c.getJson("/latest")).toEqual({ ok: 1 });
    const init = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe("test-agent");
  });
  it("wiederholt bei 5xx und 429 mit Backoff", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({}, 429, { "retry-after": "1" }))
      .mockResolvedValueOnce(jsonResponse({ ok: 2 }));
    const sleeps: number[] = [];
    const c = new WikiClient({ fetchFn: fetchFn as never, sleepFn: async (ms) => { sleeps.push(ms); } });
    expect(await c.getJson("/x", { retries: 3, baseDelayMs: 100 })).toEqual({ ok: 2 });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleeps[1]).toBe(1000); // Retry-After respektiert
  });
  it("wiederholt NICHT bei 4xx und wirft WikiApiError", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}, 404));
    const c = new WikiClient({ fetchFn: fetchFn as never, sleepFn: noSleep });
    await expect(c.getJson("/x")).rejects.toBeInstanceOf(WikiApiError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it("Timeout führt nach Wiederholungen zu Fehler", async () => {
    const fetchFn = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_, rej) => init.signal?.addEventListener("abort", () => rej(new Error("aborted")))));
    const c = new WikiClient({ fetchFn: fetchFn as never, sleepFn: noSleep });
    await expect(c.getJson("/x", { timeoutMs: 20, retries: 1 })).rejects.toThrow(/Timed out/);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it("ungültiges JSON ist ein Fehler", async () => {
    const fetchFn = vi.fn(async () => new Response("<html>", { status: 200 }));
    const c = new WikiClient({ fetchFn: fetchFn as never, sleepFn: noSleep });
    await expect(c.getJson("/x", { retries: 0 })).rejects.toThrow(/JSON/);
  });
});

describe("TtlCache", () => {
  it("cached innerhalb der TTL, dedupliziert parallele Ladevorgänge", async () => {
    let now = 0;
    const cache = new TtlCache(10, () => now);
    const loader = vi.fn(async () => "v");
    const [a, b] = await Promise.all([cache.get("k", 1000, loader), cache.get("k", 1000, loader)]);
    expect(a.value).toBe("v");
    expect(b.value).toBe("v");
    expect(loader).toHaveBeenCalledTimes(1);
    now = 500;
    await cache.get("k", 1000, loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });
  it("liefert bei Fehlern alte Daten mit stale=true, ohne Daten wird geworfen", async () => {
    let now = 0;
    const cache = new TtlCache(10, () => now, 100);
    await cache.get("k", 1000, async () => "alt");
    now = 2000;
    const r = await cache.get("k", 1000, async () => { throw new Error("down"); });
    expect(r).toMatchObject({ value: "alt", stale: true, error: "down", fetchedAt: 0 });
    // Cooldown: kein erneuter Versuch innerhalb von 100 ms
    const loader = vi.fn(async () => "neu");
    now = 2050;
    expect((await cache.get("k", 1000, loader)).stale).toBe(true);
    expect(loader).not.toHaveBeenCalled();
    now = 2200;
    expect((await cache.get("k", 1000, loader)).value).toBe("neu");
    await expect(cache.get("x", 1000, async () => { throw new Error("nix"); })).rejects.toThrow("nix");
  });
});

class FakeSource implements MarketSource {
  readonly kind = "fixtures" as const;
  calls: Record<string, number> = {};
  failLatest = false;
  private hit(k: string) { this.calls[k] = (this.calls[k] ?? 0) + 1; }
  async mapping() { this.hit("mapping"); return MAPPING; }
  async latest() { this.hit("latest"); if (this.failLatest) throw new Error("API down"); return LATEST; }
  async fiveMin() { this.hit("5m"); return BLOCK(7200 - 300); }
  async oneHour(ts?: number) { this.hit(ts ? "1h:ts" : "1h"); return BLOCK(ts ?? 86400); }
  async timeseries(id: number) { this.hit("ts"); return { data: [{ timestamp: 1, avgHighPrice: 5, avgLowPrice: 4, highPriceVolume: 1, lowPriceVolume: 1 }], itemId: id, timestep: 300, startTimestamp: 1, endTimestamp: 301 }; }
}

describe("MarketService", () => {
  it("baut einen Snapshot inkl. 24h-Aggregat und cached Abrufe", async () => {
    let now = 1_000_000;
    const src = new FakeSource();
    const svc = new MarketService(src, new TtlCache(200, () => now), () => now, 1_000);
    const s = await svc.getSnapshot();
    expect(s.rows.find((r) => r.id === 4151)?.d1?.activeBlocks).toBe(24);
    expect(s.meta.day.blocksLoaded).toBe(24);
    expect(src.calls["1h:ts"]).toBe(23);
    now += 30_000; // > Snapshot-TTL, < latest-TTL
    await svc.getSnapshot();
    expect(src.calls.latest).toBe(1);
    expect(src.calls["1h:ts"]).toBe(23); // Stundenblöcke unveränderlich gecached
  });
  it("API-Ausfall: liefert letzten Snapshot als veraltet markiert, nie erfundene Daten", async () => {
    let now = 1_000_000;
    const src = new FakeSource();
    const svc = new MarketService(src, new TtlCache(200, () => now), () => now, 100);
    const first = await svc.getSnapshot();
    src.failLatest = true;
    now += 10 * 60_000;
    const s = await svc.getSnapshot();
    expect(s.meta.latest.stale).toBe(true);
    expect(s.meta.latest.error).toMatch(/API down/);
    expect(s.rows.find((r) => r.id === 4151)?.high).toBe(first.rows.find((r) => r.id === 4151)?.high);
  });
  it("ohne jemals geladene Daten wird ein Fehler geworfen", async () => {
    const src = new FakeSource();
    src.failLatest = true;
    const svc = new MarketService(src, new TtlCache(), Date.now, 50);
    await expect(svc.getSnapshot()).rejects.toThrow(/Market data unavailable/);
  });
  it("Items und Zeitreihen", async () => {
    const svc = new MarketService(new FakeSource());
    const items = await svc.getItems();
    expect(items.meta.count).toBe(2);
    const ts = await svc.getTimeseries(4151, "24h");
    expect(ts.meta.timestep).toBe(300);
    expect(ts.points).toHaveLength(1);
  });
});

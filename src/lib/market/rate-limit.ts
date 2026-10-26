/**
 * Einfaches Fixed-Window-Rate-Limit pro Client-IP für die eigenen API-Routen.
 * In-Memory pro Server-Instanz – schützt vor Missbrauch einzelner Clients und begrenzt
 * damit indirekt die Last auf der Wiki-API (die ohnehin über den Server-Cache läuft).
 */
const WINDOW_MS = 60_000;
const buckets = new Map<string, { start: number; count: number }>();

export function clientKey(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
  return ip.slice(0, 64);
}

export function checkRateLimit(key: string, limit = Number(process.env.API_RATE_LIMIT_PER_MINUTE) || 120, now = Date.now()) {
  const b = buckets.get(key);
  if (!b || now - b.start >= WINDOW_MS) {
    buckets.set(key, { start: now, count: 1 });
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (now - v.start >= WINDOW_MS) buckets.delete(k);
    }
    return { ok: true, remaining: limit - 1, resetMs: WINDOW_MS };
  }
  b.count++;
  return { ok: b.count <= limit, remaining: Math.max(0, limit - b.count), resetMs: WINDOW_MS - (now - b.start) };
}

export function resetRateLimits() {
  buckets.clear();
}

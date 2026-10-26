import { gzipSync } from "node:zlib";
import { NextResponse } from "next/server";
import { checkRateLimit, clientKey } from "./rate-limit";

export function rateLimited(req: Request): NextResponse | null {
  const r = checkRateLimit(clientKey(req.headers));
  if (r.ok) return null;
  return NextResponse.json(
    { error: "Too many requests. Please wait a moment." },
    { status: 429, headers: { "Retry-After": String(Math.ceil(r.resetMs / 1000)) } },
  );
}

/** Fehlerantwort ohne interne Details (Stacktraces etc.). */
export function errorResponse(status: number, publicMessage: string, err?: unknown) {
  if (err) console.error("[api]", publicMessage, err instanceof Error ? err.message : err);
  return NextResponse.json({ error: publicMessage }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * JSON-Antwort mit gzip-Kompression, falls der Client sie akzeptiert.
 * (Der Marktsnapshot umfasst > 4'000 Items; komprimiert ca. 1/5 der Grösse.)
 */
export function jsonResponse(req: Request, body: unknown, headers: Record<string, string> = {}, status = 200) {
  const json = JSON.stringify(body);
  const base = { "Content-Type": "application/json; charset=utf-8", Vary: "Accept-Encoding", ...headers };
  if (json.length > 1024 && /\bgzip\b/.test(req.headers.get("accept-encoding") ?? "")) {
    return new NextResponse(new Uint8Array(gzipSync(json, { level: 6 })), { status, headers: { ...base, "Content-Encoding": "gzip" } });
  }
  return new NextResponse(json, { status, headers: base });
}

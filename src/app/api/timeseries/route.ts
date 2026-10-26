import { z } from "zod";
import { getMarketService } from "@/lib/market/server";
import { errorResponse, jsonResponse, rateLimited } from "@/lib/market/http";
import { LookbackSchema } from "@/lib/market/types";

export const dynamic = "force-dynamic";

const Query = z.object({
  id: z.coerce.number().int().positive().max(1_000_000),
  lookback: LookbackSchema,
});

export async function GET(req: Request) {
  const limited = rateLimited(req);
  if (limited) return limited;
  const url = new URL(req.url);
  const q = Query.safeParse({ id: url.searchParams.get("id"), lookback: url.searchParams.get("lookback") ?? "24h" });
  if (!q.success) return errorResponse(400, "Ungültige Parameter: id (Ganzzahl) und lookback (6h, 24h, 7d, 30d, 6m, 1y) erforderlich.");
  try {
    const res = await getMarketService().getTimeseries(q.data.id, q.data.lookback);
    return jsonResponse(req, res, { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" });
  } catch (err) {
    return errorResponse(503, "Historische Daten derzeit nicht verfügbar.", err);
  }
}

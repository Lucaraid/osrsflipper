import { getMarketService } from "@/lib/market/server";
import { errorResponse, jsonResponse, rateLimited } from "@/lib/market/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limited = rateLimited(req);
  if (limited) return limited;
  try {
    const snap = await getMarketService().getSnapshot();
    return jsonResponse(req, snap, { "Cache-Control": "public, max-age=15, s-maxage=20, stale-while-revalidate=60" });
  } catch (err) {
    return errorResponse(503, "Marktdaten derzeit nicht verfügbar. Die OSRS Wiki API ist evtl. nicht erreichbar.", err);
  }
}

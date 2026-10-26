import { getMarketService } from "@/lib/market/server";
import { errorResponse, jsonResponse, rateLimited } from "@/lib/market/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limited = rateLimited(req);
  if (limited) return limited;
  try {
    const res = await getMarketService().getItems();
    if (res.items.length === 0) return errorResponse(503, "Item-Metadaten derzeit nicht verfügbar.", res.meta.error);
    return jsonResponse(req, res, { "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" });
  } catch (err) {
    return errorResponse(503, "Item-Metadaten derzeit nicht verfügbar.", err);
  }
}

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
    return errorResponse(503, "Market data currently unavailable. The OSRS Wiki API may be unreachable.", err);
  }
}

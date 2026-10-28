import { getMarketService } from "@/lib/market/server";
import { errorResponse, jsonResponse, rateLimited } from "@/lib/market/http";

export const dynamic = "force-dynamic";

/** 30-Tage-Grundlinie aller Items (Tagesblöcke der Wiki-API, serverseitig zwischengespeichert). */
export async function GET(req: Request) {
  const limited = rateLimited(req);
  if (limited) return limited;
  try {
    const res = await getMarketService().getHistory();
    const complete = res.meta.daysLoaded >= res.meta.daysExpected - 1;
    return jsonResponse(req, res, { "Cache-Control": complete ? "public, max-age=600, s-maxage=600, stale-while-revalidate=3600" : "no-store" });
  } catch (err) {
    return errorResponse(503, "30-day history currently unavailable.", err);
  }
}

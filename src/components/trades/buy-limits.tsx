"use client";
import Link from "next/link";
import { EmptyState } from "@/components/common/indicators";
import { ItemIcon } from "@/components/common/item-icon";
import { Card, CardHeader } from "@/components/ui/card";
import { Tip } from "@/components/ui/tooltip";
import { useBuyLimits } from "@/hooks/buy-limits";
import { useItemMap } from "@/hooks/market";
import { dateTime, duration } from "@/lib/format";
import { limitLeft, limitUsed, type LimitUsage } from "@/lib/portfolio/buy-limit";
import { cn } from "@/lib/utils";

/** Kurztext „43 / 70 used · resets in 1.2 h“ für ein Item (null, wenn nichts verbraucht ist). */
export function limitStatusText(limit: number | null, u: LimitUsage | undefined, now: number): string | null {
  if (!u) return null;
  const used = limitUsed(u).toLocaleString("de-CH");
  const of = limit != null ? ` / ${limit.toLocaleString("de-CH")}` : "";
  const reset = u.resetsAt != null ? ` · resets in ${duration(u.resetsAt - now)}` : "";
  return `${used}${of} used${reset}`;
}

/** Dashboard-Karte: Items mit aktivem 4-h-Fenster, sortiert nach nächstem Reset. */
export function BuyLimitsCard() {
  const { usage, now } = useBuyLimits();
  const items = useItemMap();
  const list = [...usage.values()].sort((a, b) => (a.resetsAt ?? Infinity) - (b.resetsAt ?? Infinity) || a.itemName.localeCompare(b.itemName));

  return (
    <Card data-testid="buy-limits-card">
      <CardHeader title="Buy limits (4 h)" description="From your logged buys and open offers" />
      {list.length === 0 ? (
        <EmptyState title="No buy limits in use">Limits count from your first buy of an item and reset 4 h later.</EmptyState>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {list.map((u) => {
            const meta = items.get(u.itemId);
            const limit = meta?.limit ?? null;
            const used = limitUsed(u);
            const left = limitLeft(limit, u);
            const share = limit ? Math.min(1, used / limit) : null;
            return (
              <li key={u.itemId} className="px-4 py-1.5" data-testid="buy-limit-row">
                <div className="flex items-center gap-2">
                  <ItemIcon icon={meta?.icon} name={u.itemName} size={18} />
                  <Link href={`/items/${u.itemId}`} className="flex-1 truncate hover:text-accent">{u.itemName}</Link>
                  <Tip
                    content={
                      <div className="space-y-0.5">
                        <div>Bought in window: {u.bought.toLocaleString("de-CH")}</div>
                        {u.pending > 0 && <div>Open buy offers: {u.pending.toLocaleString("de-CH")}</div>}
                        {u.windowStart != null && <div>First buy: {dateTime(u.windowStart)}</div>}
                        {u.resetsAt != null && <div>Full limit again: {dateTime(u.resetsAt)}</div>}
                      </div>
                    }
                  >
                    <span className={cn("num cursor-help text-xs", left === 0 ? "font-semibold text-neg" : "text-muted")}>
                      {left != null ? `${left.toLocaleString("de-CH")} left` : `${used.toLocaleString("de-CH")} used`}
                    </span>
                  </Tip>
                </div>
                {share != null && (
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div className={cn("h-full rounded-full", share >= 1 ? "bg-neg" : "bg-accent")} style={{ width: `${share * 100}%` }} />
                  </div>
                )}
                <div className="mt-0.5 text-[11px] text-faint">{limitStatusText(limit, u, now)}</div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

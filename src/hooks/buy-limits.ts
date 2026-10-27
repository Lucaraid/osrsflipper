"use client";
import { useMemo } from "react";
import { buyLimitUsage, limitUsed, type LimitUsage } from "@/lib/portfolio/buy-limit";
import { useDataStore } from "@/state/data";
import { useNow } from "./use-now";

/** Kauflimit-Nutzung aus den eigenen Trades (aktualisiert sich jede Minute, damit Fenster ablaufen). */
export function useBuyLimits(): { usage: Map<number, LimitUsage>; used: Map<number, number>; now: number } {
  const trades = useDataStore((s) => s.trades);
  const now = useNow(60_000);
  return useMemo(() => {
    const usage = buyLimitUsage(trades, now);
    const used = new Map([...usage].map(([id, u]) => [id, limitUsed(u)]));
    return { usage, used, now };
  }, [trades, now]);
}

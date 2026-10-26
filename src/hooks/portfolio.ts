"use client";
import { useMemo } from "react";
import { checkPositionRules, computePortfolio, computeTimeline } from "@/lib/portfolio/portfolio";
import { useDataStore } from "@/state/data";
import { useSettings } from "@/state/settings";
import { useRowMap } from "./market";

export function usePortfolio() {
  const trades = useDataStore((s) => s.trades);
  const capital = useDataStore((s) => s.capital);
  const loaded = useDataStore((s) => s.loaded);
  const rows = useRowMap();
  const settings = useSettings();
  return useMemo(() => {
    const summary = computePortfolio(trades, capital, (id) => {
      const r = rows.get(id);
      return r ? { low: r.low, high: r.high } : null;
    });
    const timeline = computeTimeline(trades, capital);
    const offers = trades.reduce((a, t) => a + t.offers.length, 0);
    const warnings = checkPositionRules(summary, settings.rules, settings.geSlots, offers);
    return { loaded, summary, timeline, warnings, hasData: trades.length > 0 || capital.length > 0 };
  }, [trades, capital, rows, settings.rules, settings.geSlots, loaded]);
}

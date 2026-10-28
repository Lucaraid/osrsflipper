"use client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { ItemMeta, ItemsResponse, Lookback, MarketRow, MarketSnapshot, TimeseriesResponse } from "@/lib/market/types";
import { buildIndex } from "@/lib/search/search";
import { buildCandidates, type FlipCandidate } from "@/lib/analysis/scanner";
import { useSettings } from "@/state/settings";
import { useBuyLimits } from "./buy-limits";
import { useNow } from "./use-now";

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const MARKET_REFRESH_MS = 60_000;

export function useItems() {
  return useQuery({
    queryKey: ["items"],
    queryFn: ({ signal }) => getJson<ItemsResponse>("/api/items", signal),
    staleTime: 60 * 60_000,
    gcTime: Infinity,
    retry: 3,
  });
}

export function useMarket() {
  return useQuery({
    queryKey: ["market"],
    queryFn: ({ signal }) => getJson<MarketSnapshot>("/api/market", signal),
    refetchInterval: MARKET_REFRESH_MS,
    refetchIntervalInBackground: true, // nötig für lokale Alarme in Hintergrund-Tabs
    staleTime: 20_000,
    placeholderData: keepPreviousData,
    retry: 2,
  });
}

export function useTimeseries(id: number | null, lookback: Lookback) {
  return useQuery({
    queryKey: ["timeseries", id, lookback],
    queryFn: ({ signal }) => getJson<TimeseriesResponse>(`/api/timeseries?id=${id}&lookback=${lookback}`, signal),
    enabled: id != null,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useItemMap() {
  const { data } = useItems();
  return useMemo(() => {
    const map = new Map<number, ItemMeta>();
    for (const i of data?.items ?? []) map.set(i.id, i);
    return map;
  }, [data]);
}

export function useSearchIndex() {
  const { data } = useItems();
  return useMemo(() => buildIndex(data?.items ?? []), [data]);
}

export function useRowMap() {
  const { data } = useMarket();
  return useMemo(() => {
    const m = new Map<number, MarketRow>();
    for (const r of data?.rows ?? []) m.set(r.id, r);
    return m;
  }, [data]);
}

/** Alle Scanner-Kandidaten (unsortiert, ungefiltert) für ein Kapital. */
export function useCandidates(capitalOverride?: number): { candidates: FlipCandidate[]; isLoading: boolean; error: Error | null } {
  const items = useItems();
  const market = useMarket();
  const settings = useSettings();
  const capital = capitalOverride ?? settings.defaultCapital;
  const now = useNow(30_000);
  const { used } = useBuyLimits();
  const candidates = useMemo(() => {
    if (!items.data || !market.data) return [];
    return buildCandidates(items.data.items, market.data.rows, {
      nowSec: now / 1000,
      capital,
      priceOffset: settings.priceOffset,
      thresholds: settings.freshness,
      dayBlocksLoaded: market.data.meta.day.blocksLoaded,
      limitUsed: used,
    });
  }, [items.data, market.data, now, capital, settings.priceOffset, settings.freshness, used]);
  return { candidates, isLoading: items.isLoading || market.isLoading, error: (items.error ?? market.error) as Error | null };
}

"use client";
import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { TimeChart, type ChartSeries } from "@/components/charts/time-chart";
import { EmptyState, ErrorNote, Est, Gp, InfoNote, Pct, Skeleton, Stat } from "@/components/common/indicators";
import { ItemIcon } from "@/components/common/item-icon";
import { ScannerTable } from "@/components/scanner/scanner-table";
import { BuyLimitsCard } from "@/components/trades/buy-limits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { useCandidates, useItemMap, useMarket, useRowMap } from "@/hooks/market";
import { usePortfolio } from "@/hooks/portfolio";
import { applyFilters, sortCandidates } from "@/lib/analysis/scanner";
import { dateTime, duration, gp, pct } from "@/lib/format";
import { DEFAULT_FILTERS } from "@/lib/storage/settings-schema";
import { useDataStore } from "@/state/data";
import { useSettings } from "@/state/settings";

export default function DashboardPage() {
  const settings = useSettings();
  const { summary: p, timeline, warnings, hasData, loaded } = usePortfolio();
  const trades = useDataStore((s) => s.trades);
  const watchlist = useDataStore((s) => s.watchlist);
  const items = useItemMap();
  const rows = useRowMap();
  const market = useMarket();
  const capitalForScan = p.available > 0 && hasData ? p.available : settings.defaultCapital;
  const { candidates, isLoading } = useCandidates(capitalForScan);

  const top = useMemo(
    () => sortCandidates(applyFilters(candidates, { ...DEFAULT_FILTERS, minQuality: 60, maxRisk: "mittel" }), "score").slice(0, 8),
    [candidates],
  );

  const recentClosed = useMemo(
    () => p.summaries.filter((s) => s.status === "geschlossen").sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0)).slice(0, 6),
    [p.summaries],
  );
  const openOnes = useMemo(() => p.summaries.filter((s) => s.status === "offen" || s.status === "teilweise").slice(0, 6), [p.summaries]);
  const tradeName = (id: string) => trades.find((t) => t.id === id)?.itemName ?? "";

  const chart = useMemo<ChartSeries[]>(() => {
    if (timeline.length < 2) return [];
    return [
      { name: "Book value", type: "area", color: "#d9822b", data: timeline.map((t) => ({ time: Math.floor(t.time / 1000), value: t.bookValue })) },
      { name: "Realised (cumulative)", type: "line", color: "#3f9e4a", data: timeline.map((t) => ({ time: Math.floor(t.time / 1000), value: t.realizedCum })) },
    ];
  }, [timeline]);

  const favorites = watchlist.filter((w) => w.favorite).concat(watchlist.filter((w) => !w.favorite)).slice(0, 6);

  return (
    <div className="animate-fade-in space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted">Welcome back! Here are your flips at a glance.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/portfolio">Add capital</Link></Button>
          <Button asChild variant="primary" size="sm"><Link href="/history"><Plus /> Log trade</Link></Button>
        </div>
      </div>

      {loaded && !hasData && (
        <InfoNote>
          No personal data yet. Set your starting capital under <Link className="underline" href="/portfolio">Portfolio</Link> and log trades in the <Link className="underline" href="/history">Flip History</Link>. Until then the dashboard shows no made-up example values.
        </InfoNote>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="dashboard-kpis">
        <Stat label="Available capital" value={hasData ? <Gp value={p.available} short /> : "–"} hint="Cash minus capital reserved for open buy offers" />
        <Stat label="Capital in items" value={hasData ? <Gp value={p.bound} short /> : "–"} sub={`${p.openTrades} open trades`} />
        <Stat label="Portfolio value (est.)" value={hasData ? <Gp value={p.totalValue} short /> : "–"} hint="Cash + open items × (last instant-sell − tax)" />
        <Stat label="Realised profit" value={hasData ? <Gp value={p.realized} short colored /> : "–"} sub={p.roi != null ? `ROI ${pct(p.roi)}` : "ROI –"} />
        <Stat label="Win rate" value={p.winRate != null ? pct(p.winRate) : "–"} sub={`${p.closedTrades} finished flips`} />
        <Stat label="Avg profit / flip" value={p.avgProfitClosed != null ? <Gp value={p.avgProfitClosed} short colored /> : "–"} sub={p.avgHoldMs != null ? `Avg hold ${duration(p.avgHoldMs)}` : undefined} />
      </div>

      {market.error && !market.data && <ErrorNote>Market data unavailable: {market.error.message}</ErrorNote>}
      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((w) => (
            <InfoNote key={w.text} tone="warn">{w.text}</InfoNote>
          ))}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Portfolio & profit over time" description="From logged transactions (book value, no market price estimate)" />
          <CardBody>{chart.length ? <TimeChart series={chart} height={240} /> : <EmptyState title="No history yet" />}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Watchlist" actions={<Link href="/watchlist" className="text-xs text-accent">All</Link>} />
          {favorites.length === 0 ? (
            <EmptyState title="Your watchlist is empty">Mark items with ☆ in the scanner or on the item page.</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {favorites.map((w) => {
                const m = items.get(w.itemId);
                const r = rows.get(w.itemId);
                return (
                  <li key={w.itemId}>
                    <Link href={`/items/${w.itemId}`} className="flex items-center gap-2 px-4 py-1.5 text-sm hover:bg-surface-2">
                      <ItemIcon icon={m?.icon} name={m?.name ?? ""} size={18} />
                      <span className="flex-1 truncate">{m?.name ?? `#${w.itemId}`}</span>
                      {w.favorite && <Badge tone="accent">Favourite</Badge>}
                      <span className="num text-xs text-muted">{gp(r?.high)} / {gp(r?.low)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Interesting scanner results right now"
          description={`Top ranked with data quality ≥ 60 and risk ≤ medium · capital ${gp(capitalForScan)} gp`}
          actions={<Link href="/scanner" className="flex items-center gap-1 text-xs text-accent">Open scanner <ArrowRight className="size-3" /></Link>}
        />
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-7" />)}</div>
        ) : top.length === 0 ? (
          <EmptyState title="No matching results">{market.data ? "No item meets the criteria right now." : "Market data is loading or unavailable."}</EmptyState>
        ) : (
          <ScannerTable rows={top} compact />
        )}
        <p className="border-t border-border px-4 py-2 text-[11px] text-faint">Profits<Est /> are estimates from the last observed prices. Actual fills are not guaranteed.</p>
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader title="Open flips" actions={<Link href="/history" className="text-xs text-accent">History</Link>} />
          {openOnes.length === 0 ? (
            <EmptyState title="No open flips" />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {openOnes.map((s) => {
                const r = rows.get(s.itemId);
                const unit = r?.low;
                return (
                  <li key={s.tradeId} className="flex items-center gap-2 px-4 py-1.5">
                    <ItemIcon icon={items.get(s.itemId)?.icon} name={tradeName(s.tradeId)} size={18} />
                    <span className="flex-1 truncate">{tradeName(s.tradeId)}</span>
                    <span className="num text-xs text-muted">{s.openQty} pcs · cost {gp(s.openCostBasis)}</span>
                    <span className="num w-24 text-right text-xs text-muted">Inst. sell {gp(unit)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Recently finished trades" />
          {recentClosed.length === 0 ? (
            <EmptyState title="No finished trades yet" />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {recentClosed.map((s) => (
                <li key={s.tradeId} className="flex items-center gap-2 px-4 py-1.5">
                  <ItemIcon icon={items.get(s.itemId)?.icon} name={tradeName(s.tradeId)} size={18} />
                  <span className="flex-1 truncate">{tradeName(s.tradeId)}</span>
                  <span className="text-xs text-muted">{dateTime(s.lastActivity)}</span>
                  <Pct value={s.roi} className="w-16 text-right text-xs" />
                  <Gp value={s.realized} colored className="w-24 text-right" />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <BuyLimitsCard />
      </div>
    </div>
  );
}

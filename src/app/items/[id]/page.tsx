"use client";
import { ExternalLink, Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { TimeChart, type ChartSeries } from "@/components/charts/time-chart";
import { Age, EmptyState, ErrorNote, Est, Gp, InfoNote, Pct, QualityBadge, RiskBadge, Skeleton, Stat } from "@/components/common/indicators";
import { HistorySummary } from "@/components/common/history-check";
import { historyReasons } from "@/lib/analysis/scanner";
import { cn } from "@/lib/utils";
import { ItemIcon } from "@/components/common/item-icon";
import { WatchButton } from "@/components/common/watch-button";
import { ProfitCalculator } from "@/components/items/profit-calculator";
import { emptyTrade, findOpenTrade, prepareTrade, TradeEditor } from "@/components/trades/trade-editor";
import { useCalcStore } from "@/state/calc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCandidates, useItems, useMarket, useTimeseries } from "@/hooks/market";
import { useNow } from "@/hooks/use-now";
import { computeIndicators, MIN_POINTS } from "@/lib/analysis/indicators";
import { blockAvgPrice } from "@/lib/market/aggregate";
import { pointPrice } from "@/lib/analysis/indicators";
import { LOOKBACKS, type Lookback } from "@/lib/market/types";
import { computeFifo } from "@/lib/portfolio/fifo";
import type { Trade } from "@/lib/portfolio/schemas";
import { dateTime, duration, gp, gpShort, num, pct } from "@/lib/format";
import { useDataStore } from "@/state/data";
import { useSettings } from "@/state/settings";

const LOOKBACK_LABEL: Record<Lookback, string> = { "6h": "6 h", "24h": "24 h", "7d": "7 d", "30d": "30 d", "6m": "6 m", "1y": "1 y" };

function stepLabel(sec: number | null) {
  if (!sec) return "unknown";
  if (sec < 3600) return `${sec / 60} minutes`;
  if (sec < 86400) return `${sec / 3600} hour${sec === 3600 ? "" : "s"}`;
  return `${sec / 86400} day${sec === 86400 ? "" : "s"}`;
}

export default function ItemDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;
  const items = useItems();
  const market = useMarket();
  const settings = useSettings();
  const now = useNow();
  const meta = items.data?.items.find((i) => i.id === id);
  const row = market.data?.rows.find((r) => r.id === id);
  const { candidates } = useCandidates();
  const cand = candidates.find((c) => c.id === id);
  const [lookback, setLookback] = useState<Lookback>("24h");
  const ts = useTimeseries(valid ? id : null, lookback);
  const trades = useDataStore((s) => s.trades);
  const myTrades = useMemo(() => trades.filter((t) => t.itemId === id), [trades, id]);
  const [editing, setEditing] = useState<{ draft: Trade | ReturnType<typeof emptyTrade>; mode?: "buy" | "sell" } | null>(null);
  const openTrade = useMemo(() => findOpenTrade(trades, id), [trades, id]);

  const points = useMemo(() => ts.data?.points ?? [], [ts.data]);
  const ind = useMemo(() => computeIndicators(points), [points]);
  const series = useMemo<ChartSeries[]>(() => {
    if (!points.length) return [];
    const both = points.filter((p) => p.avgHighPrice != null && p.avgLowPrice != null).length;
    const out: ChartSeries[] = [];
    if (both >= Math.min(5, points.length / 4)) {
      out.push({ name: "Avg instant-buy", type: "line", color: "#d9822b", data: points.map((p) => ({ time: p.timestamp, value: p.avgHighPrice })) });
      out.push({ name: "Avg instant-sell", type: "line", color: "#3b82c4", data: points.map((p) => ({ time: p.timestamp, value: p.avgLowPrice })) });
    } else {
      out.push({
        name: "Avg price",
        type: "line",
        color: "#d9822b",
        data: points.map((p) => ({ time: p.timestamp, value: pointPrice(p) })),
      });
    }
    out.push({ name: "Volume", type: "histogram", color: "#9a8566", pane: 1, data: points.map((p) => ({ time: p.timestamp, value: p.highPriceVolume + p.lowPriceVolume })) });
    return out;
  }, [points]);

  if (!valid) return <ErrorNote>Invalid item ID.</ErrorNote>;
  if (items.isLoading) return <Skeleton className="h-40" />;
  if (items.data && !meta)
    return (
      <EmptyState title={`Item #${id} not found`} action={<Link href="/scanner" className="text-accent underline">Open Flip Scanner</Link>}>
        This item is not in the OSRS Wiki GE mapping (not tradeable or invalid ID).
      </EmptyState>
    );
  if (!meta) return <ErrorNote>Item data could not be loaded.</ErrorNote>;

  const nowSec = now / 1000;
  const h1Avg = blockAvgPrice(row?.h1);
  const wikiUrl = `https://oldschool.runescape.wiki/w/Special:Lookup?type=item&id=${meta.id}`;

  return (
    <div className="animate-fade-in space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <ItemIcon icon={meta.icon} name={meta.name} size={36} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight" data-testid="item-title">{meta.name}</h1>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span className="num">ID {meta.id}</span>
            <Badge>{meta.members ? "Members" : "F2P"}</Badge>
            {cand?.taxExempt && <Badge tone="pos">tax-free</Badge>}
            <span>Limit: {meta.limit != null ? `${gp(meta.limit)} / 4 h` : "Not available"}</span>
            {meta.highalch != null && <span>· High Alch: {gp(meta.highalch)}</span>}
          </div>
          {meta.examine && <p className="mt-0.5 text-xs italic text-faint">“{meta.examine}”</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <WatchButton itemId={meta.id} name={meta.name} withLabel className="rounded-md border border-border px-2" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const v = useCalcStore.getState().byItem[meta.id] ?? { buy: cand?.estBuy ?? null, sell: cand?.estSell ?? null, qty: cand && cand.qty > 0 ? cand.qty : null };
              setEditing(prepareTrade(trades, meta, { buy: v.buy ?? cand?.estBuy, sell: v.sell ?? cand?.estSell, qty: v.qty }));
            }}
            data-testid="item-new-trade"
          >
            <Plus /> {openTrade ? "Log sale" : "Log trade"}
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href={wikiUrl} target="_blank" rel="noreferrer">
              Wiki <ExternalLink />
            </a>
          </Button>
        </div>
      </div>

      {!row && market.data && <InfoNote tone="warn">No market observations for this item right now (not traded recently).</InfoNote>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Last instant-buy" value={<Gp value={row?.high} />} sub={<Age seconds={row?.highTime != null ? nowSec - row.highTime : null} />} hint="Last observed price someone instantly bought at" />
        <Stat label="Last instant-sell" value={<Gp value={row?.low} />} sub={<Age seconds={row?.lowTime != null ? nowSec - row.lowTime : null} />} hint="Last observed price someone instantly sold at" />
        <Stat label="Avg last hour" value={<Gp value={h1Avg} />} sub={row?.h1 ? `Vol. ${num(row.h1.volHigh + row.h1.volLow)}` : "Volume not available"} hint="Volume-weighted average of trades in the last completed 1h block" />
        <Stat label="Volume 24 h" value={row?.d1 ? num(row.d1.volHigh + row.d1.volLow) : "–"} sub={row?.d1 ? `Buy ${gpShort(row.d1.volHigh)} · Sell ${gpShort(row.d1.volLow)} · ${row.d1.activeBlocks}/24 h active` : "Not available"} />
        <Stat label="Net margin (est.)" value={<Gp value={cand?.netMargin} colored />} sub={cand?.roi != null ? `ROI ${pct(cand.roi)} · tax ${gp(cand.taxPerItem)}` : undefined} hint={`Sell = instant-buy − ${settings.priceOffset}, buy = instant-sell + ${settings.priceOffset}, after GE tax`} />
        <div className="rounded-xl border border-border bg-surface px-3 py-2.5 shadow-card">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Rating</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {cand ? (
              <>
                <QualityBadge q={cand.quality} />
                <RiskBadge r={cand.risk} />
              </>
            ) : (
              <span className="text-xs text-faint">Not available</span>
            )}
          </div>
          {cand && cand.quality.notes[0] && <div className="mt-1 truncate text-[11px] text-faint" title={cand.quality.notes.join(" ")}>{cand.quality.notes[0]}</div>}
        </div>
      </div>

      {cand?.histCheck && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" data-testid="item-history-check">
          <HistorySummary c={cand} className="text-muted" />
          {historyReasons(cand).map((r) => (
            <span key={r.text} className={cn(r.tone === "positive" ? "text-pos" : r.tone === "negative" ? "text-neg" : "text-muted")}>
              {r.tone === "positive" ? "+ " : r.tone === "negative" ? "− " : "· "}
              {r.text}
            </span>
          ))}
        </div>
      )}

      <Card>
        <CardHeader
          title="Price history"
          description={
            ts.data
              ? `Resolution: ${stepLabel(ts.data.meta.timestep)} per point · ${ind.pointsWithData}/${ind.points} points with trades${ind.gaps ? ` · ${ind.gaps} gaps (not interpolated)` : ""} · averages per time step, not single transactions`
              : "Average prices per time step from /timeseries"
          }
          actions={
            <Tabs value={lookback} onValueChange={(v) => setLookback(v as Lookback)}>
              <TabsList aria-label="Time range">
                {LOOKBACKS.map((l) => (
                  <TabsTrigger key={l} value={l} data-testid={`lookback-${l}`}>
                    {LOOKBACK_LABEL[l]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          }
        />
        <CardBody>
          {ts.error ? (
            <ErrorNote>Historical data unavailable: {ts.error.message}</ErrorNote>
          ) : ts.isLoading ? (
            <Skeleton className="h-[320px]" />
          ) : series.length === 0 ? (
            <EmptyState title="No historical data in this time range" />
          ) : (
            <>
              <TimeChart series={series} height={340} />
              <p className="mt-1 text-[11px] text-faint">Scroll/pinch = zoom, drag = pan. {ts.data?.meta.stale ? "⚠ Cached data." : ""} Fetched {dateTime(ts.data?.meta.fetchedAt)}.</p>
            </>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader title={`Market indicators (${LOOKBACK_LABEL[lookback]})`} description="Calculated from the selected time range – see /methodology" />
          <CardBody className="text-sm">
            {!ind.sufficient && <div className="mb-2"><InfoNote tone="warn">Only {ind.pointsWithData} points with trades (min {MIN_POINTS}) – stats are not reliable.</InfoNote></div>}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5" data-testid="indicators">
              <dt className="text-muted">Price change</dt><dd className="text-right"><Pct value={ind.change} sign /></dd>
              <dt className="text-muted">Average</dt><dd className="text-right"><Gp value={ind.mean} /></dd>
              <dt className="text-muted">Median</dt><dd className="text-right"><Gp value={ind.median} /></dd>
              <dt className="text-muted">Min / Max</dt><dd className="text-right num">{gpShort(ind.min)} / {gpShort(ind.max)}</dd>
              <dt className="text-muted">Range</dt><dd className="text-right"><Pct value={ind.range} colored={false} /></dd>
              <dt className="text-muted">Volatility / step</dt><dd className="text-right"><Pct value={ind.volatility} colored={false} /></dd>
              <dt className="text-muted">Deviation from avg</dt><dd className="text-right"><Pct value={ind.deviation} sign /></dd>
              <dt className="text-muted">Avg spread</dt><dd className="text-right"><Gp value={ind.avgSpread} /></dd>
              <dt className="text-muted">Total volume</dt><dd className="text-right num">{num(ind.totalVolume)}</dd>
              <dt className="text-muted">Active time steps</dt><dd className="text-right"><Pct value={ind.activeShare} colored={false} /></dd>
            </dl>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Profit Calculator" description={<>Pre-filled with estimated prices<Est /> from the latest observation</>} />
          <CardBody>
            <ProfitCalculator
              key={`${meta.id}-${cand ? "ready" : "loading"}`}
              itemId={meta.id}
              marketPrices={cand ? { buy: cand.estBuy, sell: cand.estSell } : undefined}
              buyLimit={meta.limit}
              prefill={{ buy: cand?.estBuy ?? null, sell: cand?.estSell ?? null, qty: cand && cand.qty > 0 ? cand.qty : (meta.limit ?? 1) }}
              defaultCapital={settings.defaultCapital}
            />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="My trades with this item" />
        {myTrades.length === 0 ? (
          <EmptyState title="No trades logged" />
        ) : (
          <ul className="divide-y divide-border text-sm">
            {myTrades.map((t) => {
              const s = computeFifo(t);
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-1.5">
                  <Badge>{({ leer: "empty", offen: "open", teilweise: "partly sold", geschlossen: "closed" } as const)[s.status]}</Badge>
                  <span className="num text-xs text-muted">{s.boughtQty} bought · {s.soldQty} sold · {s.openQty} open</span>
                  <span className="text-xs text-muted">avg buy {gp(s.avgBuyPrice)}</span>
                  {s.avgHoldMs != null && <span className="text-xs text-muted">avg hold {duration(s.avgHoldMs)}</span>}
                  <span className="flex-1" />
                  <Gp value={s.realized} colored />
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ draft: t })}>Edit</Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {editing && <TradeEditor key={editing.draft.id + (editing.mode ?? "")} initial={editing.draft} mode={editing.mode} open onOpenChange={(o) => !o && setEditing(null)} />}
    </div>
  );
}

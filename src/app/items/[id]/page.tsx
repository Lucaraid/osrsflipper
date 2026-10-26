"use client";
import { ExternalLink, Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { TimeChart, type ChartSeries } from "@/components/charts/time-chart";
import { Age, EmptyState, ErrorNote, Est, Gp, InfoNote, Pct, QualityBadge, RiskBadge, Skeleton, Stat } from "@/components/common/indicators";
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

const LOOKBACK_LABEL: Record<Lookback, string> = { "6h": "6 h", "24h": "24 h", "7d": "7 T", "30d": "30 T", "6m": "6 M", "1y": "1 J" };

function stepLabel(sec: number | null) {
  if (!sec) return "unbekannt";
  if (sec < 3600) return `${sec / 60} Minuten`;
  if (sec < 86400) return `${sec / 3600} Stunde${sec === 3600 ? "" : "n"}`;
  return `${sec / 86400} Tag${sec === 86400 ? "" : "e"}`;
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
      out.push({ name: "Ø Instant-Buy", type: "line", color: "#d9b44a", data: points.map((p) => ({ time: p.timestamp, value: p.avgHighPrice })) });
      out.push({ name: "Ø Instant-Sell", type: "line", color: "#5b9bd5", data: points.map((p) => ({ time: p.timestamp, value: p.avgLowPrice })) });
    } else {
      out.push({
        name: "Ø Preis",
        type: "line",
        color: "#d9b44a",
        data: points.map((p) => ({ time: p.timestamp, value: pointPrice(p) })),
      });
    }
    out.push({ name: "Volumen", type: "histogram", color: "#5d6573", pane: 1, data: points.map((p) => ({ time: p.timestamp, value: p.highPriceVolume + p.lowPriceVolume })) });
    return out;
  }, [points]);

  if (!valid) return <ErrorNote>Ungültige Item-ID.</ErrorNote>;
  if (items.isLoading) return <Skeleton className="h-40" />;
  if (items.data && !meta)
    return (
      <EmptyState title={`Item #${id} nicht gefunden`} action={<Link href="/items" className="text-accent underline">Zum Item Explorer</Link>}>
        Das Item ist nicht im GE-Mapping der OSRS Wiki enthalten (nicht handelbar oder ungültige ID).
      </EmptyState>
    );
  if (!meta) return <ErrorNote>Item-Daten konnten nicht geladen werden.</ErrorNote>;

  const nowSec = now / 1000;
  const h1Avg = blockAvgPrice(row?.h1);
  const wikiUrl = `https://oldschool.runescape.wiki/w/Special:Lookup?type=item&id=${meta.id}`;

  return (
    <div className="animate-fade-in space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <ItemIcon icon={meta.icon} name={meta.name} size={36} />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight" data-testid="item-title">{meta.name}</h1>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span className="num">ID {meta.id}</span>
            <Badge>{meta.members ? "Members" : "F2P"}</Badge>
            {cand?.taxExempt && <Badge tone="pos">steuerfrei</Badge>}
            <span>Limit: {meta.limit != null ? `${gp(meta.limit)} / 4 h` : "Nicht verfügbar"}</span>
            {meta.highalch != null && <span>· High Alch: {gp(meta.highalch)}</span>}
          </div>
          {meta.examine && <p className="mt-0.5 text-xs italic text-faint">„{meta.examine}“</p>}
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
            <Plus /> {openTrade ? "Verkauf erfassen" : "Trade erfassen"}
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href={wikiUrl} target="_blank" rel="noreferrer">
              Wiki <ExternalLink />
            </a>
          </Button>
        </div>
      </div>

      {!row && market.data && <InfoNote tone="warn">Für dieses Item liegen aktuell keine Marktbeobachtungen vor (in letzter Zeit nicht gehandelt).</InfoNote>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Letzter Instant-Buy" value={<Gp value={row?.high} />} sub={<Age seconds={row?.highTime != null ? nowSec - row.highTime : null} />} hint="Zuletzt beobachteter Preis, zu dem jemand sofort gekauft hat" />
        <Stat label="Letzter Instant-Sell" value={<Gp value={row?.low} />} sub={<Age seconds={row?.lowTime != null ? nowSec - row.lowTime : null} />} hint="Zuletzt beobachteter Preis, zu dem jemand sofort verkauft hat" />
        <Stat label="Ø letzte Stunde" value={<Gp value={h1Avg} />} sub={row?.h1 ? `Vol. ${num(row.h1.volHigh + row.h1.volLow)}` : "Volumen nicht verfügbar"} hint="Volumengewichteter Durchschnitt ausgeführter Trades im letzten abgeschlossenen 1h-Block" />
        <Stat label="Volumen 24 h" value={row?.d1 ? num(row.d1.volHigh + row.d1.volLow) : "–"} sub={row?.d1 ? `Buy ${gpShort(row.d1.volHigh)} · Sell ${gpShort(row.d1.volLow)} · ${row.d1.activeBlocks}/24 h aktiv` : "Nicht verfügbar"} />
        <Stat label="Marge netto (gesch.)" value={<Gp value={cand?.netMargin} colored />} sub={cand?.roi != null ? `ROI ${pct(cand.roi)} · Steuer ${gp(cand.taxPerItem)}` : undefined} hint={`Verkauf = Instant-Buy − ${settings.priceOffset}, Kauf = Instant-Sell + ${settings.priceOffset}, nach GE-Steuer`} />
        <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Bewertung</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {cand ? (
              <>
                <QualityBadge q={cand.quality} />
                <RiskBadge r={cand.risk} />
              </>
            ) : (
              <span className="text-xs text-faint">Nicht verfügbar</span>
            )}
          </div>
          {cand && cand.quality.notes[0] && <div className="mt-1 truncate text-[11px] text-faint" title={cand.quality.notes.join(" ")}>{cand.quality.notes[0]}</div>}
        </div>
      </div>

      <Card>
        <CardHeader
          title="Historischer Preisverlauf"
          description={
            ts.data
              ? `Auflösung: ${stepLabel(ts.data.meta.timestep)} je Punkt · ${ind.pointsWithData}/${ind.points} Punkte mit Handel${ind.gaps ? ` · ${ind.gaps} Lücken (nicht interpoliert)` : ""} · Durchschnitte pro Zeitschritt, keine Einzeltransaktionen`
              : "Durchschnittspreise je Zeitschritt aus /timeseries"
          }
          actions={
            <Tabs value={lookback} onValueChange={(v) => setLookback(v as Lookback)}>
              <TabsList aria-label="Zeitraum">
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
            <ErrorNote>Historische Daten nicht verfügbar: {ts.error.message}</ErrorNote>
          ) : ts.isLoading ? (
            <Skeleton className="h-[320px]" />
          ) : series.length === 0 ? (
            <EmptyState title="Keine historischen Daten in diesem Zeitraum" />
          ) : (
            <>
              <TimeChart series={series} height={340} />
              <p className="mt-1 text-[11px] text-faint">Mausrad/Pinch = Zoom, Ziehen = verschieben. {ts.data?.meta.stale ? "⚠ Zwischengespeicherte Daten." : ""} Abgerufen {dateTime(ts.data?.meta.fetchedAt)}.</p>
            </>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader title={`Marktindikatoren (${LOOKBACK_LABEL[lookback]})`} description="Berechnet aus der gewählten Zeitreihe – Methodik siehe /methodik" />
          <CardBody className="text-sm">
            {!ind.sufficient && <div className="mb-2"><InfoNote tone="warn">Nur {ind.pointsWithData} Punkte mit Handel (min. {MIN_POINTS}) – Statistiken sind nicht belastbar.</InfoNote></div>}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5" data-testid="indicators">
              <dt className="text-muted">Preisänderung</dt><dd className="text-right"><Pct value={ind.change} sign /></dd>
              <dt className="text-muted">Durchschnitt</dt><dd className="text-right"><Gp value={ind.mean} /></dd>
              <dt className="text-muted">Median</dt><dd className="text-right"><Gp value={ind.median} /></dd>
              <dt className="text-muted">Min / Max</dt><dd className="text-right num">{gpShort(ind.min)} / {gpShort(ind.max)}</dd>
              <dt className="text-muted">Schwankungsbreite</dt><dd className="text-right"><Pct value={ind.range} colored={false} /></dd>
              <dt className="text-muted">Volatilität / Schritt</dt><dd className="text-right"><Pct value={ind.volatility} colored={false} /></dd>
              <dt className="text-muted">Abweichung vom Ø</dt><dd className="text-right"><Pct value={ind.deviation} sign /></dd>
              <dt className="text-muted">Ø Spread</dt><dd className="text-right"><Gp value={ind.avgSpread} /></dd>
              <dt className="text-muted">Volumen gesamt</dt><dd className="text-right num">{num(ind.totalVolume)}</dd>
              <dt className="text-muted">Aktive Zeitschritte</dt><dd className="text-right"><Pct value={ind.activeShare} colored={false} /></dd>
            </dl>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Profit-Rechner" description={<>Vorbelegt mit geschätzten Preisen<Est /> aus der letzten Beobachtung</>} />
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
        <CardHeader title="Meine Trades mit diesem Item" />
        {myTrades.length === 0 ? (
          <EmptyState title="Keine Trades erfasst" />
        ) : (
          <ul className="divide-y divide-border text-sm">
            {myTrades.map((t) => {
              const s = computeFifo(t);
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-1.5">
                  <Badge>{s.status}</Badge>
                  <span className="num text-xs text-muted">{s.boughtQty} gekauft · {s.soldQty} verkauft · {s.openQty} offen</span>
                  <span className="text-xs text-muted">Ø Kauf {gp(s.avgBuyPrice)}</span>
                  {s.avgHoldMs != null && <span className="text-xs text-muted">Haltedauer Ø {duration(s.avgHoldMs)}</span>}
                  <span className="flex-1" />
                  <Gp value={s.realized} colored />
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ draft: t })}>Bearbeiten</Button>
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

"use client";
import { Calculator, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Age, EmptyState, ErrorNote, Est, Gp, InfoNote, PageHeader, Pct, QualityBadge, RiskBadge, Skeleton } from "@/components/common/indicators";
import { ItemIcon } from "@/components/common/item-icon";
import { WatchButton } from "@/components/common/watch-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AmountInput, Field, Select } from "@/components/ui/input";
import { Tip } from "@/components/ui/tooltip";
import { useCandidates, useMarket } from "@/hooks/market";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePortfolio } from "@/hooks/portfolio";
import { topBuys, TOP_MIN_QUALITY, type TopPick } from "@/lib/analysis/top";
import { gp, gpShort } from "@/lib/format";
import { newId } from "@/lib/storage/db";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/state/data";
import { useSettings, useSettingsStore } from "@/state/settings";
import { toast } from "@/state/toasts";

function PickCard({ p, rank }: { p: TopPick; rank: number }) {
  const saveTrade = useDataStore((s) => s.saveTrade);
  const [busy, setBusy] = useState(false);
  const c = p.c;
  const reasons = c.reasons.filter((r) => r.tone !== "neutral").slice(0, 3);

  const createOffer = async () => {
    if (c.estBuy == null) return;
    setBusy(true);
    const now = Date.now();
    const res = await saveTrade(
      { id: newId(), itemId: c.id, itemName: c.name, createdAt: now, updatedAt: now, lots: [], sales: [], offers: [{ id: newId(), date: now, quantity: p.qty, price: c.estBuy }], notes: "From Top 10 Buys", history: [] },
      "created",
      `Buy offer ${p.qty} × ${c.estBuy} gp from Top 10`,
    );
    setBusy(false);
    if (res.ok) toast(`Buy offer for ${c.name} logged (${p.qty} × ${gp(c.estBuy)} gp). Once it fills, click “Filled → buy” in the Flip History.`, "pos");
    else toast(res.errors.join(" "), "neg");
  };

  return (
    <li className="rounded-lg border border-border bg-surface p-3" data-testid="top-pick">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded bg-accent-soft text-xs font-bold text-accent">{rank}</span>
        <ItemIcon icon={c.icon} name={c.name} size={28} />
        <div className="min-w-0 flex-1">
          <Link href={`/items/${c.id}`} className="block truncate font-semibold hover:text-accent">{c.name}</Link>
          <div className="flex flex-wrap items-center gap-1 text-[11px] text-faint">
            <span>#{c.id}</span>
            <span>· Limit {c.limit != null ? gp(c.limit) : "–"}/4 h</span>
            <span>· prices <Age seconds={c.ageSec} /></span>
            {c.taxExempt && <Badge tone="pos">tax-free</Badge>}
          </div>
        </div>
        <WatchButton itemId={c.id} name={c.name} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <div className="text-[11px] text-faint">Buy offer<Est /></div>
          <div className="font-semibold num" data-testid="top-buy">{gp(c.estBuy)}</div>
        </div>
        <div>
          <div className="text-[11px] text-faint">Sell at<Est /></div>
          <div className="font-semibold num">{gp(c.estSell)}</div>
        </div>
        <div>
          <div className="text-[11px] text-faint">Quantity</div>
          <div className="num">
            {p.qty.toLocaleString("de-CH")}
            {p.qtyReducedByVolume && (
              <Tip content={`Quantity reduced because of 24h volume (otherwise ${c.qty.toLocaleString("de-CH")}).`}>
                <span className="ml-1 cursor-help text-warn">↓</span>
              </Tip>
            )}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-faint">Capital</div>
          <div className="num">{gpShort(p.capital)}</div>
        </div>
        <div>
          <div className="text-[11px] text-faint">Profit<Est /></div>
          <div className="font-semibold"><Gp value={p.profit} short colored /></div>
        </div>
        <div>
          <div className="text-[11px] text-faint">Margin each · ROI</div>
          <div><Gp value={p.margin} colored /> · <Pct value={p.roi} /></div>
        </div>
        <div className="col-span-2">
          <div className="text-[11px] text-faint">Trade volume 24 h</div>
          <div className="num" data-testid="top-volume">
            {gpShort(c.vol24h)} total · {gpShort(c.vol24hWeaker)} weaker side <span className="text-faint">· {p.coverage.toFixed(0)}× qty</span>
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <QualityBadge q={c.quality} />
        <RiskBadge r={c.risk} />
        {reasons.map((r) => (
          <span key={r.text} className={cn("text-[11px]", r.tone === "positive" ? "text-pos" : "text-neg")}>
            {r.tone === "positive" ? "+" : "−"} {r.text}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={createOffer} disabled={busy} data-testid="top-create-offer">
          <ShoppingCart /> Log buy offer
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href={`/calculator?id=${c.id}&buy=${c.estBuy}&sell=${c.estSell}&qty=${p.qty}`}>
            <Calculator /> Calculator
          </Link>
        </Button>
      </div>
    </li>
  );
}

interface TopConfig {
  minVolume24h: number;
  minCoverage: number;
  capitalPerFlip: number | null;
  sort: "score" | "profit" | "roi";
  hideHeld: boolean;
  minProfit?: number;
}

/** Steuerleiste + Liste; wird für „Standard“ und „High Value“ mit unterschiedlicher Konfiguration verwendet. */
function TopView({ mode, cfg, setCfg, baseCapital, capitalHint, onCapital, capitalOverride }: {
  mode: "standard" | "highValue";
  cfg: TopConfig;
  setCfg: (patch: Partial<TopConfig>) => void;
  baseCapital: number;
  capitalHint?: string;
  capitalOverride: number | null;
  onCapital: (v: number | null) => void;
}) {
  const settings = useSettings();
  const { summary } = usePortfolio();
  const trades = useDataStore((s) => s.trades);
  const market = useMarket();
  const hv = mode === "highValue";
  const defaultPerFlip = hv ? baseCapital : Math.floor(baseCapital / Math.max(1, settings.geSlots));
  const perFlip = cfg.capitalPerFlip ?? defaultPerFlip;
  const { candidates, isLoading, error } = useCandidates(perFlip);

  const held = useMemo(() => new Set(trades.filter((tr) => tr.offers.length > 0 || summary.summaries.some((s) => s.tradeId === tr.id && s.openQty > 0)).map((tr) => tr.itemId)), [trades, summary.summaries]);
  const result = useMemo(
    () => topBuys(candidates, { minVolume24h: cfg.minVolume24h, minCoverage: cfg.minCoverage, sort: cfg.sort, minProfit: cfg.minProfit, excludeIds: cfg.hideHeld ? held : undefined, limit: 10 }),
    [candidates, cfg.minVolume24h, cfg.minCoverage, cfg.sort, cfg.minProfit, cfg.hideHeld, held],
  );
  const total = result.picks.reduce((a, p) => a + p.profit, 0);
  const totalCapital = result.picks.reduce((a, p) => a + p.capital, 0);
  // High Value: Kandidaten knapp unter dem Mindestgewinn (zur Orientierung, klar getrennt)
  const nearMiss = useMemo(() => {
    if (!hv || !cfg.minProfit || result.picks.length >= 10) return [];
    const all = topBuys(candidates, { minVolume24h: cfg.minVolume24h, minCoverage: cfg.minCoverage, sort: "profit", excludeIds: cfg.hideHeld ? held : undefined, limit: 50 });
    return all.picks.filter((p) => p.profit < (cfg.minProfit ?? 0)).slice(0, 5);
  }, [hv, cfg.minProfit, cfg.minVolume24h, cfg.minCoverage, cfg.hideHeld, held, candidates, result.picks.length]);

  return (
    <>
      <Card className="mb-3 grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-7">
        <Field label="Total capital (gp)" hint={capitalOverride == null ? capitalHint : undefined}>
          <AmountInput value={capitalOverride} onChange={onCapital} placeholder={gp(baseCapital)} aria-label="Total capital" data-testid={hv ? "hv-capital" : "top-capital"} />
        </Field>
        <Field label={hv ? "Capital per trade (gp)" : "Capital per flip (gp)"} hint={cfg.capitalPerFlip == null ? (hv ? "= all capital" : `= capital ÷ ${settings.geSlots} GE slots`) : undefined}>
          <AmountInput value={cfg.capitalPerFlip} onChange={(v) => setCfg({ capitalPerFlip: v && v > 0 ? v : null })} placeholder={gp(perFlip)} aria-label="Capital per trade" />
        </Field>
        {hv && (
          <Field label="Min profit per trade (gp)" hint="conservative, after 2% tax">
            <AmountInput value={cfg.minProfit ?? 0} onChange={(v) => v != null && v >= 0 && setCfg({ minProfit: v })} aria-label="Minimum profit per trade" data-testid="hv-min-profit" />
          </Field>
        )}
        <Field label="Min volume 24 h (items)" hint="on the weaker side (buy or sell)">
          <AmountInput value={cfg.minVolume24h} onChange={(v) => v != null && v >= 0 && setCfg({ minVolume24h: Math.floor(v) })} aria-label="Minimum volume 24h" data-testid={hv ? "hv-min-volume" : "top-min-volume"} />
        </Field>
        <Field label="Volume ≥ x times qty" hint={`24h volume at least ${cfg.minCoverage}× your quantity`}>
          <AmountInput value={cfg.minCoverage} onChange={(v) => v != null && v >= 0 && setCfg({ minCoverage: Math.min(1000, v) })} aria-label="Minimum coverage" />
        </Field>
        <Field label="Sort by">
          <Select value={cfg.sort} onChange={(e) => setCfg({ sort: e.target.value as TopConfig["sort"] })} aria-label="Sort by" data-testid={hv ? "hv-sort" : "top-sort"}>
            <option value="score">Balanced</option>
            <option value="profit">Highest profit per trade</option>
            <option value="roi">Highest ROI</option>
          </Select>
        </Field>
        <label className="flex items-end gap-1.5 pb-2 text-xs text-muted">
          <input type="checkbox" checked={cfg.hideHeld} onChange={(e) => setCfg({ hideHeld: e.target.checked })} /> Hide items you already hold or have offers on
        </label>
      </Card>

      {hv && (
        <div className="mb-3">
          <InfoNote>
            High-value items often have low buy limits and little trading: offers fill slower, prices swing more, and a mistake costs more. Profit per trade = quantity (capital, GE limit, volume) × conservative margin.
          </InfoNote>
        </div>
      )}

      {market.data && market.data.meta.day.blocksLoaded < 24 && (
        <div className="mb-3"><InfoNote tone="warn">24h volume is still loading ({market.data.meta.day.blocksLoaded}/24 hours) – the list may still change.</InfoNote></div>
      )}

      {error && !candidates.length ? (
        <ErrorNote>Market data unavailable: {error.message}. No suggestions are shown without current data.</ErrorNote>
      ) : isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-48" />)}</div>
      ) : result.picks.length === 0 ? (
        <Card>
          <EmptyState title="No item meets all criteria right now">
            {hv
              ? `With ${gp(perFlip)} gp per trade no item currently reaches ${gp(cfg.minProfit ?? 0)} gp profit. Raise the capital per trade, lower the minimum profit or loosen the volume criteria.`
              : "Lower the minimum volume or the volume multiple, or raise the capital per flip."}
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-muted" data-testid={hv ? "hv-summary" : "top-summary"}>
            <span>
              {result.picks.length} suggestions · capital per {hv ? "trade" : "flip"} {gpShort(perFlip)} · total <b className="text-text">{gpShort(totalCapital)}</b> capital, est. profit <b className="text-pos">{gpShort(total)}</b> (if all offers fill and sell at the estimated price)
            </span>
            <span>Buy offer = last instant-sell + {settings.priceOffset} gp · sell = last instant-buy − {settings.priceOffset} gp · after 2% GE tax</span>
          </div>
          <ol className="grid gap-3 md:grid-cols-2" data-testid={hv ? "hv-list" : "top-list"}>
            {result.picks.map((p, i) => <PickCard key={p.c.id} p={p} rank={i + 1} />)}
          </ol>
        </>
      )}

      {nearMiss.length > 0 && (
        <Card className="mt-3" data-testid="hv-near-miss">
          <div className="border-b border-border px-4 py-2.5">
            <h2 className="text-sm font-semibold">Just below {gpShort(cfg.minProfit ?? 0)} profit per trade</h2>
            <p className="text-xs text-muted">Meet all other criteria but don’t reach the minimum profit with {gpShort(perFlip)} capital per trade – for reference only.</p>
          </div>
          <ul className="divide-y divide-border text-sm">
            {nearMiss.map((p) => (
              <li key={p.c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5">
                <ItemIcon icon={p.c.icon} name={p.c.name} size={18} />
                <Link href={`/items/${p.c.id}`} className="min-w-40 flex-1 truncate hover:text-accent">{p.c.name}</Link>
                <span className="text-xs text-muted num">{p.qty.toLocaleString("de-CH")} × {gp(p.margin)} gp</span>
                <span className="text-xs text-muted">Capital {gpShort(p.capital)}</span>
                <Gp value={p.profit} short colored className="w-16 text-right" />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="mt-3 text-[11px] text-faint">
        Criteria: positive margin also with last hour’s average prices, data quality ≥ {TOP_MIN_QUALITY}, no stale prices, 24h volume on the weaker side ≥ {gp(cfg.minVolume24h)} items and ≥ {cfg.minCoverage}× quantity (otherwise the quantity is reduced)
        {hv ? `, profit per trade ≥ ${gp(cfg.minProfit ?? 0)} gp` : ""}. Profit = quantity × the smaller of both margins.
        {" "}Filtered out: {result.excluded.noMargin} no positive margin, {result.excluded.lowVolume} too little volume, {result.excluded.quality} data quality, {result.excluded.stale} stale
        {hv ? `, ${result.excluded.lowProfit} below minimum profit` : ""}
        {cfg.hideHeld ? `, ${result.excluded.excluded} already held` : ""}.
      </p>
    </>
  );
}

export default function TopPage() {
  const settings = useSettings();
  const update = useSettingsStore((s) => s.update);
  const { summary, hasData } = usePortfolio();
  const [capitalOverride, setCapitalOverride] = useState<number | null>(null);
  const [tab, setTab] = useState<"standard" | "highValue">("standard");
  const baseCapital = capitalOverride ?? (hasData && summary.available > 0 ? summary.available : settings.defaultCapital);
  const capitalHint = hasData ? "from portfolio (available)" : "from settings";

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Top 10 Buys"
        description="The best flip candidates right now with enough trade volume in the last 24 hours. Estimates from the last observed prices – no guarantee that offers will fill."
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="mb-3" aria-label="List">
          <TabsTrigger value="standard" data-testid="tab-standard">Standard</TabsTrigger>
          <TabsTrigger value="highValue" data-testid="tab-high-value">High Value (≥ {gpShort(settings.highValue.minProfit)} profit/trade)</TabsTrigger>
        </TabsList>
        <TabsContent value="standard">
          <TopView
            mode="standard"
            cfg={settings.top}
            setCfg={(p) => update({ top: { ...settings.top, ...p } })}
            baseCapital={baseCapital}
            capitalHint={capitalHint}
            capitalOverride={capitalOverride}
            onCapital={setCapitalOverride}
          />
        </TabsContent>
        <TabsContent value="highValue">
          <TopView
            mode="highValue"
            cfg={settings.highValue}
            setCfg={(p) => update({ highValue: { ...settings.highValue, ...p, minProfit: p.minProfit ?? settings.highValue.minProfit } })}
            baseCapital={baseCapital}
            capitalHint={capitalHint}
            capitalOverride={capitalOverride}
            onCapital={setCapitalOverride}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

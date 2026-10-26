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
      { id: newId(), itemId: c.id, itemName: c.name, createdAt: now, updatedAt: now, lots: [], sales: [], offers: [{ id: newId(), date: now, quantity: p.qty, price: c.estBuy }], notes: "Aus Top 10 Käufe", history: [] },
      "erstellt",
      `Kaufangebot ${p.qty} × ${c.estBuy} gp aus Top 10`,
    );
    setBusy(false);
    if (res.ok) toast(`Kaufangebot für ${c.name} erfasst (${p.qty} × ${gp(c.estBuy)} gp). Wenn es gefüllt ist, in der Flip-Historie „Gefüllt → Kauf“ klicken.`, "pos");
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
            <span>· Preise <Age seconds={c.ageSec} /></span>
            {c.taxExempt && <Badge tone="pos">steuerfrei</Badge>}
          </div>
        </div>
        <WatchButton itemId={c.id} name={c.name} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <div className="text-[11px] text-faint">Kaufgebot<Est /></div>
          <div className="font-semibold num" data-testid="top-buy">{gp(c.estBuy)}</div>
        </div>
        <div>
          <div className="text-[11px] text-faint">Verkaufen zu<Est /></div>
          <div className="font-semibold num">{gp(c.estSell)}</div>
        </div>
        <div>
          <div className="text-[11px] text-faint">Menge</div>
          <div className="num">
            {p.qty.toLocaleString("de-CH")}
            {p.qtyReducedByVolume && (
              <Tip content={`Menge wegen des 24h-Volumens reduziert (sonst ${c.qty.toLocaleString("de-CH")}).`}>
                <span className="ml-1 cursor-help text-warn">↓</span>
              </Tip>
            )}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-faint">Kapital</div>
          <div className="num">{gpShort(p.capital)}</div>
        </div>
        <div>
          <div className="text-[11px] text-faint">Gewinn<Est /></div>
          <div className="font-semibold"><Gp value={p.profit} short colored /></div>
        </div>
        <div>
          <div className="text-[11px] text-faint">Marge/Stk · ROI</div>
          <div><Gp value={p.margin} colored /> · <Pct value={p.roi} /></div>
        </div>
        <div className="col-span-2">
          <div className="text-[11px] text-faint">Handelsvolumen 24 h</div>
          <div className="num" data-testid="top-volume">
            {gpShort(c.vol24h)} gesamt · {gpShort(c.vol24hWeaker)} schwächere Seite <span className="text-faint">· {p.coverage.toFixed(0)}× Menge</span>
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
          <ShoppingCart /> Kaufangebot erfassen
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href={`/calculator?id=${c.id}&buy=${c.estBuy}&sell=${c.estSell}&qty=${p.qty}`}>
            <Calculator /> Rechner
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
        <Field label="Gesamtkapital (gp)" hint={capitalOverride == null ? capitalHint : undefined}>
          <AmountInput value={capitalOverride} onChange={onCapital} placeholder={gp(baseCapital)} aria-label="Gesamtkapital" data-testid={hv ? "hv-capital" : "top-capital"} />
        </Field>
        <Field label={hv ? "Kapital pro Trade (gp)" : "Kapital pro Flip (gp)"} hint={cfg.capitalPerFlip == null ? (hv ? "= gesamtes Kapital" : `= Kapital ÷ ${settings.geSlots} GE-Slots`) : undefined}>
          <AmountInput value={cfg.capitalPerFlip} onChange={(v) => setCfg({ capitalPerFlip: v && v > 0 ? v : null })} placeholder={gp(perFlip)} aria-label="Kapital pro Trade" />
        </Field>
        {hv && (
          <Field label="Min. Gewinn pro Trade (gp)" hint="konservativ, nach 2 % Steuer">
            <AmountInput value={cfg.minProfit ?? 0} onChange={(v) => v != null && v >= 0 && setCfg({ minProfit: v })} aria-label="Mindestgewinn pro Trade" data-testid="hv-min-profit" />
          </Field>
        )}
        <Field label="Min. Volumen 24 h (Stück)" hint="auf der schwächeren Seite (Kauf bzw. Verkauf)">
          <AmountInput value={cfg.minVolume24h} onChange={(v) => v != null && v >= 0 && setCfg({ minVolume24h: Math.floor(v) })} aria-label="Mindestvolumen 24h" data-testid={hv ? "hv-min-volume" : "top-min-volume"} />
        </Field>
        <Field label="Volumen ≥ x-fache Menge" hint={`24h-Volumen mind. ${cfg.minCoverage}× so gross wie deine Menge`}>
          <AmountInput value={cfg.minCoverage} onChange={(v) => v != null && v >= 0 && setCfg({ minCoverage: Math.min(1000, v) })} aria-label="Mindest-Abdeckung" />
        </Field>
        <Field label="Sortierung">
          <Select value={cfg.sort} onChange={(e) => setCfg({ sort: e.target.value as TopConfig["sort"] })} aria-label="Sortierung" data-testid={hv ? "hv-sort" : "top-sort"}>
            <option value="score">Ausgewogen</option>
            <option value="profit">Höchster Gewinn pro Trade</option>
            <option value="roi">Höchster ROI</option>
          </Select>
        </Field>
        <label className="flex items-end gap-1.5 pb-2 text-xs text-muted">
          <input type="checkbox" checked={cfg.hideHeld} onChange={(e) => setCfg({ hideHeld: e.target.checked })} /> Items mit offenen Positionen/Angeboten ausblenden
        </label>
      </Card>

      {hv && (
        <div className="mb-3">
          <InfoNote>
            High-Value-Items haben oft niedrige Kauflimits und wenig Handel: Gebote werden langsamer gefüllt, Preise schwanken stärker, und ein Fehlgriff kostet mehr. Gewinn pro Trade = Menge (Kapital, GE-Limit, Volumen) × konservative Marge.
          </InfoNote>
        </div>
      )}

      {market.data && market.data.meta.day.blocksLoaded < 24 && (
        <div className="mb-3"><InfoNote tone="warn">24h-Volumen wird noch geladen ({market.data.meta.day.blocksLoaded}/24 Stunden) – die Liste kann sich gleich noch ändern.</InfoNote></div>
      )}

      {error && !candidates.length ? (
        <ErrorNote>Marktdaten nicht verfügbar: {error.message}. Ohne aktuelle Daten werden keine Empfehlungen angezeigt.</ErrorNote>
      ) : isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-48" />)}</div>
      ) : result.picks.length === 0 ? (
        <Card>
          <EmptyState title="Kein Item erfüllt aktuell alle Kriterien">
            {hv
              ? `Mit ${gp(perFlip)} gp pro Trade erreicht aktuell kein Item ${gp(cfg.minProfit ?? 0)} gp Gewinn. Erhöhe das Kapital pro Trade, senke den Mindestgewinn oder lockere die Volumen-Kriterien.`
              : "Senke das Mindestvolumen oder das x-fache der Menge, oder erhöhe das Kapital pro Flip."}
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-muted" data-testid={hv ? "hv-summary" : "top-summary"}>
            <span>
              {result.picks.length} Empfehlungen · Kapital pro {hv ? "Trade" : "Flip"} {gpShort(perFlip)} · zusammen <b className="text-text">{gpShort(totalCapital)}</b> Kapital, gesch. Gewinn <b className="text-pos">{gpShort(total)}</b> (wenn alle Gebote gefüllt und zum Schätzpreis verkauft werden)
            </span>
            <span>Kaufgebot = letzter Instant-Sell + {settings.priceOffset} gp · Verkauf = letzter Instant-Buy − {settings.priceOffset} gp · nach 2 % GE-Steuer</span>
          </div>
          <ol className="grid gap-3 md:grid-cols-2" data-testid={hv ? "hv-list" : "top-list"}>
            {result.picks.map((p, i) => <PickCard key={p.c.id} p={p} rank={i + 1} />)}
          </ol>
        </>
      )}

      {nearMiss.length > 0 && (
        <Card className="mt-3" data-testid="hv-near-miss">
          <div className="border-b border-border px-4 py-2.5">
            <h2 className="text-sm font-semibold">Knapp unter {gpShort(cfg.minProfit ?? 0)} Gewinn pro Trade</h2>
            <p className="text-xs text-muted">Erfüllen alle anderen Kriterien, erreichen mit {gpShort(perFlip)} Kapital pro Trade aber nicht den Mindestgewinn – nur zur Orientierung.</p>
          </div>
          <ul className="divide-y divide-border text-sm">
            {nearMiss.map((p) => (
              <li key={p.c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5">
                <ItemIcon icon={p.c.icon} name={p.c.name} size={18} />
                <Link href={`/items/${p.c.id}`} className="min-w-40 flex-1 truncate hover:text-accent">{p.c.name}</Link>
                <span className="text-xs text-muted num">{p.qty.toLocaleString("de-CH")} × {gp(p.margin)} gp</span>
                <span className="text-xs text-muted">Kapital {gpShort(p.capital)}</span>
                <Gp value={p.profit} short colored className="w-16 text-right" />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="mt-3 text-[11px] text-faint">
        Kriterien: positive Marge auch mit Ø-Preisen der letzten Stunde, Datenqualität ≥ {TOP_MIN_QUALITY}, keine veralteten Preise, 24h-Volumen der schwächeren Seite ≥ {gp(cfg.minVolume24h)} Stück und ≥ {cfg.minCoverage}× Menge (sonst wird die Menge reduziert)
        {hv ? `, Gewinn pro Trade ≥ ${gp(cfg.minProfit ?? 0)} gp` : ""}. Gewinn = Menge × kleinere der beiden Margen.
        {" "}Aussortiert: {result.excluded.noMargin} ohne positive Marge, {result.excluded.lowVolume} zu wenig Volumen, {result.excluded.quality} Datenqualität, {result.excluded.stale} veraltet
        {hv ? `, ${result.excluded.lowProfit} unter Mindestgewinn` : ""}
        {cfg.hideHeld ? `, ${result.excluded.excluded} bereits gehalten` : ""}.
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
  const capitalHint = hasData ? "aus Portfolio (verfügbar)" : "aus Einstellungen";

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Top 10 Käufe"
        description="Die aktuell besten Flip-Kandidaten mit ausreichend Handelsvolumen in den letzten 24 Stunden. Schätzungen auf Basis zuletzt beobachteter Preise – keine Garantie, dass Gebote gefüllt werden."
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="mb-3" aria-label="Liste">
          <TabsTrigger value="standard" data-testid="tab-standard">Standard</TabsTrigger>
          <TabsTrigger value="highValue" data-testid="tab-high-value">High Value (≥ {gpShort(settings.highValue.minProfit)} Gewinn/Trade)</TabsTrigger>
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

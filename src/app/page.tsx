"use client";
import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { TimeChart, type ChartSeries } from "@/components/charts/time-chart";
import { Age, EmptyState, ErrorNote, Est, Gp, InfoNote, Pct, Skeleton, Stat } from "@/components/common/indicators";
import { ItemIcon } from "@/components/common/item-icon";
import { ScannerTable } from "@/components/scanner/scanner-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { useCandidates, useItemMap, useMarket, useRowMap } from "@/hooks/market";
import { usePortfolio } from "@/hooks/portfolio";
import { useNow } from "@/hooks/use-now";
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
  const now = useNow();
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
      { name: "Buchwert", type: "area", color: "#d9b44a", data: timeline.map((t) => ({ time: Math.floor(t.time / 1000), value: t.bookValue })) },
      { name: "Realisiert kumuliert", type: "line", color: "#3fb87f", data: timeline.map((t) => ({ time: Math.floor(t.time / 1000), value: t.realizedCum })) },
    ];
  }, [timeline]);

  const stalePct = useMemo(() => {
    if (!market.data) return null;
    const lim = settings.freshness.staleMinutes * 60;
    const nowSec = now / 1000;
    let stale = 0;
    for (const r of market.data.rows) {
      const t = Math.max(r.highTime ?? 0, r.lowTime ?? 0);
      if (nowSec - t > lim) stale++;
    }
    return stale / market.data.rows.length;
  }, [market.data, now, settings.freshness.staleMinutes]);

  const favorites = watchlist.filter((w) => w.favorite).concat(watchlist.filter((w) => !w.favorite)).slice(0, 6);

  return (
    <div className="animate-fade-in space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
          <p className="text-xs text-muted">Persönliche Kennzahlen aus deinen lokal gespeicherten Trades · Marktdaten der OSRS Wiki</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/portfolio">Kapital buchen</Link></Button>
          <Button asChild variant="primary" size="sm"><Link href="/history"><Plus /> Trade erfassen</Link></Button>
        </div>
      </div>

      {loaded && !hasData && (
        <InfoNote>
          Noch keine persönlichen Daten. Lege unter <Link className="underline" href="/portfolio">Portfolio</Link> dein Startkapital an und erfasse Trades in der <Link className="underline" href="/history">Flip-Historie</Link>. Bis dahin zeigt das Dashboard keine erfundenen Beispielwerte.
        </InfoNote>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" data-testid="dashboard-kpis">
        <Stat label="Verfügbares Kapital" value={hasData ? <Gp value={p.available} short /> : "–"} hint="Cash minus reserviertes Kapital für offene Kaufangebote" />
        <Stat label="Gebundenes Kapital" value={hasData ? <Gp value={p.bound} short /> : "–"} sub={`${p.openTrades} offene Trades`} />
        <Stat label="Portfoliowert (gesch.)" value={hasData ? <Gp value={p.totalValue} short /> : "–"} hint="Cash + offene Stücke × (letzter Instant-Sell − Steuer)" />
        <Stat label="Realisiert netto" value={hasData ? <Gp value={p.realized} short colored /> : "–"} sub={p.roi != null ? `ROI ${pct(p.roi)}` : "ROI –"} />
        <Stat label="Unrealisiert (gesch.)" value={hasData ? <Gp value={p.unrealized} short colored /> : "–"} />
        <Stat label="Erfolgsquote" value={p.winRate != null ? pct(p.winRate) : "–"} sub={`${p.closedTrades} abgeschlossene Flips`} />
        <Stat label="Ø Gewinn / Flip" value={p.avgProfitClosed != null ? <Gp value={p.avgProfitClosed} short colored /> : "–"} />
        <Stat label="Ø Haltedauer" value={p.avgHoldMs != null ? duration(p.avgHoldMs) : "–"} hint="FIFO-gewichtet über verkaufte Stücke" />
        <Stat label="Offene Trades" value={p.openTrades} />
        <Stat label="Marktdaten" value={market.data ? <Age seconds={(now - (market.data.meta.latest.fetchedAt ?? now)) / 1000} /> : "–"} sub={stalePct != null ? `${pct(stalePct)} der Items veraltet` : undefined} hint="Alter des letzten erfolgreichen Abrufs; Anteil Items mit veralteter letzter Beobachtung" />
      </div>

      {market.error && !market.data && <ErrorNote>Marktdaten nicht verfügbar: {market.error.message}</ErrorNote>}
      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((w) => (
            <InfoNote key={w.text} tone="warn">{w.text}</InfoNote>
          ))}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Portfolio- & Gewinnentwicklung" description="Aus erfassten Transaktionen (Buchwert ohne Marktpreisschätzung)" />
          <CardBody>{chart.length ? <TimeChart series={chart} height={240} /> : <EmptyState title="Noch keine Verlaufsdaten" />}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Watchlist" actions={<Link href="/watchlist" className="text-xs text-accent">Alle</Link>} />
          {favorites.length === 0 ? (
            <EmptyState title="Watchlist ist leer">Markiere Items mit ☆ im Scanner oder Item Explorer.</EmptyState>
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
                      {w.favorite && <Badge tone="accent">Favorit</Badge>}
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
          title="Aktuell interessante Scanner-Ergebnisse"
          description={`Top-Ranking mit Datenqualität ≥ 60 und Risiko ≤ mittel · Kapital ${gp(capitalForScan)} gp`}
          actions={<Link href="/scanner" className="flex items-center gap-1 text-xs text-accent">Zum Scanner <ArrowRight className="size-3" /></Link>}
        />
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-7" />)}</div>
        ) : top.length === 0 ? (
          <EmptyState title="Keine passenden Ergebnisse">{market.data ? "Aktuell erfüllt kein Item die Kriterien." : "Marktdaten werden geladen oder sind nicht verfügbar."}</EmptyState>
        ) : (
          <ScannerTable rows={top} compact />
        )}
        <p className="border-t border-border px-4 py-2 text-[11px] text-faint">Gewinne<Est /> sind Schätzungen aus zuletzt beobachteten Preisen. Tatsächliche Ausführung nicht garantiert.</p>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader title="Offene Flips" actions={<Link href="/history" className="text-xs text-accent">Historie</Link>} />
          {openOnes.length === 0 ? (
            <EmptyState title="Keine offenen Flips" />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {openOnes.map((s) => {
                const r = rows.get(s.itemId);
                const unit = r?.low;
                return (
                  <li key={s.tradeId} className="flex items-center gap-2 px-4 py-1.5">
                    <ItemIcon icon={items.get(s.itemId)?.icon} name={tradeName(s.tradeId)} size={18} />
                    <span className="flex-1 truncate">{tradeName(s.tradeId)}</span>
                    <span className="num text-xs text-muted">{s.openQty} Stk · Einstand {gp(s.openCostBasis)}</span>
                    <span className="num w-24 text-right text-xs text-muted">Inst.-Sell {gp(unit)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Zuletzt abgeschlossene Trades" />
          {recentClosed.length === 0 ? (
            <EmptyState title="Noch keine abgeschlossenen Trades" />
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
      </div>
    </div>
  );
}

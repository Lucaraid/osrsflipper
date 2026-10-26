"use client";
import { useQueries } from "@tanstack/react-query";
import { X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { TimeChart, type ChartSeries } from "@/components/charts/time-chart";
import { EmptyState, Gp, InfoNote, PageHeader, Pct, Skeleton } from "@/components/common/indicators";
import { ItemIcon } from "@/components/common/item-icon";
import { ItemPicker } from "@/components/items/item-picker";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AmountInput, Field, Select } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCandidates, useItemMap, useItems, useMarket } from "@/hooks/market";
import { pointPrice, computeIndicators } from "@/lib/analysis/indicators";
import { ANOMALY_LABELS, ANOMALY_RULES, computeMetrics, detectAnomalies, isLiquidEnough, MIN_ACTIVE_BLOCKS, MIN_HOURLY_VOLUME, type MarketMetrics } from "@/lib/analysis/market-analysis";
import { STRATEGIES, summarizeStrategy } from "@/lib/analysis/strategy";
import type { Lookback, TimeseriesResponse } from "@/lib/market/types";
import { gp, gpShort } from "@/lib/format";
import { useSettings } from "@/state/settings";

type MetricKey = "change24h" | "change1hVs24h" | "cv24h" | "volumeRatio" | "spreadChange";

function MetricTable({ rows, metric, label, invert = false, format = "pct" }: { rows: MarketMetrics[]; metric: MetricKey; label: string; invert?: boolean; format?: "pct" | "x" }) {
  const sorted = useMemo(
    () =>
      rows
        .filter((m) => m[metric] != null)
        .sort((a, b) => (invert ? (a[metric] as number) - (b[metric] as number) : (b[metric] as number) - (a[metric] as number)) || a.id - b.id)
        .slice(0, 25),
    [rows, metric, invert],
  );
  if (!sorted.length) return <EmptyState title="Keine ausreichend gehandelten Items" />;
  return (
    <div className="overflow-x-auto">
      <table className="data-table w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
          <tr className="border-b border-border">
            <th className="px-3 py-2 font-medium">Item</th>
            <th className="px-2 py-2 text-right font-medium">{label}</th>
            <th className="px-2 py-2 text-right font-medium">Ø 1h</th>
            <th className="px-2 py-2 text-right font-medium">Ø 24h</th>
            <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Vol. 1h</th>
            <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Ø Vol./h (24h)</th>
            <th className="hidden px-2 py-2 text-right font-medium md:table-cell">Volatilität 24h</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => (
            <tr key={m.id} className="border-b border-border/60 hover:bg-surface-2/60">
              <td className="px-3 py-1.5">
                <Link href={`/items/${m.id}`} className="flex items-center gap-2 hover:text-accent">
                  <ItemIcon icon={m.icon} name={m.name} size={18} />
                  <span className="max-w-[220px] truncate">{m.name}</span>
                </Link>
              </td>
              <td className="px-2 py-1.5 text-right font-medium">{format === "x" ? <span className="num">{(m[metric] as number).toFixed(2)}×</span> : <Pct value={m[metric]} sign />}</td>
              <td className="px-2 py-1.5 text-right"><Gp value={m.price1h} /></td>
              <td className="px-2 py-1.5 text-right"><Gp value={m.price24h} /></td>
              <td className="hidden px-2 py-1.5 text-right num text-muted sm:table-cell">{gpShort(m.vol1h)}</td>
              <td className="hidden px-2 py-1.5 text-right num text-muted sm:table-cell">{gpShort(m.avgHourlyVol24h)}</td>
              <td className="hidden px-2 py-1.5 text-right md:table-cell"><Pct value={m.cv24h} colored={false} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const COMPARE_COLORS = ["#d9b44a", "#5b9bd5", "#3fb87f", "#c678dd"];
const fmtRel = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)} %`;

function Compare() {
  const [ids, setIds] = useState<number[]>([]);
  const [lookback, setLookback] = useState<Lookback>("7d");
  const items = useItemMap();
  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["timeseries", id, lookback],
      queryFn: async () => {
        const r = await fetch(`/api/timeseries?id=${id}&lookback=${lookback}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as TimeseriesResponse;
      },
      staleTime: 60_000,
    })),
  });
  const series = useMemo<ChartSeries[]>(() => {
    return queries.flatMap((q, i) => {
      if (!q.data) return [];
      const pts = q.data.points.map((p) => ({ time: p.timestamp, value: pointPrice(p) }));
      const first = pts.find((p) => p.value != null)?.value;
      if (!first) return [];
      return [{ name: items.get(ids[i] as number)?.name ?? `#${ids[i]}`, type: "line" as const, color: COMPARE_COLORS[i] ?? "#888", data: pts.map((p) => ({ time: p.time, value: p.value != null ? (p.value / first - 1) * 100 : null })) }];
    });
  }, [queries, ids, items]);
  const stats = queries.map((q) => (q.data ? computeIndicators(q.data.points) : null));

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,320px)_160px_1fr] sm:items-end">
        <Field label="Item hinzufügen (max. 4)">
          <ItemPicker value={null} onChange={(it) => it && !ids.includes(it.id) && ids.length < 4 && setIds([...ids, it.id])} placeholder="Item suchen…" />
        </Field>
        <Field label="Zeitraum">
          <Select value={lookback} onChange={(e) => setLookback(e.target.value as Lookback)}>
            <option value="24h">24 h</option>
            <option value="7d">7 Tage</option>
            <option value="30d">30 Tage</option>
            <option value="6m">6 Monate</option>
            <option value="1y">1 Jahr</option>
          </Select>
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {ids.map((id, i) => (
            <span key={id} className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs" style={{ borderColor: COMPARE_COLORS[i] }}>
              {items.get(id)?.name ?? id}
              <button type="button" onClick={() => setIds(ids.filter((x) => x !== id))} aria-label="Entfernen">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      </div>
      {ids.length === 0 ? (
        <EmptyState title="Wähle Items zum Vergleichen">Preise werden relativ zum ersten Datenpunkt (in %) dargestellt, damit unterschiedliche Preisniveaus vergleichbar sind.</EmptyState>
      ) : queries.some((q) => q.isLoading) ? (
        <Skeleton className="h-72" />
      ) : (
        <>
          <TimeChart series={series} height={300} formatValue={fmtRel} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <th className="py-1.5 font-medium">Item</th>
                  <th className="py-1.5 text-right font-medium">Änderung</th>
                  <th className="py-1.5 text-right font-medium">Volatilität/Schritt</th>
                  <th className="py-1.5 text-right font-medium">Schwankungsbreite</th>
                  <th className="py-1.5 text-right font-medium">Volumen</th>
                </tr>
              </thead>
              <tbody>
                {ids.map((id, i) => (
                  <tr key={id} className="border-b border-border/60">
                    <td className="py-1.5" style={{ color: COMPARE_COLORS[i] }}>{items.get(id)?.name ?? id}</td>
                    <td className="py-1.5 text-right"><Pct value={stats[i]?.change} sign /></td>
                    <td className="py-1.5 text-right"><Pct value={stats[i]?.volatility} colored={false} /></td>
                    <td className="py-1.5 text-right"><Pct value={stats[i]?.range} colored={false} /></td>
                    <td className="py-1.5 text-right num">{gpShort(stats[i]?.totalVolume)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Strategies() {
  const settings = useSettings();
  const [capital, setCapital] = useState<number | null>(null);
  const cap = capital ?? settings.defaultCapital;
  const perSlot = Math.floor(cap / Math.max(1, settings.geSlots));
  const { candidates, isLoading } = useCandidates(perSlot);
  const summaries = useMemo(() => STRATEGIES.map((s) => summarizeStrategy(s, candidates, cap, settings.geSlots)), [candidates, cap, settings.geSlots]);
  if (isLoading) return <Skeleton className="h-60" />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Gesamtkapital (gp)">
          <AmountInput value={capital} onChange={setCapital} placeholder={gp(settings.defaultCapital)} />
        </Field>
        <p className="max-w-xl text-xs text-muted">
          Vergleich auf Basis der <b>aktuellen Schätzungen</b>: Kapital gleichmässig auf die besten {settings.geSlots} Items (GE-Slots) je Strategie verteilt, begrenzt durch Kauflimits. Berücksichtigt nur Items mit positiver Marge auch nach Durchschnittspreisen, Datenqualität ≥ 60 und 24h-Volumen ≥ Menge. Keine Simulation vergangener Ergebnisse – historische Daten garantieren keine künftigen Gewinne.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {summaries.map((s) => (
          <Card key={s.strategy.id}>
            <CardHeader title={s.strategy.name} description={`${s.count} passende Items`} />
            <CardBody className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-1 text-xs">
                <span className="text-muted">Gesch. Gewinn (1 Runde, konservativ)</span><span className="text-right"><Gp value={s.estProfitSplit} short colored /></span>
                <span className="text-muted">Ø ROI konservativ (Top 10)</span><span className="text-right"><Pct value={s.avgRoi} /></span>
                <span className="text-muted">Ø Datenqualität</span><span className="text-right num">{s.avgQuality != null ? Math.round(s.avgQuality) : "–"}</span>
                <span className="text-muted">Ø Risiko-Score</span><span className="text-right num">{s.avgRisk != null ? Math.round(s.avgRisk) : "–"}</span>
                <span className="text-muted">Median Liquiditätsabdeckung</span><span className="text-right num">{s.medianCoverage != null ? `${s.medianCoverage.toFixed(1)}×` : "–"}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {s.picks.slice(0, 5).map((p) => (
                  <Link key={p.id} href={`/items/${p.id}`} className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-xs hover:text-accent">
                    <ItemIcon icon={p.icon} name={p.name} size={14} /> {p.name}
                  </Link>
                ))}
              </div>
              <div className="text-xs">
                <div className="text-pos">+ {s.strategy.pros.join(" · ")}</div>
                <div className="text-neg">− {s.strategy.cons.join(" · ")}</div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function MarketPage() {
  const items = useItems();
  const market = useMarket();
  const metrics = useMemo(() => (items.data && market.data ? computeMetrics(items.data.items, market.data.rows) : []), [items.data, market.data]);
  const liquid = useMemo(() => metrics.filter(isLiquidEnough), [metrics]);
  const anomalies = useMemo(() => detectAnomalies(metrics), [metrics]);
  const stable = useMemo(() => liquid.filter((m) => m.cv24h != null), [liquid]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Marktanalyse"
        description={`Marktweite Auswertung der letzten 24 Stunden (${market.data?.meta.day.blocksLoaded ?? 0}/24 Stundenblöcke). Berücksichtigt nur ausreichend gehandelte Items: ≥ ${MIN_ACTIVE_BLOCKS} aktive Stunden und ≥ ${MIN_HOURLY_VOLUME} Stück/h.`}
      />
      <div className="mb-2 text-xs text-muted">{liquid.length.toLocaleString("de-CH")} von {metrics.length.toLocaleString("de-CH")} Items mit 24h-Daten ausreichend liquide.</div>
      <Tabs defaultValue="movers">
        <TabsList className="mb-3 flex w-full flex-wrap justify-start gap-0.5 sm:w-auto">
          <TabsTrigger value="movers">Preisveränderung</TabsTrigger>
          <TabsTrigger value="hour">1h vs. 24h</TabsTrigger>
          <TabsTrigger value="vol">Volatilität</TabsTrigger>
          <TabsTrigger value="stable">Stabil</TabsTrigger>
          <TabsTrigger value="activity">Aktivität</TabsTrigger>
          <TabsTrigger value="spread">Margenänderung</TabsTrigger>
          <TabsTrigger value="anomalies">Anomalien ({anomalies.length})</TabsTrigger>
          <TabsTrigger value="strategies">Strategien</TabsTrigger>
          <TabsTrigger value="compare">Vergleich</TabsTrigger>
        </TabsList>
        {!market.data && !market.error && <Skeleton className="h-64" />}
        {market.error && !market.data && <InfoNote tone="warn">Marktdaten nicht verfügbar.</InfoNote>}
        <TabsContent value="movers">
          <div className="grid gap-3 xl:grid-cols-2">
            <Card><CardHeader title="Stärkste Anstiege (24 h)" description="Ø-Preis jüngster vs. ältester aktiver Stundenblock" /><MetricTable rows={liquid} metric="change24h" label="Δ 24h" /></Card>
            <Card><CardHeader title="Stärkste Rückgänge (24 h)" /><MetricTable rows={liquid} metric="change24h" label="Δ 24h" invert /></Card>
          </div>
        </TabsContent>
        <TabsContent value="hour">
          <div className="grid gap-3 xl:grid-cols-2">
            <Card><CardHeader title="1h über 24h-Durchschnitt" /><MetricTable rows={liquid} metric="change1hVs24h" label="Δ 1h/24h" /></Card>
            <Card><CardHeader title="1h unter 24h-Durchschnitt" /><MetricTable rows={liquid} metric="change1hVs24h" label="Δ 1h/24h" invert /></Card>
          </div>
        </TabsContent>
        <TabsContent value="vol">
          <Card><CardHeader title="Höchste historische Volatilität (24 h)" description="Variationskoeffizient der stündlichen Durchschnittspreise" /><MetricTable rows={liquid} metric="cv24h" label="Volatilität" /></Card>
        </TabsContent>
        <TabsContent value="stable">
          <Card><CardHeader title="Stabilste Preisverläufe (24 h)" description="Niedrigster Variationskoeffizient" /><MetricTable rows={stable} metric="cv24h" label="Volatilität" invert /></Card>
        </TabsContent>
        <TabsContent value="activity">
          <div className="grid gap-3 xl:grid-cols-2">
            <Card><CardHeader title="Ungewöhnlich hohe Aktivität" description="Volumen letzte Stunde ÷ Ø Stundenvolumen (24 h)" /><MetricTable rows={liquid} metric="volumeRatio" label="Verhältnis" format="x" /></Card>
            <Card><CardHeader title="Ungewöhnlich niedrige Aktivität" /><MetricTable rows={liquid} metric="volumeRatio" label="Verhältnis" format="x" invert /></Card>
          </div>
        </TabsContent>
        <TabsContent value="spread">
          <div className="grid gap-3 xl:grid-cols-2">
            <Card><CardHeader title="Spread aktuell deutlich grösser" description="Letzter Instant-Buy − Instant-Sell vs. Ø Spread 24 h" /><MetricTable rows={liquid} metric="spreadChange" label="Δ Spread" /></Card>
            <Card><CardHeader title="Spread aktuell deutlich kleiner" /><MetricTable rows={liquid} metric="spreadChange" label="Δ Spread" invert /></Card>
          </div>
        </TabsContent>
        <TabsContent value="anomalies">
          <Card>
            <CardHeader
              title="Regelbasierte Anomalieerkennung"
              description={`Regeln: |Δ 1h/24h| ≥ ${ANOMALY_RULES.priceMove * 100} % · Aktivität ≥ ${ANOMALY_RULES.activityHigh}× oder ≤ ${ANOMALY_RULES.activityLow}× · Volatilität letzte 6 h ≥ ${ANOMALY_RULES.volatilityJump}× der Zeit davor · Abweichung letzte Preise ≥ ${ANOMALY_RULES.deviation * 100} %`}
            />
            <div className="px-4 pt-3">
              <InfoNote>Eine Anomalie ist eine statistische Auffälligkeit in den verfügbaren Daten. Sie ist kein Beleg für Marktmanipulation und keine Handelsempfehlung – Ursachen können z. B. Spiel-Updates, Events oder einzelne grosse Trades sein.</InfoNote>
            </div>
            {anomalies.length === 0 ? (
              <EmptyState title="Keine Auffälligkeiten erkannt" />
            ) : (
              <ul className="divide-y divide-border text-sm" data-testid="anomalies">
                {anomalies.slice(0, 60).map((a) => (
                  <li key={`${a.id}-${a.kind}`} className="flex items-center gap-2 px-4 py-1.5">
                    <ItemIcon icon={a.icon} name={a.name} size={18} />
                    <Link href={`/items/${a.id}`} className="w-48 truncate hover:text-accent">{a.name}</Link>
                    <Badge tone="warn">{ANOMALY_LABELS[a.kind]}</Badge>
                    <span className="flex-1 text-xs text-muted">{a.text}</span>
                    <span className="num text-xs text-faint">{a.severity.toFixed(1)}×</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="strategies">
          <Strategies />
        </TabsContent>
        <TabsContent value="compare">
          <Card><CardBody><Compare /></CardBody></Card>
        </TabsContent>
      </Tabs>
      <p className="mt-3 text-[11px] text-faint">Alle Werte: volumengewichtete Durchschnitte ausgeführter Trades (OSRS Wiki /1h-Blöcke).</p>
    </div>
  );
}

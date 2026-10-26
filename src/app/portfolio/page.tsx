"use client";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { TimeChart, type ChartSeries } from "@/components/charts/time-chart";
import { Confirm } from "@/components/common/confirm";
import { EmptyState, Est, Gp, InfoNote, PageHeader, Pct, Stat } from "@/components/common/indicators";
import { ItemIcon } from "@/components/common/item-icon";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AmountInput, Field, Input, Select } from "@/components/ui/input";
import { useItemMap } from "@/hooks/market";
import { usePortfolio } from "@/hooks/portfolio";
import { dateTime, gp, pct } from "@/lib/format";
import { newId } from "@/lib/storage/db";
import { useDataStore } from "@/state/data";
import { toast } from "@/state/toasts";

export default function PortfolioPage() {
  const { summary: p, timeline, warnings, loaded, hasData } = usePortfolio();
  const capital = useDataStore((s) => s.capital);
  const addCapital = useDataStore((s) => s.addCapital);
  const deleteCapital = useDataStore((s) => s.deleteCapital);
  const items = useItemMap();
  const [amount, setAmount] = useState<number | null>(null);
  const [kind, setKind] = useState<"deposit" | "withdrawal" | "adjustment">("deposit");
  const [note, setNote] = useState("");
  const [target, setTarget] = useState<number | null>(null);

  const chart = useMemo<ChartSeries[]>(() => {
    if (timeline.length < 2) return [];
    return [
      { name: "Buchwert", type: "area", color: "#d9b44a", data: timeline.map((t) => ({ time: Math.floor(t.time / 1000), value: t.bookValue })) },
      { name: "Cash", type: "line", color: "#5b9bd5", data: timeline.map((t) => ({ time: Math.floor(t.time / 1000), value: t.cash })) },
    ];
  }, [timeline]);

  const submit = async () => {
    if (!amount || amount <= 0) return;
    const signed = kind === "withdrawal" ? -Math.abs(amount) : Math.abs(amount);
    await addCapital({ id: newId(), date: Date.now(), amount: signed, kind, note: note.slice(0, 500) });
    setAmount(null);
    setNote("");
    toast("Kapitalbuchung gespeichert.", "pos");
  };

  const setToTarget = async () => {
    if (target == null) return;
    const diff = target - p.cash;
    if (diff === 0) return;
    await addCapital({ id: newId(), date: Date.now(), amount: Math.round(diff), kind: "adjustment", note: `Cash auf ${gp(target)} gp abgeglichen` });
    setTarget(null);
    toast("Kapitalbestand angepasst.", "pos");
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Mein Portfolio" description="Kapital, offene Positionen und Gewinne – berechnet aus deinen erfassten Buchungen und Trades." />

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Cash" value={<Gp value={p.cash} short />} hint="Kapitalbuchungen − Käufe + Netto-Verkaufserlöse" />
        <Stat label="Verfügbar" value={<Gp value={p.available} short />} sub={p.reserved ? `${gp(p.reserved)} reserviert` : undefined} hint="Cash minus für offene Kaufangebote reserviertes Kapital" />
        <Stat label="Gebunden" value={<Gp value={p.bound} short />} hint="FIFO-Einstand aller offenen Stücke" />
        <Stat label="Gesamtwert (gesch.)" value={<Gp value={p.totalValue} short />} hint="Cash + offene Stücke × (letzter Instant-Sell − Steuer). Schätzung." />
        <Stat label="Realisiert" value={<Gp value={p.realized} short colored />} tone={p.realized > 0 ? "pos" : p.realized < 0 ? "neg" : undefined} sub={p.roi != null ? `ROI ${pct(p.roi)}` : undefined} />
        <Stat label="Unrealisiert (gesch.)" value={<Gp value={p.unrealized} short colored />} sub={p.unpricedPositions ? `${p.unpricedPositions} ohne Marktpreis` : undefined} />
      </div>

      {warnings.length > 0 && (
        <div className="mb-3 space-y-1" data-testid="rule-warnings">
          {warnings.map((w) => (
            <InfoNote key={w.text} tone="warn">
              {w.text}
            </InfoNote>
          ))}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Kapitalentwicklung" description="Buchwert = Cash + Einstand offener Stücke. Nur aus erfassten Transaktionen, ohne Marktpreisschätzung." />
          <CardBody>
            {chart.length ? <TimeChart series={chart} height={260} /> : <EmptyState title="Noch nicht genug Daten">Erfasse Kapital und Trades, um die Entwicklung zu sehen.</EmptyState>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Kapital buchen" />
          <CardBody className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Art">
                <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Buchungsart">
                  <option value="deposit">Einzahlung</option>
                  <option value="withdrawal">Auszahlung</option>
                  <option value="adjustment">Korrektur (+)</option>
                </Select>
              </Field>
              <Field label="Betrag (gp)">
                <AmountInput value={amount} onChange={setAmount} placeholder="z. B. 50m" aria-label="Betrag" data-testid="capital-amount" />
              </Field>
            </div>
            <Field label="Notiz">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
            </Field>
            <Button variant="primary" onClick={submit} disabled={!amount} className="w-full" data-testid="capital-submit">
              <Plus /> Buchen
            </Button>
            <div className="border-t border-border pt-3">
              <Field label="Cash manuell abgleichen auf (gp)" hint={`Aktuell: ${gp(p.cash)} gp. Erzeugt eine Korrekturbuchung über die Differenz.`}>
                <div className="flex gap-2">
                  <AmountInput value={target} onChange={setTarget} placeholder="tatsächlicher Bestand" aria-label="Zielbestand" />
                  <Button variant="outline" onClick={setToTarget} disabled={target == null}>
                    Abgleichen
                  </Button>
                </div>
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Offene Positionen" description={<>Marktwert<Est /> = Menge × (letzter Instant-Sell − GE-Steuer)</>} />
          {p.positions.length === 0 ? (
            <EmptyState title="Keine offenen Positionen">
              Positionen entstehen durch Käufe in der <Link href="/history" className="underline">Flip-Historie</Link>.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-2 py-2 text-right font-medium">Menge</th>
                    <th className="px-2 py-2 text-right font-medium">Einstand</th>
                    <th className="px-2 py-2 text-right font-medium">Marktwert<Est /></th>
                    <th className="px-2 py-2 text-right font-medium">Unrealisiert<Est /></th>
                    <th className="px-2 py-2 text-right font-medium">Anteil</th>
                  </tr>
                </thead>
                <tbody>
                  {p.positions.map((pos) => (
                    <tr key={pos.itemId} className="border-b border-border/60">
                      <td className="px-3 py-1.5">
                        <Link href={`/items/${pos.itemId}`} className="flex items-center gap-2 hover:text-accent">
                          <ItemIcon icon={items.get(pos.itemId)?.icon} name={pos.itemName} size={18} />
                          {pos.itemName}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5 text-right num">{pos.openQty.toLocaleString("de-CH")}</td>
                      <td className="px-2 py-1.5 text-right"><Gp value={pos.costBasis} /></td>
                      <td className="px-2 py-1.5 text-right">{pos.marketValue == null ? <span className="text-faint">kein Preis</span> : <Gp value={pos.marketValue} />}</td>
                      <td className="px-2 py-1.5 text-right"><Gp value={pos.unrealized} colored /></td>
                      <td className="px-2 py-1.5 text-right"><Pct value={pos.share} colored={false} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Kapitalverteilung" description="Anteil am geschätzten Gesamtwert" />
          <CardBody className="space-y-2">
            {p.totalValue > 0 ? (
              <>
                {[{ label: "Verfügbares Cash", value: Math.max(0, p.available), color: "var(--info)" }, { label: "Reserviert (Angebote)", value: p.reserved, color: "var(--faint)" }, ...p.positions.map((x) => ({ label: x.itemName, value: x.marketValue ?? x.costBasis, color: "var(--accent)" }))]
                  .filter((x) => x.value > 0)
                  .slice(0, 10)
                  .map((x) => (
                    <div key={x.label}>
                      <div className="flex justify-between text-xs">
                        <span className="truncate">{x.label}</span>
                        <span className="num text-muted">{pct(x.value / p.totalValue)}</span>
                      </div>
                      <div className="mt-0.5 h-1.5 rounded bg-surface-3">
                        <div className="h-full rounded" style={{ width: `${Math.min(100, (x.value / p.totalValue) * 100)}%`, background: x.color }} />
                      </div>
                    </div>
                  ))}
              </>
            ) : (
              <p className="text-xs text-muted">Noch kein Kapital erfasst.</p>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title="Kapitalbuchungen" />
          {loaded && capital.length === 0 ? (
            <EmptyState title="Keine Buchungen">{hasData ? "Ohne Einzahlung kann das Cash negativ werden." : "Beginne mit einer Einzahlung deines Startkapitals."}</EmptyState>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {[...capital].reverse().map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-1.5">
                  <span className="w-32 text-xs text-muted">{dateTime(c.date)}</span>
                  <span className="w-24 text-xs">{c.kind === "deposit" ? "Einzahlung" : c.kind === "withdrawal" ? "Auszahlung" : "Korrektur"}</span>
                  <Gp value={c.amount} colored sign className="w-32 text-right" />
                  <span className="flex-1 truncate text-xs text-muted">{c.note}</span>
                  <Confirm
                    title="Buchung löschen?"
                    text="Die Kapitalbuchung wird entfernt; Cash und Kennzahlen werden neu berechnet."
                    onConfirm={() => deleteCapital(c.id)}
                    trigger={(o) => (
                      <Button size="icon" variant="ghost" onClick={o} aria-label="Buchung löschen">
                        <Trash2 />
                      </Button>
                    )}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

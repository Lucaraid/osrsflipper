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
      { name: "Book value", type: "area", color: "#d9822b", data: timeline.map((t) => ({ time: Math.floor(t.time / 1000), value: t.bookValue })) },
      { name: "Cash", type: "line", color: "#3b82c4", data: timeline.map((t) => ({ time: Math.floor(t.time / 1000), value: t.cash })) },
    ];
  }, [timeline]);

  const submit = async () => {
    if (!amount || amount <= 0) return;
    const signed = kind === "withdrawal" ? -Math.abs(amount) : Math.abs(amount);
    await addCapital({ id: newId(), date: Date.now(), amount: signed, kind, note: note.slice(0, 500) });
    setAmount(null);
    setNote("");
    toast("Capital entry saved.", "pos");
  };

  const setToTarget = async () => {
    if (target == null) return;
    const diff = target - p.cash;
    if (diff === 0) return;
    await addCapital({ id: newId(), date: Date.now(), amount: Math.round(diff), kind: "adjustment", note: `Cash set to ${gp(target)} gp` });
    setTarget(null);
    toast("Cash adjusted.", "pos");
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="My Portfolio" description="Capital, open positions and profit – calculated from your logged entries and trades." />

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Cash" value={<Gp value={p.cash} short />} hint="Capital entries − buys + net sale proceeds" />
        <Stat label="Available" value={<Gp value={p.available} short />} sub={p.reserved ? `${gp(p.reserved)} reserved` : undefined} hint="Cash minus capital reserved for open buy offers" />
        <Stat label="In items" value={<Gp value={p.bound} short />} hint="FIFO cost basis of all open items" />
        <Stat label="Total value (est.)" value={<Gp value={p.totalValue} short />} hint="Cash + open items × (last instant-sell − tax). Estimate." />
        <Stat label="Realised" value={<Gp value={p.realized} short colored />} tone={p.realized > 0 ? "pos" : p.realized < 0 ? "neg" : undefined} sub={p.roi != null ? `ROI ${pct(p.roi)}` : undefined} />
        <Stat label="Unrealised (est.)" value={<Gp value={p.unrealized} short colored />} sub={p.unpricedPositions ? `${p.unpricedPositions} without market price` : undefined} />
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
          <CardHeader title="Capital over time" description="Book value = cash + cost of open items. Only from logged transactions, no market price estimate." />
          <CardBody>
            {chart.length ? <TimeChart series={chart} height={260} /> : <EmptyState title="Not enough data yet">Log capital and trades to see how it develops.</EmptyState>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Add capital" />
          <CardBody className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Type">
                <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Entry type">
                  <option value="deposit">Deposit</option>
                  <option value="withdrawal">Withdrawal</option>
                  <option value="adjustment">Adjustment (+)</option>
                </Select>
              </Field>
              <Field label="Amount (gp)">
                <AmountInput value={amount} onChange={setAmount} placeholder="e.g. 50m" aria-label="Amount" data-testid="capital-amount" />
              </Field>
            </div>
            <Field label="Note">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
            </Field>
            <Button variant="primary" onClick={submit} disabled={!amount} className="w-full" data-testid="capital-submit">
              <Plus /> Add
            </Button>
            <div className="border-t border-border pt-3">
              <Field label="Set cash manually to (gp)" hint={`Currently: ${gp(p.cash)} gp. Creates an adjustment for the difference.`}>
                <div className="flex gap-2">
                  <AmountInput value={target} onChange={setTarget} placeholder="actual cash stack" aria-label="Target cash" />
                  <Button variant="outline" onClick={setToTarget} disabled={target == null}>
                    Set
                  </Button>
                </div>
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Open positions" description={<>Market value<Est /> = quantity × (last instant-sell − GE tax)</>} />
          {p.positions.length === 0 ? (
            <EmptyState title="No open positions">
              Positions come from buys in the <Link href="/history" className="underline">Flip History</Link>.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-2 py-2 text-right font-medium">Quantity</th>
                    <th className="px-2 py-2 text-right font-medium">Cost</th>
                    <th className="px-2 py-2 text-right font-medium">Market value<Est /></th>
                    <th className="px-2 py-2 text-right font-medium">Unrealised<Est /></th>
                    <th className="px-2 py-2 text-right font-medium">Share</th>
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
                      <td className="px-2 py-1.5 text-right">{pos.marketValue == null ? <span className="text-faint">no price</span> : <Gp value={pos.marketValue} />}</td>
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
          <CardHeader title="Capital split" description="Share of the estimated total value" />
          <CardBody className="space-y-2">
            {p.totalValue > 0 ? (
              <>
                {[{ label: "Available cash", value: Math.max(0, p.available), color: "var(--info)" }, { label: "Reserved (offers)", value: p.reserved, color: "var(--faint)" }, ...p.positions.map((x) => ({ label: x.itemName, value: x.marketValue ?? x.costBasis, color: "var(--accent)" }))]
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
              <p className="text-xs text-muted">No capital logged yet.</p>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title="Capital entries" />
          {loaded && capital.length === 0 ? (
            <EmptyState title="No entries">{hasData ? "Without a deposit your cash can go negative." : "Start by depositing your starting capital."}</EmptyState>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {[...capital].reverse().map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-1.5">
                  <span className="w-32 text-xs text-muted">{dateTime(c.date)}</span>
                  <span className="w-24 text-xs">{c.kind === "deposit" ? "Deposit" : c.kind === "withdrawal" ? "Withdrawal" : "Adjustment"}</span>
                  <Gp value={c.amount} colored sign className="w-32 text-right" />
                  <span className="flex-1 truncate text-xs text-muted">{c.note}</span>
                  <Confirm
                    title="Delete entry?"
                    text="The capital entry will be removed; cash and stats will be recalculated."
                    onConfirm={() => deleteCapital(c.id)}
                    trigger={(o) => (
                      <Button size="icon" variant="ghost" onClick={o} aria-label="Delete entry">
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

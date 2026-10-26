"use client";
import { ChevronDown, ChevronRight, HandCoins, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { Confirm } from "@/components/common/confirm";
import { EmptyState, Gp, PageHeader, Pct, Stat } from "@/components/common/indicators";
import { ItemIcon } from "@/components/common/item-icon";
import { emptyTrade, TradeEditor, tradeWithSale } from "@/components/trades/trade-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { useItemMap, useRowMap } from "@/hooks/market";
import { useSettings } from "@/state/settings";
import { computeFifo, type TradeStatus } from "@/lib/portfolio/fifo";
import type { Trade } from "@/lib/portfolio/schemas";
import { dateTime, duration, gpShort } from "@/lib/format";
import { useDataStore } from "@/state/data";
import { useFolderStore } from "@/state/folder";
import { toast } from "@/state/toasts";

const STATUS_TONE: Record<TradeStatus, "neutral" | "info" | "warn" | "pos"> = { leer: "neutral", offen: "info", teilweise: "warn", geschlossen: "pos" };
const STATUS_LABEL: Record<TradeStatus, string> = { leer: "empty", offen: "open", teilweise: "partly sold", geschlossen: "closed" };

export default function HistoryPage() {
  const { trades, loaded, error, deleteTrade } = useDataStore();
  const items = useItemMap();
  const [editing, setEditing] = useState<{ draft: Trade | ReturnType<typeof emptyTrade>; mode?: "buy" | "sell" } | null>(null);
  const marketRows = useRowMap();
  const settings = useSettings();
  /** Verkauf für einen offenen Trade: Menge = offene Stück, Preis = letzter Instant-Buy − Offset (Schätzung) */
  const startSale = (t: Trade) => {
    const r = marketRows.get(t.itemId);
    const price = r?.high != null ? Math.max(1, r.high - settings.priceOffset) : null;
    setEditing({ draft: tradeWithSale(t, price), mode: "sell" });
  };
  const [expanded, setExpanded] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | TradeStatus>("");
  const [result, setResult] = useState<"" | "win" | "loss">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"date" | "realized" | "roi">("date");
  const folder = useFolderStore();

  const rows = useMemo(() => {
    const fromMs = from ? new Date(from).getTime() : null;
    const toMs = to ? new Date(to).getTime() + 86_400_000 : null;
    const list = trades
      .map((t) => ({ t, s: computeFifo(t) }))
      .filter(({ t, s }) => {
        if (q && !t.itemName.toLowerCase().includes(q.toLowerCase())) return false;
        if (status && s.status !== status) return false;
        if (result === "win" && !(s.realized > 0)) return false;
        if (result === "loss" && !(s.realized < 0)) return false;
        const last = s.lastActivity ?? t.createdAt;
        if (fromMs != null && last < fromMs) return false;
        if (toMs != null && (s.firstBuy ?? t.createdAt) > toMs) return false;
        return true;
      });
    list.sort((a, b) =>
      sort === "realized" ? b.s.realized - a.s.realized : sort === "roi" ? (b.s.roi ?? -Infinity) - (a.s.roi ?? -Infinity) : (b.s.lastActivity ?? b.t.createdAt) - (a.s.lastActivity ?? a.t.createdAt),
    );
    return list;
  }, [trades, q, status, result, from, to, sort]);

  const totals = useMemo(() => {
    const realized = rows.reduce((a, r) => a + r.s.realized, 0);
    const closed = rows.filter((r) => r.s.status === "geschlossen");
    return { realized, count: rows.length, closed: closed.length, wins: closed.filter((r) => r.s.realized > 0).length };
  }, [rows]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Flip History"
        description="All logged trades with partial sales, multiple buys and FIFO profit. Data is only stored locally."
        actions={
          <Button variant="primary" onClick={() => setEditing({ draft: emptyTrade() })} data-testid="new-trade">
            <Plus /> Log trade
          </Button>
        }
      />

      {folder.status === "connected" ? (
        <p className="mb-2 text-xs text-muted" data-testid="history-folder">
          Saved in the folder <b className="text-text">“{folder.folderName}”</b> (osrs-ge-flipper-daten.json + trades.csv).
        </p>
      ) : folder.status === "needs-permission" ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-warn">
          Access to the folder “{folder.folderName}” needs to be confirmed, otherwise data is only saved in the browser.
          <Button size="sm" variant="outline" onClick={() => void folder.reconnect()}>Allow access</Button>
        </div>
      ) : folder.status === "none" ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
          Your trades are only stored in the browser. Pick a folder on your computer to save them there as a file.
          <Button size="sm" variant="primary" onClick={() => void folder.connect()} data-testid="history-pick-folder">Choose folder</Button>
        </div>
      ) : null}

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Trades (filtered)" value={totals.count} />
        <Stat label="Realised profit" value={<Gp value={totals.realized} short colored />} hint="FIFO, after GE tax and fees" />
        <Stat label="Closed" value={totals.closed} />
        <Stat label="Win rate" value={totals.closed ? `${Math.round((totals.wins / totals.closed) * 100)}%` : "–"} sub="closed flips with a profit" />
      </div>

      <Card className="mb-3 grid grid-cols-2 gap-2 p-3 sm:grid-cols-6">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter items…" aria-label="Filter by item" />
        <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
          <option value="">All statuses</option>
          <option value="offen">open</option>
          <option value="teilweise">partly sold</option>
          <option value="geschlossen">closed</option>
        </Select>
        <Select value={result} onChange={(e) => setResult(e.target.value as typeof result)} aria-label="Result">
          <option value="">All results</option>
          <option value="win">Profit</option>
          <option value="loss">Loss</option>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort by">
          <option value="date">Newest first</option>
          <option value="realized">Highest profit</option>
          <option value="roi">Highest ROI</option>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        {error && <div className="p-4 text-sm text-neg">Local storage unavailable: {error}</div>}
        {loaded && trades.length === 0 ? (
          <EmptyState title="No trades logged yet" action={<Button variant="primary" onClick={() => setEditing({ draft: emptyTrade() })}><Plus /> Log your first trade</Button>}>
            Log buys and sells to track realised profit, ROI and win rate.
          </EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState title="No trades match the filters" />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full text-sm" data-testid="trades-table">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <th className="w-6" />
                  <th className="px-2 py-2 font-medium">Item</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 text-right font-medium">Bought / sold / open</th>
                  <th className="px-2 py-2 text-right font-medium">Avg buy</th>
                  <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Net proceeds</th>
                  <th className="px-2 py-2 text-right font-medium">Realised</th>
                  <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">ROI</th>
                  <th className="hidden px-2 py-2 font-medium lg:table-cell">Last activity</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ t, s }) => {
                  const meta = items.get(t.itemId);
                  const open = expanded === t.id;
                  return (
                    <Fragment key={t.id}>
                      <tr className="border-b border-border/60 hover:bg-surface-2/60" data-testid="trade-row">
                        <td className="pl-2">
                          <button type="button" onClick={() => setExpanded(open ? null : t.id)} aria-label="Details" className="text-muted">
                            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          </button>
                        </td>
                        <td className="px-2 py-1.5">
                          <Link href={`/items/${t.itemId}`} className="flex items-center gap-2 hover:text-accent">
                            <ItemIcon icon={meta?.icon} name={t.itemName} size={18} />
                            <span className="max-w-[180px] truncate">{t.itemName}</span>
                          </Link>
                        </td>
                        <td className="px-2 py-1.5"><Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge></td>
                        <td className="px-2 py-1.5 text-right num">{s.boughtQty} / {s.soldQty} / {s.openQty}</td>
                        <td className="px-2 py-1.5 text-right"><Gp value={s.avgBuyPrice} /></td>
                        <td className="hidden px-2 py-1.5 text-right sm:table-cell"><Gp value={s.proceedsNet} short /></td>
                        <td className="px-2 py-1.5 text-right font-medium" data-testid="trade-realized"><Gp value={s.realized} colored /></td>
                        <td className="hidden px-2 py-1.5 text-right sm:table-cell"><Pct value={s.roi} /></td>
                        <td className="hidden px-2 py-1.5 text-xs text-muted lg:table-cell">{dateTime(s.lastActivity)}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex justify-end">
                            {s.openQty > 0 && (
                              <Button size="sm" variant="outline" onClick={() => startSale(t)} aria-label="Log sale" data-testid="sell-trade">
                                <HandCoins /> Sell
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" onClick={() => setEditing({ draft: t })} aria-label="Edit trade" data-testid="edit-trade">
                              <Pencil />
                            </Button>
                            <Confirm
                              title="Delete trade?"
                              text={`The trade “${t.itemName}” with all its buys and sales will be permanently deleted.`}
                              onConfirm={async () => {
                                await deleteTrade(t.id);
                                toast("Trade deleted.");
                              }}
                              trigger={(o) => (
                                <Button size="icon" variant="ghost" onClick={o} aria-label="Delete trade">
                                  <Trash2 />
                                </Button>
                              )}
                            />
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-border bg-surface-2/40">
                          <td colSpan={10} className="px-4 py-3">
                            <div className="grid gap-4 text-xs lg:grid-cols-3">
                              <div>
                                <div className="mb-1 font-semibold text-muted">Buys</div>
                                {t.lots.map((l) => (
                                  <div key={l.id} className="flex justify-between gap-2 num">
                                    <span>{dateTime(l.date)}</span>
                                    <span>{l.quantity} × {gpShort(l.price)}{l.fees ? ` + ${gpShort(l.fees)} fees` : ""}</span>
                                  </div>
                                ))}
                                {s.openLots.length > 0 && <div className="mt-1 text-faint">Open cost basis (FIFO): <Gp value={s.openCostBasis} /></div>}
                              </div>
                              <div>
                                <div className="mb-1 font-semibold text-muted">Sales (FIFO matching)</div>
                                {s.sales.length === 0 && <div className="text-faint">None</div>}
                                {s.sales.map((x) => (
                                  <div key={x.saleId} className="mb-1">
                                    <div className="flex justify-between gap-2 num">
                                      <span>{dateTime(x.date)}</span>
                                      <span>{x.quantity} × {gpShort(x.price)} · tax {gpShort(x.tax)}{x.taxIsActual ? "" : " (calc.)"}</span>
                                    </div>
                                    <div className="flex justify-between text-faint">
                                      <span>Cost <Gp value={x.costBasis} /> · avg hold {duration(x.matches.reduce((a, m) => a + m.holdMs * m.quantity, 0) / Math.max(1, x.matchedQuantity))}</span>
                                      <Gp value={x.realized} colored />
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div>
                                <div className="mb-1 font-semibold text-muted">Change history</div>
                                {t.history.slice(-8).reverse().map((h, i) => (
                                  <div key={i} className="flex justify-between gap-2">
                                    <span className="text-faint">{dateTime(h.at)}</span>
                                    <span>{h.action}: {h.detail}</span>
                                  </div>
                                ))}
                                {t.notes && <div className="mt-2 text-muted">Note: {t.notes}</div>}
                                {s.reservedForOffers > 0 && <div className="mt-2 text-muted">Reserved for buy offers: <Gp value={s.reservedForOffers} /></div>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && <TradeEditor key={editing.draft.id + (editing.mode ?? "")} initial={editing.draft} mode={editing.mode} open onOpenChange={(o) => !o && setEditing(null)} />}
    </div>
  );
}

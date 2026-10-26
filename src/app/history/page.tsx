"use client";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { Confirm } from "@/components/common/confirm";
import { EmptyState, Gp, PageHeader, Pct, Stat } from "@/components/common/indicators";
import { ItemIcon } from "@/components/common/item-icon";
import { emptyTrade, TradeEditor } from "@/components/trades/trade-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { useItemMap } from "@/hooks/market";
import { computeFifo, type TradeStatus } from "@/lib/portfolio/fifo";
import type { Trade } from "@/lib/portfolio/schemas";
import { dateTime, duration, gpShort } from "@/lib/format";
import { useDataStore } from "@/state/data";
import { useFolderStore } from "@/state/folder";
import { toast } from "@/state/toasts";

const STATUS_TONE: Record<TradeStatus, "neutral" | "info" | "warn" | "pos"> = { leer: "neutral", offen: "info", teilweise: "warn", geschlossen: "pos" };

export default function HistoryPage() {
  const { trades, loaded, error, deleteTrade } = useDataStore();
  const items = useItemMap();
  const [editing, setEditing] = useState<Trade | ReturnType<typeof emptyTrade> | null>(null);
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
        title="Flip-Historie"
        description="Alle erfassten Trades mit Teilverkäufen, mehreren Kaufchargen und FIFO-Gewinnberechnung. Daten werden nur lokal in diesem Browser gespeichert."
        actions={
          <Button variant="primary" onClick={() => setEditing(emptyTrade())} data-testid="new-trade">
            <Plus /> Trade erfassen
          </Button>
        }
      />

      {folder.status === "connected" ? (
        <p className="mb-2 text-xs text-muted" data-testid="history-folder">
          Gespeichert im Ordner <b className="text-text">„{folder.folderName}“</b> (osrs-ge-flipper-daten.json + trades.csv).
        </p>
      ) : folder.status === "needs-permission" ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-warn">
          Zugriff auf den Ordner „{folder.folderName}“ muss bestätigt werden, sonst wird nur im Browser gespeichert.
          <Button size="sm" variant="outline" onClick={() => void folder.reconnect()}>Zugriff erlauben</Button>
        </div>
      ) : folder.status === "none" ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
          Deine Trades liegen nur im Browser-Speicher. Wähle einen Ordner auf deinem Computer, um sie dort als Datei zu speichern.
          <Button size="sm" variant="primary" onClick={() => void folder.connect()} data-testid="history-pick-folder">Ordner wählen</Button>
        </div>
      ) : null}

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Trades (gefiltert)" value={totals.count} />
        <Stat label="Realisiert netto" value={<Gp value={totals.realized} short colored />} hint="FIFO, nach GE-Steuer und Gebühren" />
        <Stat label="Geschlossen" value={totals.closed} />
        <Stat label="Erfolgsquote" value={totals.closed ? `${Math.round((totals.wins / totals.closed) * 100)} %` : "–"} sub="geschlossene Flips mit Gewinn" />
      </div>

      <Card className="mb-3 grid grid-cols-2 gap-2 p-3 sm:grid-cols-6">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Item filtern…" aria-label="Nach Item filtern" />
        <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
          <option value="">Alle Status</option>
          <option value="offen">offen</option>
          <option value="teilweise">teilweise verkauft</option>
          <option value="geschlossen">geschlossen</option>
        </Select>
        <Select value={result} onChange={(e) => setResult(e.target.value as typeof result)} aria-label="Ergebnis">
          <option value="">Alle Ergebnisse</option>
          <option value="win">Gewinn</option>
          <option value="loss">Verlust</option>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Von Datum" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Bis Datum" />
        <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sortierung">
          <option value="date">Neueste zuerst</option>
          <option value="realized">Höchster Gewinn</option>
          <option value="roi">Höchster ROI</option>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        {error && <div className="p-4 text-sm text-neg">Lokaler Speicher nicht verfügbar: {error}</div>}
        {loaded && trades.length === 0 ? (
          <EmptyState title="Noch keine Trades erfasst" action={<Button variant="primary" onClick={() => setEditing(emptyTrade())}><Plus /> Ersten Trade erfassen</Button>}>
            Erfasse Käufe und Verkäufe, um realisierte Gewinne, ROI und Erfolgsquote zu verfolgen.
          </EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState title="Keine Trades entsprechen den Filtern" />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full text-sm" data-testid="trades-table">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <th className="w-6" />
                  <th className="px-2 py-2 font-medium">Item</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 text-right font-medium">Gek. / Verk. / Offen</th>
                  <th className="px-2 py-2 text-right font-medium">Ø Kauf</th>
                  <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Erlös netto</th>
                  <th className="px-2 py-2 text-right font-medium">Realisiert</th>
                  <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">ROI</th>
                  <th className="hidden px-2 py-2 font-medium lg:table-cell">Letzte Aktivität</th>
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
                        <td className="px-2 py-1.5"><Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge></td>
                        <td className="px-2 py-1.5 text-right num">{s.boughtQty} / {s.soldQty} / {s.openQty}</td>
                        <td className="px-2 py-1.5 text-right"><Gp value={s.avgBuyPrice} /></td>
                        <td className="hidden px-2 py-1.5 text-right sm:table-cell"><Gp value={s.proceedsNet} short /></td>
                        <td className="px-2 py-1.5 text-right font-medium" data-testid="trade-realized"><Gp value={s.realized} colored /></td>
                        <td className="hidden px-2 py-1.5 text-right sm:table-cell"><Pct value={s.roi} /></td>
                        <td className="hidden px-2 py-1.5 text-xs text-muted lg:table-cell">{dateTime(s.lastActivity)}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex justify-end">
                            <Button size="icon" variant="ghost" onClick={() => setEditing(t)} aria-label="Trade bearbeiten" data-testid="edit-trade">
                              <Pencil />
                            </Button>
                            <Confirm
                              title="Trade löschen?"
                              text={`Der Trade „${t.itemName}“ mit allen Chargen und Verkäufen wird unwiderruflich aus diesem Browser gelöscht.`}
                              onConfirm={async () => {
                                await deleteTrade(t.id);
                                toast("Trade gelöscht.");
                              }}
                              trigger={(o) => (
                                <Button size="icon" variant="ghost" onClick={o} aria-label="Trade löschen">
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
                                <div className="mb-1 font-semibold text-muted">Kaufchargen</div>
                                {t.lots.map((l) => (
                                  <div key={l.id} className="flex justify-between gap-2 num">
                                    <span>{dateTime(l.date)}</span>
                                    <span>{l.quantity} × {gpShort(l.price)}{l.fees ? ` + ${gpShort(l.fees)} Geb.` : ""}</span>
                                  </div>
                                ))}
                                {s.openLots.length > 0 && <div className="mt-1 text-faint">Offener Einstand (FIFO): <Gp value={s.openCostBasis} /></div>}
                              </div>
                              <div>
                                <div className="mb-1 font-semibold text-muted">Verkäufe (FIFO-Zuordnung)</div>
                                {s.sales.length === 0 && <div className="text-faint">Keine</div>}
                                {s.sales.map((x) => (
                                  <div key={x.saleId} className="mb-1">
                                    <div className="flex justify-between gap-2 num">
                                      <span>{dateTime(x.date)}</span>
                                      <span>{x.quantity} × {gpShort(x.price)} · Steuer {gpShort(x.tax)}{x.taxIsActual ? "" : " (ber.)"}</span>
                                    </div>
                                    <div className="flex justify-between text-faint">
                                      <span>Einstand <Gp value={x.costBasis} /> · Haltedauer Ø {duration(x.matches.reduce((a, m) => a + m.holdMs * m.quantity, 0) / Math.max(1, x.matchedQuantity))}</span>
                                      <Gp value={x.realized} colored />
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div>
                                <div className="mb-1 font-semibold text-muted">Änderungshistorie</div>
                                {t.history.slice(-8).reverse().map((h, i) => (
                                  <div key={i} className="flex justify-between gap-2">
                                    <span className="text-faint">{dateTime(h.at)}</span>
                                    <span>{h.action}: {h.detail}</span>
                                  </div>
                                ))}
                                {t.notes && <div className="mt-2 text-muted">Notiz: {t.notes}</div>}
                                {s.reservedForOffers > 0 && <div className="mt-2 text-muted">Reserviert für Kaufangebote: <Gp value={s.reservedForOffers} /></div>}
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
      {editing && <TradeEditor key={editing.id} initial={editing} open onOpenChange={(o) => !o && setEditing(null)} />}
    </div>
  );
}

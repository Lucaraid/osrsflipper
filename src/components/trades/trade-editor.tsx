"use client";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { ErrorNote, Gp, InfoNote, Pct } from "@/components/common/indicators";
import { ItemPicker } from "@/components/items/item-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AmountInput, Field, Input } from "@/components/ui/input";
import { computeFifo } from "@/lib/portfolio/fifo";
import type { Lot, Offer, Sale, Trade } from "@/lib/portfolio/schemas";
import { newId } from "@/lib/storage/db";
import { taxTotal } from "@/lib/tax/tax";
import { gp } from "@/lib/format";
import { useItemMap } from "@/hooks/market";
import { useDataStore } from "@/state/data";
import { toast } from "@/state/toasts";

function toLocalInput(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(s: string): number {
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

type Draft = Omit<Trade, "lots" | "sales" | "offers"> & {
  lots: Array<Omit<Lot, "quantity" | "price"> & { quantity: number | null; price: number | null }>;
  sales: Array<Omit<Sale, "quantity" | "price"> & { quantity: number | null; price: number | null }>;
  offers: Array<Omit<Offer, "quantity" | "price"> & { quantity: number | null; price: number | null }>;
};

export function emptyTrade(itemId: number | null = null, itemName = "", prefill?: { price?: number | null; quantity?: number | null }): Draft {
  const now = Date.now();
  return {
    id: newId(),
    itemId: itemId ?? 0,
    itemName,
    createdAt: now,
    updatedAt: now,
    lots: [{ id: newId(), date: now, quantity: prefill?.quantity ?? null, price: prefill?.price ?? null, fees: 0 }],
    sales: [],
    offers: [],
    notes: "",
    history: [],
  };
}

/** Bestehenden Trade mit einer vorausgefüllten Verkaufszeile öffnen (Menge = noch offene Stück). */
export function tradeWithSale(t: Trade, price: number | null, quantity?: number | null): Draft {
  const open = computeFifo(t).openQty;
  return {
    ...(structuredClone(t) as unknown as Draft),
    sales: [...t.sales, { id: newId(), date: Date.now(), quantity: quantity ?? (open > 0 ? open : null), price, tax: null, fees: 0 }],
  };
}

/** Jüngster Trade zu einem Item, der noch offene Stück hat (gekauft, nicht vollständig verkauft). */
export function findOpenTrade(trades: Trade[], itemId: number): Trade | undefined {
  return trades
    .filter((t) => t.itemId === itemId && computeFifo(t).openQty > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

/**
 * Entscheidet, was „Trade erfassen“ öffnet:
 * - offener Trade vorhanden → diesen Trade mit neuer Verkaufszeile (Preis = Verkaufspreis aus dem Rechner bzw. Schätzung, Menge = offene Stück)
 * - sonst → neuer Trade mit Kaufzeile (Preis & Menge aus dem Rechner bzw. Schätzung)
 */
export function prepareTrade(
  trades: Trade[],
  item: { id: number; name: string },
  values: { buy?: number | null; sell?: number | null; qty?: number | null } | undefined,
): { draft: Draft; mode: "sell" | "buy" } {
  const open = findOpenTrade(trades, item.id);
  if (open) return { draft: tradeWithSale(open, values?.sell ?? null), mode: "sell" };
  return { draft: emptyTrade(item.id, item.name, { price: values?.buy ?? null, quantity: values?.qty ?? null }), mode: "buy" };
}

/** Spaltenüberschriften über den Eingabezeilen (gleiches Grid wie die Zeilen; mobil zeigen die Platzhalter die Bedeutung) */
function ColHeads({ cols, grid, testId }: { cols: string[]; grid: string; testId?: string }) {
  return (
    <div className={`hidden gap-2 px-0.5 text-[11px] font-medium text-muted sm:grid ${grid}`} data-testid={testId}>
      {cols.map((c, i) => (
        <span key={i}>{c}</span>
      ))}
    </div>
  );
}

function isComplete<T extends { quantity: number | null; price: number | null }>(x: T): x is T & { quantity: number; price: number } {
  return x.quantity != null && x.price != null && x.quantity > 0 && x.price > 0;
}

/**
 * Dialog zum Erfassen/Bearbeiten eines Trades mit mehreren Kaufchargen, Teilverkäufen und
 * offenen Kaufangeboten. Live-Validierung über FIFO verhindert Überverkäufe.
 */
export function TradeEditor({ initial, open, onOpenChange, mode }: { initial: Trade | Draft; open: boolean; onOpenChange: (o: boolean) => void; mode?: "buy" | "sell" }) {
  const [d, setD] = useState<Draft>(() => structuredClone(initial) as Draft);
  const [errors, setErrors] = useState<string[]>([]);
  const items = useItemMap();
  const saveTrade = useDataStore((s) => s.saveTrade);
  const isNew = !("history" in initial) || initial.history.length === 0;

  const asTrade: Trade = useMemo(
    () => ({ ...d, lots: d.lots.filter(isComplete), sales: d.sales.filter(isComplete), offers: d.offers.filter(isComplete) }) as Trade,
    [d],
  );
  const summary = useMemo(() => (d.itemId ? computeFifo(asTrade) : null), [asTrade, d.itemId]);

  const upd = <K extends "lots" | "sales" | "offers">(k: K, i: number, patch: Partial<Draft[K][number]>) =>
    setD((x) => ({ ...x, [k]: x[k].map((row, j) => (j === i ? { ...row, ...patch } : row)) }));
  const del = (k: "lots" | "sales" | "offers", i: number) => setD((x) => ({ ...x, [k]: x[k].filter((_, j) => j !== i) }));

  const save = async () => {
    const errs: string[] = [];
    if (!d.itemId) errs.push("Please pick an item.");
    if (asTrade.lots.length === 0 && asTrade.offers.length === 0) errs.push("Add at least one buy or one open buy offer.");
    const incomplete = [...d.lots, ...d.sales, ...d.offers].some((r) => !isComplete(r) && (r.quantity != null || r.price != null));
    if (incomplete) errs.push("Incomplete rows: quantity and price must be > 0.");
    if (errs.length) return setErrors(errs);
    const detail = `${asTrade.lots.length} buy, ${asTrade.sales.length} sell, ${asTrade.offers.length} offer(s)`;
    const res = await saveTrade(asTrade, isNew ? "created" : "edited", detail);
    if (!res.ok) return setErrors(res.errors);
    toast(isNew ? "Trade saved." : "Trade updated.", "pos");
    onOpenChange(false);
  };

  const meta = items.get(d.itemId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={mode === "sell" ? `Log sale – ${d.itemName}` : isNew ? "Log trade" : `Edit trade – ${d.itemName}`} description="Only log buys and sells that actually went through. Open buy offers reserve capital." className="max-w-3xl">
        <div className="space-y-4" data-testid="trade-editor">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Item">
              <ItemPicker
                value={d.itemId || null}
                onChange={(it) => setD((x) => ({ ...x, itemId: it?.id ?? 0, itemName: it?.name ?? "" }))}
                testId="trade-item"
              />
            </Field>
            <Field label="Notes">
              <Input value={d.notes} onChange={(e) => setD((x) => ({ ...x, notes: e.target.value }))} placeholder="optional" />
            </Field>
          </div>

          {/* Kaufchargen */}
          <section>
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Buys</h3>
              <Button size="sm" variant="outline" onClick={() => setD((x) => ({ ...x, lots: [...x.lots, { id: newId(), date: Date.now(), quantity: null, price: null, fees: 0 }] }))} data-testid="add-lot">
                <Plus /> Buy
              </Button>
            </div>
            <div className="space-y-2">
              {d.lots.length > 0 && <ColHeads grid="sm:grid-cols-[1.4fr_1fr_1fr_2.25rem]" cols={["Buy date", "Quantity", "Buy price each (gp)", ""]} testId="lot-heads" />}
              {d.lots.map((l, i) => (
                <div key={l.id} className="grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_1fr_1fr_2.25rem]" data-testid="lot-row">
                  <Input type="datetime-local" value={toLocalInput(l.date)} onChange={(e) => upd("lots", i, { date: fromLocalInput(e.target.value) })} aria-label="Buy date" />
                  <AmountInput value={l.quantity} onChange={(v) => upd("lots", i, { quantity: v })} placeholder="Quantity" aria-label="Quantity bought" data-testid="lot-qty" />
                  <AmountInput value={l.price} onChange={(v) => upd("lots", i, { price: v })} placeholder="Price each" aria-label="Buy price each" data-testid="lot-price" />
                  <Button size="icon" variant="ghost" onClick={() => del("lots", i)} aria-label="Delete buy">
                    <Trash2 />
                  </Button>
                </div>
              ))}
              {d.lots.length === 0 && <p className="text-xs text-faint">No buys yet.</p>}
            </div>
          </section>

          {/* Verkäufe */}
          <section>
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Sales (partial sales allowed)</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setD((x) => ({ ...x, sales: [...x.sales, { id: newId(), date: Date.now(), quantity: summary && summary.openQty > 0 ? summary.openQty : null, price: null, tax: null, fees: 0 }] }))}
                data-testid="add-sale"
              >
                <Plus /> Sale
              </Button>
            </div>
            <div className="space-y-2">
              {d.sales.length > 0 && <ColHeads grid="sm:grid-cols-[1.4fr_1fr_1fr_1fr_2.25rem]" cols={["Sale date", "Quantity", "Sell price each (gp)", "Tax paid (optional, total)", ""]} testId="sale-heads" />}
              {d.sales.map((s, i) => (
                <div key={s.id} className="grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr_2.25rem]" data-testid="sale-row">
                  <Input type="datetime-local" value={toLocalInput(s.date)} onChange={(e) => upd("sales", i, { date: fromLocalInput(e.target.value) })} aria-label="Sale date" />
                  <AmountInput value={s.quantity} onChange={(v) => upd("sales", i, { quantity: v })} placeholder="Quantity" aria-label="Quantity sold" data-testid="sale-qty" />
                  <AmountInput value={s.price} onChange={(v) => upd("sales", i, { price: v })} placeholder="Price each" aria-label="Sell price each" data-testid="sale-price" />
                  <AmountInput
                    value={s.tax}
                    onChange={(v) => upd("sales", i, { tax: v })}
                    placeholder={s.price && s.quantity ? `Tax ${gp(taxTotal(s.price, s.quantity, d.itemId))}` : "Tax (auto)"}
                    aria-label="Actual tax paid (optional)"
                  />
                  <Button size="icon" variant="ghost" onClick={() => del("sales", i)} aria-label="Delete sale">
                    <Trash2 />
                  </Button>
                </div>
              ))}
              {d.sales.length === 0 && <p className="text-xs text-faint">No sales yet – trade is open.</p>}
            </div>
          </section>

          {/* Offene Kaufangebote */}
          <section>
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Open buy offers (reserve capital)</h3>
              <Button size="sm" variant="outline" onClick={() => setD((x) => ({ ...x, offers: [...x.offers, { id: newId(), date: Date.now(), quantity: null, price: null }] }))}>
                <Plus /> Offer
              </Button>
            </div>
            <div className="space-y-2">
              {d.offers.length > 0 && <ColHeads grid="sm:grid-cols-[1.4fr_1fr_1fr_7.5rem_2.25rem]" cols={["Offer date", "Quantity", "Bid each (gp)", "", ""]} />}
              {d.offers.map((o, i) => (
                <div key={o.id} className="grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_1fr_1fr_7.5rem_2.25rem]">
                  <Input type="datetime-local" value={toLocalInput(o.date)} onChange={(e) => upd("offers", i, { date: fromLocalInput(e.target.value) })} aria-label="Offer date" />
                  <AmountInput value={o.quantity} onChange={(v) => upd("offers", i, { quantity: v })} placeholder="Quantity" aria-label="Offer quantity" />
                  <AmountInput value={o.price} onChange={(v) => upd("offers", i, { price: v })} placeholder="Bid each" aria-label="Bid each" />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!isComplete(o)}
                    onClick={() =>
                      setD((x) => ({
                        ...x,
                        offers: x.offers.filter((_, j) => j !== i),
                        lots: [...x.lots.filter(isComplete), { id: newId(), date: Date.now(), quantity: o.quantity, price: o.price, fees: 0 }],
                      }))
                    }
                  >
                    Filled → buy
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => del("offers", i)} aria-label="Delete offer">
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          </section>

          {summary && (
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-surface-2 p-3 text-xs sm:grid-cols-4" data-testid="trade-preview">
              <div>
                <div className="text-faint">Bought / sold / open</div>
                <div className="num">{summary.boughtQty} / {summary.soldQty} / {summary.openQty}</div>
              </div>
              <div>
                <div className="text-faint">Avg buy price</div>
                <Gp value={summary.avgBuyPrice} />
              </div>
              <div>
                <div className="text-faint">Realised (FIFO, net)</div>
                <Gp value={summary.realized} colored />
              </div>
              <div>
                <div className="text-faint">Realised ROI</div>
                <Pct value={summary.roi} />
              </div>
              {meta?.limit != null && summary.boughtQty > meta.limit && (
                <div className="col-span-full text-warn">Note: total quantity exceeds the 4-hour buy limit ({meta.limit}) – fine if bought across several windows.</div>
              )}
            </div>
          )}
          {summary && summary.errors.length > 0 && <ErrorNote>{summary.errors.join(" ")}</ErrorNote>}
          {errors.length > 0 && <ErrorNote>{errors.join(" ")}</ErrorNote>}
          <InfoNote>Profit uses FIFO: sales are matched to the oldest open buys. If you leave the tax empty, GE tax is calculated with the current rules.</InfoNote>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} data-testid="save-trade">
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

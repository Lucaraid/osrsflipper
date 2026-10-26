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

export function emptyTrade(itemId: number | null = null, itemName = ""): Draft {
  const now = Date.now();
  return {
    id: newId(),
    itemId: itemId ?? 0,
    itemName,
    createdAt: now,
    updatedAt: now,
    lots: [{ id: newId(), date: now, quantity: null, price: null, fees: 0 }],
    sales: [],
    offers: [],
    notes: "",
    history: [],
  };
}

function isComplete<T extends { quantity: number | null; price: number | null }>(x: T): x is T & { quantity: number; price: number } {
  return x.quantity != null && x.price != null && x.quantity > 0 && x.price > 0;
}

/**
 * Dialog zum Erfassen/Bearbeiten eines Trades mit mehreren Kaufchargen, Teilverkäufen und
 * offenen Kaufangeboten. Live-Validierung über FIFO verhindert Überverkäufe.
 */
export function TradeEditor({ initial, open, onOpenChange }: { initial: Trade | Draft; open: boolean; onOpenChange: (o: boolean) => void }) {
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
    if (!d.itemId) errs.push("Bitte ein Item wählen.");
    if (asTrade.lots.length === 0 && asTrade.offers.length === 0) errs.push("Mindestens eine Kaufcharge oder ein Kaufangebot erfassen.");
    const incomplete = [...d.lots, ...d.sales, ...d.offers].some((r) => !isComplete(r) && (r.quantity != null || r.price != null));
    if (incomplete) errs.push("Unvollständige Zeilen: Menge und Preis müssen > 0 sein.");
    if (errs.length) return setErrors(errs);
    const detail = `${asTrade.lots.length} Kauf, ${asTrade.sales.length} Verkauf, ${asTrade.offers.length} Angebot(e)`;
    const res = await saveTrade(asTrade, isNew ? "erstellt" : "bearbeitet", detail);
    if (!res.ok) return setErrors(res.errors);
    toast(isNew ? "Trade gespeichert." : "Trade aktualisiert.", "pos");
    onOpenChange(false);
  };

  const meta = items.get(d.itemId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={isNew ? "Trade erfassen" : `Trade bearbeiten – ${d.itemName}`} description="Nur tatsächlich ausgeführte Käufe/Verkäufe als Chargen erfassen. Offene Kaufangebote reservieren Kapital." className="max-w-3xl">
        <div className="space-y-4" data-testid="trade-editor">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Item">
              <ItemPicker
                value={d.itemId || null}
                onChange={(it) => setD((x) => ({ ...x, itemId: it?.id ?? 0, itemName: it?.name ?? "" }))}
                testId="trade-item"
              />
            </Field>
            <Field label="Notizen">
              <Input value={d.notes} onChange={(e) => setD((x) => ({ ...x, notes: e.target.value }))} placeholder="optional" />
            </Field>
          </div>

          {/* Kaufchargen */}
          <section>
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Kaufchargen</h3>
              <Button size="sm" variant="outline" onClick={() => setD((x) => ({ ...x, lots: [...x.lots, { id: newId(), date: Date.now(), quantity: null, price: null, fees: 0 }] }))} data-testid="add-lot">
                <Plus /> Kauf
              </Button>
            </div>
            <div className="space-y-2">
              {d.lots.map((l, i) => (
                <div key={l.id} className="grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto]" data-testid="lot-row">
                  <Input type="datetime-local" value={toLocalInput(l.date)} onChange={(e) => upd("lots", i, { date: fromLocalInput(e.target.value) })} aria-label="Kaufdatum" />
                  <AmountInput value={l.quantity} onChange={(v) => upd("lots", i, { quantity: v })} placeholder="Menge" aria-label="Gekaufte Menge" data-testid="lot-qty" />
                  <AmountInput value={l.price} onChange={(v) => upd("lots", i, { price: v })} placeholder="Preis/Stk" aria-label="Kaufpreis pro Stück" data-testid="lot-price" />
                  <AmountInput value={l.fees} onChange={(v) => upd("lots", i, { fees: v ?? 0 })} placeholder="Gebühren" aria-label="Gebühren" />
                  <Button size="icon" variant="ghost" onClick={() => del("lots", i)} aria-label="Kaufcharge löschen">
                    <Trash2 />
                  </Button>
                </div>
              ))}
              {d.lots.length === 0 && <p className="text-xs text-faint">Keine Kaufchargen.</p>}
            </div>
          </section>

          {/* Verkäufe */}
          <section>
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Verkäufe (auch Teilverkäufe)</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setD((x) => ({ ...x, sales: [...x.sales, { id: newId(), date: Date.now(), quantity: summary && summary.openQty > 0 ? summary.openQty : null, price: null, tax: null, fees: 0 }] }))}
                data-testid="add-sale"
              >
                <Plus /> Verkauf
              </Button>
            </div>
            <div className="space-y-2">
              {d.sales.map((s, i) => (
                <div key={s.id} className="grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto]" data-testid="sale-row">
                  <Input type="datetime-local" value={toLocalInput(s.date)} onChange={(e) => upd("sales", i, { date: fromLocalInput(e.target.value) })} aria-label="Verkaufsdatum" />
                  <AmountInput value={s.quantity} onChange={(v) => upd("sales", i, { quantity: v })} placeholder="Menge" aria-label="Verkaufte Menge" data-testid="sale-qty" />
                  <AmountInput value={s.price} onChange={(v) => upd("sales", i, { price: v })} placeholder="Preis/Stk" aria-label="Verkaufspreis pro Stück" data-testid="sale-price" />
                  <AmountInput
                    value={s.tax}
                    onChange={(v) => upd("sales", i, { tax: v })}
                    placeholder={s.price && s.quantity ? `Steuer ${gp(taxTotal(s.price, s.quantity, d.itemId))}` : "Steuer (auto)"}
                    aria-label="Tatsächliche Steuer (optional)"
                  />
                  <Button size="icon" variant="ghost" onClick={() => del("sales", i)} aria-label="Verkauf löschen">
                    <Trash2 />
                  </Button>
                </div>
              ))}
              {d.sales.length === 0 && <p className="text-xs text-faint">Noch keine Verkäufe – Trade ist offen.</p>}
            </div>
          </section>

          {/* Offene Kaufangebote */}
          <section>
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Offene Kaufangebote (reservieren Kapital)</h3>
              <Button size="sm" variant="outline" onClick={() => setD((x) => ({ ...x, offers: [...x.offers, { id: newId(), date: Date.now(), quantity: null, price: null }] }))}>
                <Plus /> Angebot
              </Button>
            </div>
            <div className="space-y-2">
              {d.offers.map((o, i) => (
                <div key={o.id} className="grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto_auto]">
                  <Input type="datetime-local" value={toLocalInput(o.date)} onChange={(e) => upd("offers", i, { date: fromLocalInput(e.target.value) })} aria-label="Angebotsdatum" />
                  <AmountInput value={o.quantity} onChange={(v) => upd("offers", i, { quantity: v })} placeholder="Menge" aria-label="Angebotsmenge" />
                  <AmountInput value={o.price} onChange={(v) => upd("offers", i, { price: v })} placeholder="Gebot/Stk" aria-label="Gebot pro Stück" />
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
                    Gefüllt → Kauf
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => del("offers", i)} aria-label="Angebot löschen">
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          </section>

          {summary && (
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-surface-2 p-3 text-xs sm:grid-cols-4" data-testid="trade-preview">
              <div>
                <div className="text-faint">Gekauft / verkauft / offen</div>
                <div className="num">{summary.boughtQty} / {summary.soldQty} / {summary.openQty}</div>
              </div>
              <div>
                <div className="text-faint">Ø Einkaufspreis</div>
                <Gp value={summary.avgBuyPrice} />
              </div>
              <div>
                <div className="text-faint">Realisiert (FIFO, netto)</div>
                <Gp value={summary.realized} colored />
              </div>
              <div>
                <div className="text-faint">ROI realisiert</div>
                <Pct value={summary.roi} />
              </div>
              {meta?.limit != null && summary.boughtQty > meta.limit && (
                <div className="col-span-full text-warn">Hinweis: Gesamtmenge übersteigt das 4-h-Kauflimit ({meta.limit}) – bei Käufen über mehrere Zeitfenster unkritisch.</div>
              )}
            </div>
          )}
          {summary && summary.errors.length > 0 && <ErrorNote>{summary.errors.join(" ")}</ErrorNote>}
          {errors.length > 0 && <ErrorNote>{errors.join(" ")}</ErrorNote>}
          <InfoNote>Gewinne werden nach FIFO berechnet: Verkäufe werden den ältesten offenen Kaufchargen zugeordnet. Ohne Angabe wird die GE-Steuer nach den aktuellen Regeln berechnet.</InfoNote>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button variant="primary" onClick={save} data-testid="save-trade">
              Speichern
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

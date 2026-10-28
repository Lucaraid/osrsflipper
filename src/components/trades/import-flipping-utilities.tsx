"use client";
import { FileUp } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ErrorNote, Gp, InfoNote } from "@/components/common/indicators";
import { ItemIcon } from "@/components/common/item-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/input";
import { Tip } from "@/components/ui/tooltip";
import { useItemMap, useItems } from "@/hooks/market";
import { date } from "@/lib/format";
import { isPreselected, nameResolver, parseFlippingUtilitiesCsv, planImport, type FuParseResult, type ImportCandidate, type ImportPlan } from "@/lib/import/flipping-utilities";
import { useDataStore } from "@/state/data";
import { toast } from "@/state/toasts";

const PERIODS = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "365", label: "Last year", days: 365 },
  { key: "all", label: "Everything", days: null },
] as const;

function kindBadge(c: ImportCandidate) {
  if (c.kind === "conflict") return <Badge tone="neg">conflict</Badge>;
  if (c.kind === "update") return <Badge tone="info">adds {c.added} {c.added === 1 ? "row" : "rows"}</Badge>;
  return c.closed ? <Badge tone="pos">finished flip</Badge> : <Badge tone="warn">still open</Badge>;
}

/** Import der GE-Historie aus dem RuneLite-Plugin „Flipping Utilities“ (CSV) mit Vorschau. */
export function ImportFlippingUtilities() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="fu-import">
        <FileUp /> Import from RuneLite
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open && <ImportDialog onDone={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}

function ImportDialog({ onDone }: { onDone: () => void }) {
  const items = useItems();
  const itemMap = useItemMap();
  const trades = useDataStore((s) => s.trades);
  const saveTrades = useDataStore((s) => s.saveTrades);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<FuParseResult | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["key"]>("30");
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = async (file: File) => {
    const text = await file.text();
    const p = parseFlippingUtilitiesCsv(text);
    const t = Date.now();
    const pl = planImport(p.rows, { resolve: nameResolver(items.data?.items ?? []), existing: trades, now: t });
    setFileName(file.name);
    setParsed(p);
    setPlan(pl);
    setNow(t);
    setSelected(new Set(pl.candidates.filter((c) => isPreselected(c, t)).map((c) => c.key)));
  };

  const days = PERIODS.find((p) => p.key === period)?.days ?? null;
  const visible = useMemo(
    () => (plan?.candidates ?? []).filter((c) => c.kind !== "duplicate" && (days == null || c.lastDate >= now - days * 86_400_000)),
    [plan, days, now],
  );
  const duplicates = plan?.candidates.filter((c) => c.kind === "duplicate").length ?? 0;
  const chosen = visible.filter((c) => selected.has(c.key) && c.trade && c.errors.length === 0);
  const selectable = visible.filter((c) => c.trade && c.errors.length === 0);
  const allChosen = selectable.length > 0 && selectable.every((c) => selected.has(c.key));

  const toggle = (key: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const toggleAll = () =>
    setSelected((s) => {
      const n = new Set(s);
      for (const c of selectable) {
        if (allChosen) n.delete(c.key);
        else n.add(c.key);
      }
      return n;
    });

  const doImport = async () => {
    setBusy(true);
    const res = await saveTrades(chosen.map((c) => c.trade!), "imported", `Flipping Utilities CSV (${fileName})`);
    setBusy(false);
    if (!res.ok) {
      toast(`Import failed: ${res.errors.slice(0, 3).join(" ")}`, "neg");
      return;
    }
    const updates = chosen.filter((c) => c.kind === "update").length;
    toast(`Imported ${chosen.length - updates} new ${chosen.length - updates === 1 ? "trade" : "trades"}${updates ? `, updated ${updates}` : ""}.`, "pos");
    onDone();
  };

  return (
    <DialogContent title="Import from RuneLite (Flipping Utilities)" className="max-w-3xl" description="Turns your GE history into trades. The file is read in your browser and never uploaded.">
      <div className="space-y-3 text-sm" data-testid="fu-dialog">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={!items.data} data-testid="fu-choose">
            <FileUp /> {parsed ? "Choose another file" : "Choose CSV file"}
          </Button>
          {fileName && <span className="text-xs text-muted">{fileName}</span>}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            data-testid="fu-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void load(f);
              e.target.value = "";
            }}
          />
        </div>

        {!parsed && (
          <InfoNote>
            In RuneLite, open the <b>Flipping Utilities</b> panel and use its <b>Export</b> button to save your trades as CSV. Then choose that file here. You can import the same file again later – trades that are already here are recognised and only new buys/sells are added.
          </InfoNote>
        )}
        {!items.data && <ErrorNote>The item list is not loaded yet – it is needed to match item names. Please try again in a moment.</ErrorNote>}

        {parsed && !parsed.recognized && <ErrorNote>This file doesn’t look like a Flipping Utilities export (expected the columns name, date, quantity, price, state).</ErrorNote>}

        {parsed?.recognized && plan && (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Show trades with activity in">
                <Select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} aria-label="Period" data-testid="fu-period">
                  {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </Select>
              </Field>
              <p className="pb-1 text-xs text-muted" data-testid="fu-summary">
                {visible.length} {visible.length === 1 ? "trade" : "trades"} · {visible.filter((c) => c.closed).length} finished · {visible.filter((c) => !c.closed).length} still open
                {duplicates > 0 && ` · ${duplicates} already imported (hidden)`}
              </p>
            </div>

            <div className="space-y-1 text-xs">
              {plan.skippedSells.rows > 0 && (
                <InfoNote>
                  Skipped {plan.skippedSells.rows} {plan.skippedSells.rows === 1 ? "sell" : "sells"} ({plan.skippedSells.quantity.toLocaleString("de-CH")} {plan.skippedSells.quantity === 1 ? "item" : "items"}) of things you didn’t buy on the GE, e.g. drops or skilling – they are not flips.
                </InfoNote>
              )}
              {plan.unknownItems.size > 0 && (
                <InfoNote tone="warn">
                  <Tip content={<div className="max-w-xs">{[...plan.unknownItems.keys()].slice(0, 30).join(", ")}{plan.unknownItems.size > 30 ? " …" : ""}</div>}>
                    <span className="cursor-help underline decoration-dotted" data-testid="fu-unknown">
                      {plan.unknownItems.size} item {plan.unknownItems.size === 1 ? "name" : "names"} not found in the item list
                    </span>
                  </Tip>{" "}
                  (renamed or no longer tradeable) – these rows are skipped.
                </InfoNote>
              )}
              {parsed.errors.length > 0 && (
                <ErrorNote>
                  {parsed.errors.length} {parsed.errors.length === 1 ? "line" : "lines"} could not be read and are skipped
                  {parsed.errors.slice(0, 3).map((e) => <div key={e.line}>Line {e.line}: {e.text}</div>)}
                </ErrorNote>
              )}
              <p className="text-faint">Old open positions (no activity for 14+ days) are not ticked: they are usually supplies you used, not flips. Profit includes the GE tax that applied on each sale date.</p>
            </div>

            {visible.length === 0 ? (
              <InfoNote>No trades in this period{duplicates > 0 ? " that aren’t imported yet" : ""}. Choose a longer period above.</InfoNote>
            ) : (
              <div className="max-h-[45vh] overflow-auto rounded-lg border border-border">
                <table className="w-full text-xs" data-testid="fu-table">
                  <thead className="sticky top-0 bg-surface-2 text-left text-muted">
                    <tr>
                      <th className="px-2 py-1.5">
                        <input type="checkbox" checked={allChosen} onChange={toggleAll} aria-label="Select all" data-testid="fu-select-all" />
                      </th>
                      <th className="px-2 py-1.5">Item</th>
                      <th className="px-2 py-1.5">Status</th>
                      <th className="px-2 py-1.5 text-right">Bought</th>
                      <th className="px-2 py-1.5 text-right">Sold</th>
                      <th className="px-2 py-1.5 text-right">Profit</th>
                      <th className="px-2 py-1.5 text-right">Last activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visible.map((c) => {
                      const disabled = !c.trade || c.errors.length > 0;
                      return (
                        <tr key={c.key} className={disabled ? "opacity-60" : undefined} data-testid="fu-row">
                          <td className="px-2 py-1">
                            <input type="checkbox" checked={!disabled && selected.has(c.key)} disabled={disabled} onChange={() => toggle(c.key)} aria-label={`Import ${c.itemName}`} />
                          </td>
                          <td className="px-2 py-1">
                            <span className="flex items-center gap-1.5">
                              <ItemIcon icon={itemMap.get(c.itemId)?.icon} name={c.itemName} size={16} />
                              <span className="truncate">{c.itemName}</span>
                            </span>
                          </td>
                          <td className="px-2 py-1">
                            {c.errors.length > 0 ? (
                              <Tip content={<div className="max-w-xs">{c.errors.join(" ")}</div>}>
                                <span className="cursor-help">{kindBadge(c)}</span>
                              </Tip>
                            ) : (
                              kindBadge(c)
                            )}
                          </td>
                          <td className="num px-2 py-1 text-right">{c.boughtQty.toLocaleString("de-CH")}</td>
                          <td className="num px-2 py-1 text-right">{c.soldQty.toLocaleString("de-CH")}</td>
                          <td className="px-2 py-1 text-right">{c.soldQty > 0 ? <Gp value={c.realized} short colored /> : <span className="text-faint">–</span>}</td>
                          <td className="px-2 py-1 text-right text-muted">{date(c.lastDate)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onDone}>Cancel</Button>
              <Button variant="primary" onClick={() => void doImport()} disabled={busy || chosen.length === 0} data-testid="fu-confirm">
                Import {chosen.length} {chosen.length === 1 ? "trade" : "trades"}
              </Button>
            </div>
          </>
        )}
      </div>
    </DialogContent>
  );
}

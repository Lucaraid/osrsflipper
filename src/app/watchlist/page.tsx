"use client";
import { Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Age, EmptyState, Est, Gp, PageHeader, Pct, QualityBadge } from "@/components/common/indicators";
import { ItemIcon } from "@/components/common/item-icon";
import { ItemPicker } from "@/components/items/item-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AmountInput, Field, Input } from "@/components/ui/input";
import { useCandidates, useItemMap } from "@/hooks/market";
import type { WatchItem } from "@/lib/portfolio/schemas";
import { useDataStore } from "@/state/data";
import { toast } from "@/state/toasts";

function Targets({ w, onSave }: { w: WatchItem; onSave: (w: WatchItem) => void }) {
  const [d, setD] = useState(w);
  const dirty = JSON.stringify(d) !== JSON.stringify(w);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
      <Field label="Ziel-Kaufpreis"><AmountInput value={d.targetBuy} onChange={(v) => setD({ ...d, targetBuy: v })} aria-label="Ziel-Kaufpreis" /></Field>
      <Field label="Ziel-Verkaufspreis"><AmountInput value={d.targetSell} onChange={(v) => setD({ ...d, targetSell: v })} aria-label="Ziel-Verkaufspreis" /></Field>
      <Field label="Zielmarge (gp)"><AmountInput value={d.targetMargin} onChange={(v) => setD({ ...d, targetMargin: v })} aria-label="Zielmarge" /></Field>
      <Field label="Ziel-ROI (%)">
        <Input type="number" step="0.1" value={d.targetRoi == null ? "" : +(d.targetRoi * 100).toFixed(4)} onChange={(e) => setD({ ...d, targetRoi: e.target.value === "" ? null : Number(e.target.value) / 100 })} aria-label="Ziel-ROI" />
      </Field>
      <Field label="Notiz"><Input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value.slice(0, 1000) })} aria-label="Notiz" /></Field>
      <div className="flex items-end">
        <Button size="sm" variant={dirty ? "primary" : "outline"} disabled={!dirty} onClick={() => onSave(d)}>Speichern</Button>
      </div>
    </div>
  );
}

export default function WatchlistPage() {
  const { watchlist, upsertWatch, removeWatch, loaded } = useDataStore();
  const items = useItemMap();
  const { candidates } = useCandidates();
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const [open, setOpen] = useState<number | null>(null);
  const sorted = useMemo(() => [...watchlist].sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.addedAt - a.addedAt), [watchlist]);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Watchlist" description="Beobachtete Items mit eigenen Zielpreisen und Notizen (lokal gespeichert)." />
      <Card className="mb-3 p-3">
        <Field label="Item zur Watchlist hinzufügen">
          <div className="max-w-sm">
            <ItemPicker
              value={null}
              onChange={async (it) => {
                if (!it || watchlist.some((w) => w.itemId === it.id)) return;
                await upsertWatch({ itemId: it.id, addedAt: Date.now(), favorite: false, note: "", targetBuy: null, targetSell: null, targetMargin: null, targetRoi: null });
                toast(`${it.name} hinzugefügt.`, "pos");
              }}
              testId="watch-add"
            />
          </div>
        </Field>
      </Card>
      <Card className="overflow-hidden">
        {loaded && sorted.length === 0 ? (
          <EmptyState title="Watchlist ist leer">Füge Items hinzu, um Preise, Margen und eigene Ziele zu verfolgen.</EmptyState>
        ) : (
          <ul className="divide-y divide-border" data-testid="watchlist">
            {sorted.map((w) => {
              const m = items.get(w.itemId);
              const c = byId.get(w.itemId);
              const hits: string[] = [];
              if (w.targetBuy != null && c?.latestLow != null && c.latestLow <= w.targetBuy) hits.push("Kaufziel erreicht");
              if (w.targetSell != null && c?.latestHigh != null && c.latestHigh >= w.targetSell) hits.push("Verkaufsziel erreicht");
              if (w.targetMargin != null && c?.netMargin != null && c.netMargin >= w.targetMargin) hits.push("Zielmarge erreicht");
              if (w.targetRoi != null && c?.roi != null && c.roi >= w.targetRoi) hits.push("Ziel-ROI erreicht");
              return (
                <li key={w.itemId} className="px-3 py-2" data-testid="watch-row">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <button type="button" onClick={() => upsertWatch({ ...w, favorite: !w.favorite })} aria-label={w.favorite ? "Favorit entfernen" : "Als Favorit markieren"} className={w.favorite ? "text-accent" : "text-faint hover:text-accent"}>
                      <Star className={w.favorite ? "size-4 fill-current" : "size-4"} />
                    </button>
                    <Link href={`/items/${w.itemId}`} className="flex min-w-[180px] flex-1 items-center gap-2 hover:text-accent">
                      <ItemIcon icon={m?.icon} name={m?.name ?? ""} size={20} />
                      <span className="truncate font-medium">{m?.name ?? `Item #${w.itemId}`}</span>
                    </Link>
                    <span className="text-xs"><span className="text-faint">Inst.-Buy </span><Gp value={c?.latestHigh} /></span>
                    <span className="text-xs"><span className="text-faint">Inst.-Sell </span><Gp value={c?.latestLow} /></span>
                    <span className="text-xs"><span className="text-faint">Marge<Est /> </span><Gp value={c?.netMargin} colored /></span>
                    <span className="text-xs"><span className="text-faint">ROI </span><Pct value={c?.roi} /></span>
                    <span className="text-xs"><Age seconds={c?.ageSec ?? null} /></span>
                    {c && <QualityBadge q={c.quality} compact />}
                    {hits.map((h) => <Badge key={h} tone="pos">{h}</Badge>)}
                    <div className="ml-auto flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setOpen(open === w.itemId ? null : w.itemId)}>Ziele</Button>
                      <Button size="icon" variant="ghost" onClick={async () => { await removeWatch(w.itemId); toast("Entfernt."); }} aria-label="Von Watchlist entfernen"><Trash2 /></Button>
                    </div>
                  </div>
                  {w.note && open !== w.itemId && <p className="mt-1 pl-6 text-xs text-muted">{w.note}</p>}
                  {open === w.itemId && (
                    <div className="mt-2 pl-6">
                      <Targets w={w} onSave={async (n) => { await upsertWatch(n); toast("Ziele gespeichert.", "pos"); }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <p className="mt-2 text-[11px] text-faint">Für automatische Hinweise bei Zielpreisen siehe <Link className="underline" href="/alerts">Preisalarme</Link>.</p>
    </div>
  );
}

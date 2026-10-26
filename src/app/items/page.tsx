"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { Age, EmptyState, Gp, PageHeader, QualityBadge, Skeleton } from "@/components/common/indicators";
import { ItemIcon } from "@/components/common/item-icon";
import { WatchButton } from "@/components/common/watch-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { useCandidates, useItems, useSearchIndex } from "@/hooks/market";
import { gpShort } from "@/lib/format";
import { searchItems } from "@/lib/search/search";

const PAGE = 60;
type SortBy = "relevance" | "name" | "price" | "volume" | "limit";

export default function ItemsPage() {
  const items = useItems();
  const index = useSearchIndex();
  const { candidates } = useCandidates();
  const [q, setQ] = useState("");
  const [members, setMembers] = useState<"" | "f" | "m">("");
  const [sort, setSort] = useState<SortBy>("relevance");
  const [onlyTraded, setOnlyTraded] = useState(true);
  const [page, setPage] = useState(0);
  const dq = useDeferredValue(q);
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);

  const list = useMemo(() => {
    let base = dq.trim() ? searchItems(index, dq, 5000) : [...(items.data?.items ?? [])];
    if (members) base = base.filter((i) => (members === "m" ? i.members : !i.members));
    if (onlyTraded) base = base.filter((i) => byId.has(i.id));
    const val = (id: number, k: SortBy) => {
      const c = byId.get(id);
      if (k === "price") return c?.latestHigh ?? c?.latestLow ?? -1;
      if (k === "volume") return c?.vol24h ?? -1;
      if (k === "limit") return c?.limit ?? -1;
      return 0;
    };
    if (sort === "name" || (sort === "relevance" && !dq.trim())) base.sort((a, b) => a.name.localeCompare(b.name, "de") || a.id - b.id);
    else if (sort !== "relevance") base.sort((a, b) => val(b.id, sort) - val(a.id, sort) || a.id - b.id);
    return base;
  }, [dq, index, items.data, members, onlyTraded, byId, sort]);

  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const visible = list.slice(cur * PAGE, cur * PAGE + PAGE);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Item Explorer" description={`${(items.data?.meta.count ?? 0).toLocaleString("de-CH")} handelbare Items aus /mapping · Suche nach Name oder ID`} />
      <Card className="mb-3 grid grid-cols-2 gap-2 p-3 sm:grid-cols-5">
        <Input className="col-span-2" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Name oder Item-ID…" aria-label="Items suchen" data-testid="explorer-search" />
        <Select value={members} onChange={(e) => setMembers(e.target.value as typeof members)} aria-label="Mitgliedschaft">
          <option value="">F2P & Members</option>
          <option value="f">Nur F2P</option>
          <option value="m">Nur Members</option>
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as SortBy)} aria-label="Sortierung">
          <option value="relevance">Relevanz / Name</option>
          <option value="name">Name</option>
          <option value="price">Preis (Inst.-Buy)</option>
          <option value="volume">Volumen 24h</option>
          <option value="limit">Handelslimit</option>
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={onlyTraded} onChange={(e) => setOnlyTraded(e.target.checked)} /> nur mit Marktdaten
        </label>
      </Card>
      <Card className="overflow-hidden">
        {items.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-7" />)}</div>
        ) : visible.length === 0 ? (
          <EmptyState title="Keine Items gefunden" />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full text-sm" data-testid="explorer-table">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-2 py-2 text-right font-medium">Inst.-Buy</th>
                  <th className="px-2 py-2 text-right font-medium">Inst.-Sell</th>
                  <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Limit</th>
                  <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Vol. 24h</th>
                  <th className="hidden px-2 py-2 text-right font-medium md:table-cell">Datenalter</th>
                  <th className="hidden px-2 py-2 font-medium md:table-cell">Qualität</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {visible.map((it) => {
                  const c = byId.get(it.id);
                  return (
                    <tr key={it.id} className="border-b border-border/60 hover:bg-surface-2/60">
                      <td className="px-3 py-1.5">
                        <Link href={`/items/${it.id}`} className="flex items-center gap-2 hover:text-accent" data-testid="explorer-item">
                          <ItemIcon icon={it.icon} name={it.name} size={20} />
                          <span className="min-w-0">
                            <span className="block max-w-[220px] truncate">{it.name}</span>
                            <span className="text-[10px] text-faint">#{it.id} {it.members ? "" : <Badge className="ml-1">F2P</Badge>}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-2 py-1.5 text-right"><Gp value={c?.latestHigh} /></td>
                      <td className="px-2 py-1.5 text-right"><Gp value={c?.latestLow} /></td>
                      <td className="hidden px-2 py-1.5 text-right num sm:table-cell">{it.limit != null ? it.limit.toLocaleString("de-CH") : <span className="text-faint">–</span>}</td>
                      <td className="hidden px-2 py-1.5 text-right num text-muted sm:table-cell">{c?.vol24h != null ? gpShort(c.vol24h) : "–"}</td>
                      <td className="hidden px-2 py-1.5 text-right text-xs md:table-cell"><Age seconds={c?.ageSec ?? null} /></td>
                      <td className="hidden px-2 py-1.5 md:table-cell">{c ? <QualityBadge q={c.quality} compact /> : <span className="text-xs text-faint">–</span>}</td>
                      <td className="px-2"><WatchButton itemId={it.id} name={it.name} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {list.length > PAGE && (
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted">
            <span>{list.length.toLocaleString("de-CH")} Items · Seite {cur + 1}/{pages}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Vorherige Seite"><ChevronLeft /></Button>
              <Button size="sm" variant="outline" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Nächste Seite"><ChevronRight /></Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

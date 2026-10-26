"use client";
import * as D from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ItemIcon } from "@/components/common/item-icon";
import { useItems, useSearchIndex } from "@/hooks/market";
import { searchItems } from "@/lib/search/search";
import { cn } from "@/lib/utils";

/** Globale Item-Suche (Strg/Cmd+K). Sucht lokal in den bereits geladenen Metadaten. */
export function SearchCommand() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const deferred = useDeferredValue(q);
  const index = useSearchIndex();
  const { isLoading } = useItems();
  const router = useRouter();
  const results = useMemo(() => searchItems(index, deferred, 12), [index, deferred]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (id: number) => {
    setOpen(false);
    setQ("");
    router.push(`/items/${id}`);
  };

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger asChild>
        <button
          type="button"
          className="flex h-8 w-full max-w-xs items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 text-xs text-faint hover:border-border-strong"
          data-testid="global-search"
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left">Item suchen…</span>
          <kbd className="hidden rounded border border-border px-1 text-[10px] sm:inline">Strg K</kbd>
        </button>
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <D.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-1.5rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface shadow-2xl animate-fade-in">
          <D.Title className="sr-only">Item suchen</D.Title>
          <D.Description className="sr-only">Nach Item-Name oder Item-ID suchen</D.Description>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 text-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === "Enter" && results[active]) go(results[active].id);
              }}
              placeholder="Name oder Item-ID…"
              className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
              aria-label="Item suchen"
              data-testid="search-input"
            />
          </div>
          <ul className="max-h-[50vh] overflow-y-auto py-1" role="listbox">
            {isLoading && <li className="px-3 py-2 text-xs text-muted">Lade Item-Daten…</li>}
            {!isLoading && q && results.length === 0 && <li className="px-3 py-2 text-xs text-muted">Keine Treffer.</li>}
            {results.map((it, i) => (
              <li key={it.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(it.id)}
                  className={cn("flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm", i === active && "bg-surface-2")}
                >
                  <ItemIcon icon={it.icon} name={it.name} size={22} />
                  <span className="flex-1 truncate">{it.name}</span>
                  <span className="num text-xs text-faint">#{it.id}</span>
                </button>
              </li>
            ))}
          </ul>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

"use client";
import { useDeferredValue, useId, useMemo, useRef, useState } from "react";
import { ItemIcon } from "@/components/common/item-icon";
import { inputClass } from "@/components/ui/input";
import { useItemMap, useSearchIndex } from "@/hooks/market";
import type { ItemMeta } from "@/lib/market/types";
import { searchItems } from "@/lib/search/search";
import { cn } from "@/lib/utils";

/** Combobox zur Item-Auswahl (Name oder ID), sucht lokal. */
export function ItemPicker({ value, onChange, placeholder = "Search items…", id, testId }: { value: number | null; onChange: (item: ItemMeta | null) => void; placeholder?: string; id?: string; testId?: string }) {
  const index = useSearchIndex();
  const items = useItemMap();
  const selected = value != null ? items.get(value) : undefined;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const deferred = useDeferredValue(q);
  const results = useMemo(() => searchItems(index, deferred, 10), [index, deferred]);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listId = useId();

  const choose = (it: ItemMeta) => {
    onChange(it);
    setQ("");
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        {selected && !open && (
          <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2">
            <ItemIcon icon={selected.icon} name={selected.name} size={16} />
          </span>
        )}
        <input
          id={id}
          className={cn(inputClass, selected && !open && "pl-8")}
          value={open ? q : (selected?.name ?? (value != null ? `Item #${value}` : ""))}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true);
            setQ("");
          }}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 150);
          }}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter" && results[active]) { e.preventDefault(); choose(results[active]); }
            if (e.key === "Escape") setOpen(false);
          }}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          data-testid={testId}
        />
      </div>
      {open && q && (
        <ul id={listId} className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-xl" role="listbox">
          {results.length === 0 && <li className="px-3 py-1.5 text-xs text-muted">No matches</li>}
          {results.map((it, i) => (
            <li key={it.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={cn("flex w-full items-center gap-2 px-2.5 py-1 text-left text-sm", i === active && "bg-surface-2")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(it)}
                onMouseEnter={() => setActive(i)}
              >
                <ItemIcon icon={it.icon} name={it.name} size={18} />
                <span className="flex-1 truncate">{it.name}</span>
                <span className="num text-[10px] text-faint">#{it.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

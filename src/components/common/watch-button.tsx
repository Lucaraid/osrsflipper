"use client";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/state/data";
import { toast } from "@/state/toasts";

export function WatchButton({ itemId, name, className, withLabel }: { itemId: number; name: string; className?: string; withLabel?: boolean }) {
  const watched = useDataStore((s) => s.watchlist.some((w) => w.itemId === itemId));
  const upsert = useDataStore((s) => s.upsertWatch);
  const remove = useDataStore((s) => s.removeWatch);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          if (watched) {
            await remove(itemId);
            toast(`${name} von der Watchlist entfernt.`);
          } else {
            await upsert({ itemId, addedAt: Date.now(), favorite: false, note: "", targetBuy: null, targetSell: null, targetMargin: null, targetRoi: null });
            toast(`${name} zur Watchlist hinzugefügt.`, "pos");
          }
        } catch (err) {
          toast(`Speichern fehlgeschlagen: ${(err as Error).message}`, "neg");
        }
      }}
      className={cn("inline-flex items-center gap-1 rounded p-1 text-faint hover:text-accent", watched && "text-accent", className)}
      aria-label={watched ? `${name} von Watchlist entfernen` : `${name} zur Watchlist hinzufügen`}
      aria-pressed={watched}
      data-testid={`watch-${itemId}`}
    >
      <Star className={cn("size-4", watched && "fill-current")} />
      {withLabel && <span className="text-xs">{watched ? "Auf Watchlist" : "Zur Watchlist"}</span>}
    </button>
  );
}

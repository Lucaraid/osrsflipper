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
            toast(`${name} removed from watchlist.`);
          } else {
            await upsert({ itemId, addedAt: Date.now(), favorite: false, note: "", targetBuy: null, targetSell: null, targetMargin: null, targetRoi: null });
            toast(`${name} added to watchlist.`, "pos");
          }
        } catch (err) {
          toast(`Saving failed: ${(err as Error).message}`, "neg");
        }
      }}
      className={cn("inline-flex items-center gap-1 rounded p-1 text-faint hover:text-accent", watched && "text-accent", className)}
      aria-label={watched ? `Remove ${name} from watchlist` : `Add ${name} to watchlist`}
      aria-pressed={watched}
      data-testid={`watch-${itemId}`}
    >
      <Star className={cn("size-4", watched && "fill-current")} />
      {withLabel && <span className="text-xs">{watched ? "Auf Watchlist" : "Zur Watchlist"}</span>}
    </button>
  );
}

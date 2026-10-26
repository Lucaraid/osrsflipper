/* eslint-disable @next/next/no-img-element */
import { iconUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Item-Icon direkt vom OSRS Wiki (lazy). Fällt bei Ladefehler auf einen neutralen Platzhalter zurück. */
export function ItemIcon({ icon, name, size = 24, className }: { icon: string | null | undefined; name: string; size?: number; className?: string }) {
  const url = iconUrl(icon);
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded bg-surface-2", className)} style={{ width: size + 4, height: size + 4 }}>
      {url ? (
        <img
          src={url}
          alt=""
          aria-hidden
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="object-contain [image-rendering:pixelated]"
          style={{ maxWidth: size, maxHeight: size }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
          }}
        />
      ) : (
        <span className="text-[10px] text-faint">{name.slice(0, 1)}</span>
      )}
    </span>
  );
}

"use client";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToasts } from "@/state/toasts";

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-16 right-3 z-50 flex w-[min(360px,calc(100vw-1.5rem))] flex-col gap-2 md:bottom-4" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex items-start gap-2 rounded-md border bg-surface px-3 py-2 text-sm shadow-lg animate-fade-in",
            t.tone === "pos" && "border-pos/50",
            t.tone === "neg" && "border-neg/50",
            t.tone === "warn" && "border-warn/50",
            t.tone === "neutral" && "border-border",
          )}
        >
          <span className="flex-1">{t.text}</span>
          <button type="button" onClick={() => dismiss(t.id)} className="text-muted hover:text-text" aria-label="Close">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

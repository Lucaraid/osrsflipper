"use client";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  dismissible = true,
  ...rest
}: { title: string; description?: string; children: React.ReactNode; className?: string; dismissible?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  // Nicht schliessbar: kein X, Escape und Klick daneben werden ignoriert
  const block = dismissible ? undefined : (e: Event) => e.preventDefault();
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-black/60 animate-fade-in" />
      <D.Content
        {...rest}
        onEscapeKeyDown={block}
        onInteractOutside={block}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-surface p-4 shadow-2xl animate-fade-in",
          className,
        )}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <D.Title className="text-base font-semibold">{title}</D.Title>
            {description ? <D.Description className="text-xs text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          {dismissible && (
            <D.Close className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          )}
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}

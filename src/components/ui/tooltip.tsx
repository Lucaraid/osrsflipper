"use client";
import * as T from "@radix-ui/react-tooltip";
import * as React from "react";

export const TooltipProvider = T.Provider;

export function Tip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  if (!content) return <>{children}</>;
  return (
    <T.Root delayDuration={200}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={4} className="z-50 max-w-xs rounded-md border border-border bg-surface-3 px-2.5 py-1.5 text-xs text-text shadow-lg animate-fade-in">
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

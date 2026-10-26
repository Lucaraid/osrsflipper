"use client";
import * as T from "@radix-ui/react-tabs";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn("inline-flex rounded-full border border-border bg-surface-2 p-1", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn("rounded-full px-3 py-1 text-xs font-semibold text-muted transition-colors hover:text-text data-[state=active]:bg-accent data-[state=active]:text-accent-fg data-[state=active]:shadow-card", className)}
      {...props}
    />
  );
}

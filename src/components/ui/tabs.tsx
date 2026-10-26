"use client";
import * as T from "@radix-ui/react-tabs";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn("inline-flex rounded-md border border-border bg-surface-2 p-0.5", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn("rounded px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:text-text data-[state=active]:bg-surface-3 data-[state=active]:text-text", className)}
      {...props}
    />
  );
}

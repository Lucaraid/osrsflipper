"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/layout/toaster";
import { FolderSync } from "@/components/layout/folder-sync";
import { useDataStore } from "@/state/data";
import { useSettingsStore } from "@/state/settings";

function Hydrator() {
  const hydrate = useSettingsStore((s) => s.hydrate);
  const theme = useSettingsStore((s) => s.settings.theme);
  const hydrated = useSettingsStore((s) => s.hydrated);
  const load = useDataStore((s) => s.load);
  useEffect(() => {
    hydrate();
    void load();
  }, [hydrate, load]);
  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("osrs-ge-flipper:theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme, hydrated]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 2, retryDelay: (n) => Math.min(1000 * 2 ** n, 15_000) } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <Hydrator />
        <FolderSync />
        {children}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

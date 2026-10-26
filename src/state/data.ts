"use client";
import { create } from "zustand";
import * as db from "@/lib/storage/db";
import type { AlertEvent } from "@/lib/storage/db";
import { validateTrade } from "@/lib/portfolio/fifo";
import type { Alert, CapitalEvent, Trade, WatchItem } from "@/lib/portfolio/schemas";
import { TradeSchema } from "@/lib/portfolio/schemas";
import type { Backup } from "@/lib/storage/backup";

/**
 * Zentraler Client-Store für persönliche Daten. Quelle der Wahrheit ist IndexedDB;
 * der Store hält eine Kopie für die UI. Schreibvorgänge gehen zuerst in die DB.
 */
interface DataState {
  loaded: boolean;
  error: string | null;
  trades: Trade[];
  capital: CapitalEvent[];
  watchlist: WatchItem[];
  alerts: Alert[];
  alertEvents: AlertEvent[];
  load: () => Promise<void>;
  saveTrade: (t: Trade, action: string, detail: string) => Promise<{ ok: true } | { ok: false; errors: string[] }>;
  deleteTrade: (id: string) => Promise<void>;
  addCapital: (e: CapitalEvent) => Promise<void>;
  deleteCapital: (id: string) => Promise<void>;
  upsertWatch: (w: WatchItem) => Promise<void>;
  removeWatch: (itemId: number) => Promise<void>;
  saveAlert: (a: Alert) => Promise<void>;
  deleteAlert: (id: string) => Promise<void>;
  addAlertEvents: (events: AlertEvent[]) => Promise<void>;
  importBackup: (b: Backup) => Promise<void>;
  clearAll: () => Promise<void>;
}

const byDateDesc = <T extends { updatedAt?: number; date?: number }>(a: T, b: T) => (b.updatedAt ?? b.date ?? 0) - (a.updatedAt ?? a.date ?? 0);

export const useDataStore = create<DataState>((set, get) => ({
  loaded: false,
  error: null,
  trades: [],
  capital: [],
  watchlist: [],
  alerts: [],
  alertEvents: [],

  load: async () => {
    try {
      const [trades, capital, watchlist, alerts, alertEvents] = await Promise.all([
        db.getAll("trades"),
        db.getAll("capital"),
        db.getAll("watchlist"),
        db.getAll("alerts"),
        db.getAll("alertEvents"),
      ]);
      set({
        loaded: true,
        error: null,
        trades: trades.sort(byDateDesc),
        capital: capital.sort((a, b) => a.date - b.date),
        watchlist,
        alerts,
        alertEvents: alertEvents.sort((a, b) => b.at - a.at).slice(0, 200),
      });
    } catch (err) {
      set({ loaded: true, error: err instanceof Error ? err.message : String(err) });
    }
  },

  saveTrade: async (t, action, detail) => {
    const now = Date.now();
    const candidate = { ...t, updatedAt: now, history: [...t.history, { at: now, action, detail: detail.slice(0, 500) }].slice(-500) };
    const parsed = TradeSchema.safeParse(candidate);
    if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
    const errors = validateTrade(parsed.data);
    if (errors.length) return { ok: false, errors };
    await db.put("trades", parsed.data);
    set({ trades: [parsed.data, ...get().trades.filter((x) => x.id !== t.id)].sort(byDateDesc) });
    return { ok: true };
  },
  deleteTrade: async (id) => {
    await db.remove("trades", id);
    set({ trades: get().trades.filter((t) => t.id !== id) });
  },
  addCapital: async (e) => {
    await db.put("capital", e);
    set({ capital: [...get().capital.filter((c) => c.id !== e.id), e].sort((a, b) => a.date - b.date) });
  },
  deleteCapital: async (id) => {
    await db.remove("capital", id);
    set({ capital: get().capital.filter((c) => c.id !== id) });
  },
  upsertWatch: async (w) => {
    await db.put("watchlist", w);
    set({ watchlist: [...get().watchlist.filter((x) => x.itemId !== w.itemId), w] });
  },
  removeWatch: async (itemId) => {
    await db.remove("watchlist", itemId);
    set({ watchlist: get().watchlist.filter((x) => x.itemId !== itemId) });
  },
  saveAlert: async (a) => {
    await db.put("alerts", a);
    set({ alerts: [...get().alerts.filter((x) => x.id !== a.id), a] });
  },
  deleteAlert: async (id) => {
    await db.remove("alerts", id);
    set({ alerts: get().alerts.filter((x) => x.id !== id) });
  },
  addAlertEvents: async (events) => {
    await Promise.all(events.map((e) => db.put("alertEvents", e)));
    set({ alertEvents: [...events, ...get().alertEvents].slice(0, 200) });
  },
  importBackup: async (b) => {
    await db.replaceAll(b);
    await get().load();
  },
  clearAll: async () => {
    await db.replaceAll({ trades: [], capital: [], watchlist: [], alerts: [], alertEvents: [] });
    await get().load();
  },
}));

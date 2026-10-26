import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { _resetDbForTests, getAll, put, replaceAll } from "@/lib/storage/db";
import { createBackup, parseBackup } from "@/lib/storage/backup";
import { loadSettings, saveSettings, SETTINGS_KEY } from "@/lib/storage/settings-store";
import { DEFAULT_SETTINGS } from "@/lib/storage/settings-schema";
import type { Trade } from "@/lib/portfolio/schemas";

const trade: Trade = {
  id: "t1", itemId: 4151, itemName: "Abyssal whip", createdAt: 1, updatedAt: 1,
  lots: [{ id: "l1", date: 1, quantity: 5, price: 100, fees: 0 }],
  sales: [{ id: "s1", date: 2, quantity: 3, price: 120, tax: null, fees: 0 }],
  offers: [], notes: "", history: [],
};

function memStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("IndexedDB + Export/Import", () => {
  beforeEach(async () => {
    _resetDbForTests();
    indexedDB.deleteDatabase("osrs-ge-flipper");
  });

  it("Export → Import ergibt identische Daten", async () => {
    await put("trades", trade);
    await put("watchlist", { itemId: 4151, addedAt: 1, favorite: true, note: "n", targetBuy: null, targetSell: null, targetMargin: null, targetRoi: null });
    await put("capital", { id: "c", date: 0, amount: 1000, kind: "deposit", note: "" });
    const backup = createBackup({ settings: DEFAULT_SETTINGS, trades: await getAll("trades"), capital: await getAll("capital"), watchlist: await getAll("watchlist"), alerts: [], alertEvents: [] }, 123);
    const text = JSON.stringify(backup);

    await replaceAll({ trades: [], capital: [], watchlist: [], alerts: [], alertEvents: [] });
    expect(await getAll("trades")).toHaveLength(0);

    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await replaceAll(parsed.backup);
    expect(await getAll("trades")).toEqual([trade]);
    expect((await getAll("watchlist"))[0]?.favorite).toBe(true);
  });

  it("lehnt beschädigte, fremde, neuere und inkonsistente Dateien ab", () => {
    expect(parseBackup("{kaputt").ok).toBe(false);
    expect(parseBackup(JSON.stringify({ format: "anderes" })).ok).toBe(false);
    const newer = parseBackup(JSON.stringify({ format: "osrs-ge-flipper-backup", version: 99 }));
    expect(newer.ok).toBe(false);
    if (!newer.ok) expect(newer.errors[0]).toMatch(/newer version/);
    const base = createBackup({ settings: DEFAULT_SETTINGS, trades: [], capital: [], watchlist: [], alerts: [], alertEvents: [] });
    const invalidTypes = parseBackup(JSON.stringify({ ...base, trades: [{ ...trade, lots: [{ id: "x", date: 1, quantity: -3, price: 1 }] }] }));
    expect(invalidTypes.ok).toBe(false);
    const oversold = parseBackup(JSON.stringify({ ...base, trades: [{ ...trade, sales: [{ id: "s", date: 2, quantity: 50, price: 1, tax: null, fees: 0 }] }] }));
    expect(oversold.ok).toBe(false);
    if (!oversold.ok) expect(oversold.errors[0]).toMatch(/more than you held/);
  });
});

describe("Einstellungen (localStorage)", () => {
  it("speichert, lädt und fällt bei defekten Daten auf Standardwerte zurück", () => {
    const s = memStorage();
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
    saveSettings({ ...DEFAULT_SETTINGS, defaultCapital: 42 }, s);
    expect(loadSettings(s).defaultCapital).toBe(42);
    s.m.set(SETTINGS_KEY, "{nicht json");
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
    s.m.set(SETTINGS_KEY, JSON.stringify({ defaultCapital: -5 }));
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
  });
});

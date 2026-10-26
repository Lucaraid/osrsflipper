import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Alert, CapitalEvent, Trade, WatchItem } from "../portfolio/schemas";

/**
 * Lokale Persistenz in IndexedDB (nur im Browser). Es gibt KEINE Cloud-Synchronisierung.
 * Daten gehen verloren, wenn der Browserspeicher gelöscht wird → regelmässig exportieren.
 */

export interface AlertEvent {
  id: string;
  alertId: string;
  itemId: number;
  at: number;
  text: string;
}

interface FlipperDB extends DBSchema {
  trades: { key: string; value: Trade; indexes: { byItem: number } };
  capital: { key: string; value: CapitalEvent };
  watchlist: { key: number; value: WatchItem };
  alerts: { key: string; value: Alert };
  alertEvents: { key: string; value: AlertEvent; indexes: { byAt: number } };
  /** Interne Metadaten, z. B. der gewählte Speicherordner (FileSystemDirectoryHandle) */
  meta: { key: string; value: unknown };
}

export const DB_NAME = "osrs-ge-flipper";
export const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<FlipperDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<FlipperDB>> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB ist in diesem Browser nicht verfügbar."));
  if (!dbPromise) {
    dbPromise = openDB<FlipperDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const t = db.createObjectStore("trades", { keyPath: "id" });
          t.createIndex("byItem", "itemId");
          db.createObjectStore("capital", { keyPath: "id" });
          db.createObjectStore("watchlist", { keyPath: "itemId" });
          db.createObjectStore("alerts", { keyPath: "id" });
          const e = db.createObjectStore("alertEvents", { keyPath: "id" });
          e.createIndex("byAt", "at");
        }
        if (oldVersion < 2) db.createObjectStore("meta");
      },
    });
  }
  return dbPromise;
}

/** Nur für Tests: Verbindung zurücksetzen */
export function _resetDbForTests() {
  dbPromise = null;
}

export const STORES = ["trades", "capital", "watchlist", "alerts", "alertEvents"] as const;
export type StoreName = (typeof STORES)[number];

export async function getAll<S extends StoreName>(store: S): Promise<FlipperDB[S]["value"][]> {
  const db = await getDb();
  return db.getAll(store);
}

export async function put<S extends StoreName>(store: S, value: FlipperDB[S]["value"]): Promise<void> {
  const db = await getDb();
  await db.put(store, value);
}

export async function remove<S extends StoreName>(store: S, key: FlipperDB[S]["key"]): Promise<void> {
  const db = await getDb();
  await db.delete(store, key);
}

/** Ersetzt den gesamten Inhalt aller Stores atomar (eine Transaktion). */
export async function replaceAll(data: {
  trades: Trade[];
  capital: CapitalEvent[];
  watchlist: WatchItem[];
  alerts: Alert[];
  alertEvents: AlertEvent[];
}): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([...STORES], "readwrite");
  await Promise.all(STORES.map((s) => tx.objectStore(s).clear()));
  await Promise.all([
    ...data.trades.map((v) => tx.objectStore("trades").put(v)),
    ...data.capital.map((v) => tx.objectStore("capital").put(v)),
    ...data.watchlist.map((v) => tx.objectStore("watchlist").put(v)),
    ...data.alerts.map((v) => tx.objectStore("alerts").put(v)),
    ...data.alertEvents.map((v) => tx.objectStore("alertEvents").put(v)),
  ]);
  await tx.done;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  return (await db.get("meta", key)) as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put("meta", value, key);
}

export async function deleteMeta(key: string): Promise<void> {
  const db = await getDb();
  await db.delete("meta", key);
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

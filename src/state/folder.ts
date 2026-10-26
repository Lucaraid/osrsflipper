"use client";
import { create } from "zustand";
import { createBackup, type Backup } from "@/lib/storage/backup";
import { deleteMeta, getMeta, setMeta } from "@/lib/storage/db";
import {
  DATA_FILE,
  fileLastModified,
  HANDLE_KEY,
  hasPermission,
  isFolderStorageSupported,
  pickFolder,
  readFolderData,
  writeFolderData,
  type DirHandle,
} from "@/lib/storage/folder";
import { useDataStore } from "./data";
import { useSettingsStore } from "./settings";
import { toast } from "./toasts";

/**
 * Verbindung zum lokalen Datenordner.
 * Solange verbunden, ist die Datei im Ordner die Quelle der Wahrheit; IndexedDB dient als Zwischenspeicher.
 * Jede Änderung wird (leicht verzögert) in den Ordner geschrieben.
 */
export type FolderStatus = "unknown" | "unsupported" | "none" | "needs-permission" | "connected" | "error";

interface FolderState {
  status: FolderStatus;
  folderName: string | null;
  lastSavedAt: number | null;
  lastError: string | null;
  saving: boolean;
  conflict: { backup: Backup } | null;
  init: () => Promise<void>;
  connect: () => Promise<void>;
  reconnect: () => Promise<void>;
  disconnect: () => Promise<void>;
  resolveConflict: (keep: "folder" | "local") => Promise<void>;
  scheduleSave: () => void;
  saveNow: () => Promise<void>;
  checkExternalChange: () => Promise<void>;
}

let handle: DirHandle | null = null;
let suppress = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let knownModified = 0;

function currentBackup(): Backup {
  const d = useDataStore.getState();
  return createBackup({ settings: useSettingsStore.getState().settings, trades: d.trades, capital: d.capital, watchlist: d.watchlist, alerts: d.alerts, alertEvents: d.alertEvents });
}

function hasLocalData(): boolean {
  const d = useDataStore.getState();
  return d.trades.length + d.capital.length + d.watchlist.length + d.alerts.length > 0;
}

const norm = <T extends object>(xs: T[], key: keyof T) => JSON.stringify([...xs].sort((a, b) => String(a[key]).localeCompare(String(b[key]))));

export function sameData(a: Pick<Backup, "trades" | "capital" | "watchlist" | "alerts">, b: Pick<Backup, "trades" | "capital" | "watchlist" | "alerts">): boolean {
  return norm(a.trades, "id") === norm(b.trades, "id") && norm(a.capital, "id") === norm(b.capital, "id") && norm(a.watchlist, "itemId") === norm(b.watchlist, "itemId") && norm(a.alerts, "id") === norm(b.alerts, "id");
}

async function applyBackup(b: Backup) {
  suppress = true;
  try {
    await useDataStore.getState().importBackup(b);
    useSettingsStore.getState().replace(b.settings);
  } finally {
    suppress = false;
  }
}

function errMsg(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export const useFolderStore = create<FolderState>((set, get) => ({
  status: "unknown",
  folderName: null,
  lastSavedAt: null,
  lastError: null,
  saving: false,
  conflict: null,

  init: async () => {
    if (!isFolderStorageSupported()) return set({ status: "unsupported" });
    try {
      handle = (await getMeta<DirHandle>(HANDLE_KEY)) ?? null;
    } catch {
      handle = null;
    }
    if (!handle || typeof handle.getFileHandle !== "function") {
      handle = null;
      return set({ status: "none" });
    }
    set({ folderName: handle.name });
    if (!(await hasPermission(handle, false))) return set({ status: "needs-permission" });
    await syncFromFolder(set);
  },

  connect: async () => {
    let h: DirHandle;
    try {
      h = await pickFolder();
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return; // Dialog abgebrochen
      return set({ status: "error", lastError: errMsg(err) });
    }
    if (!(await hasPermission(h, true))) return set({ status: "needs-permission", lastError: "Schreibzugriff auf den Ordner wurde nicht erlaubt." });
    handle = h;
    let remembered = true;
    try {
      await setMeta(HANDLE_KEY, h);
    } catch {
      remembered = false; // z. B. Browser ohne Unterstützung für gespeicherte Ordner-Handles
    }
    set({ folderName: h.name, lastError: remembered ? null : "Der Ordner kann in diesem Browser nicht dauerhaft gemerkt werden – nach einem Neustart bitte erneut wählen." });
    try {
      const r = await readFolderData(h);
      if (r.kind === "invalid") return set({ status: "error", lastError: `Die Datei ${DATA_FILE} im Ordner ist ungültig: ${r.errors.join(" ")}` });
      if (r.kind === "ok") {
        knownModified = r.lastModified;
        if (hasLocalData() && !sameData(r.backup, currentBackup())) return set({ status: "connected", conflict: { backup: r.backup } });
        await applyBackup(r.backup);
        set({ status: "connected", lastSavedAt: r.lastModified });
        toast(`Daten aus Ordner „${h.name}“ geladen.`, "pos");
        return;
      }
      set({ status: "connected" });
      await get().saveNow();
      toast(`Ordner „${h.name}“ verbunden – Daten werden dort gespeichert.`, "pos");
    } catch (err) {
      set({ status: "error", lastError: errMsg(err) });
    }
  },

  reconnect: async () => {
    if (!handle) return get().connect();
    try {
      if (!(await hasPermission(handle, true))) return set({ status: "needs-permission", lastError: "Zugriff nicht erlaubt." });
      await syncFromFolder(set);
    } catch (err) {
      set({ status: "error", lastError: errMsg(err) });
    }
  },

  disconnect: async () => {
    handle = null;
    await deleteMeta(HANDLE_KEY);
    set({ status: "none", folderName: null, lastSavedAt: null, lastError: null, conflict: null });
    toast("Ordner getrennt. Daten bleiben im Browser gespeichert.");
  },

  resolveConflict: async (keep) => {
    const c = get().conflict;
    if (!c) return;
    set({ conflict: null });
    if (keep === "folder") {
      await applyBackup(c.backup);
      toast("Daten aus dem Ordner geladen.", "pos");
    } else {
      await get().saveNow();
      toast("Aktuelle Daten in den Ordner gespeichert.", "pos");
    }
  },

  scheduleSave: () => {
    if (suppress || get().status !== "connected" || get().conflict) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void get().saveNow(), 400);
  },

  saveNow: async () => {
    if (!handle || get().conflict) return;
    set({ saving: true });
    try {
      await writeFolderData(handle, currentBackup());
      knownModified = (await fileLastModified(handle)) ?? Date.now();
      set({ saving: false, lastSavedAt: Date.now(), lastError: null, status: "connected" });
    } catch (err) {
      const msg = errMsg(err);
      const perm = /permission|NotAllowed/i.test(msg) || (err as DOMException)?.name === "NotAllowedError";
      set({ saving: false, lastError: `Speichern im Ordner fehlgeschlagen: ${msg}`, status: perm ? "needs-permission" : "error" });
      toast("Speichern im Ordner fehlgeschlagen – Daten sind weiterhin im Browser gesichert.", "neg");
    }
  },

  /** Wurde die Datei ausserhalb der App geändert (z. B. anderes Gerät via Cloud-Ordner), neu laden. */
  checkExternalChange: async () => {
    if (!handle || get().status !== "connected" || get().saving) return;
    const lm = await fileLastModified(handle);
    if (lm != null && lm > knownModified + 1000) {
      await syncFromFolder(set);
      toast("Datendatei wurde ausserhalb der App geändert – neu geladen.");
    }
  },
}));

async function syncFromFolder(set: (p: Partial<FolderState>) => void) {
  if (!handle) return;
  try {
    const r = await readFolderData(handle);
    if (r.kind === "invalid") {
      // Niemals eine ungültige Datei überschreiben – Nutzer entscheidet
      return set({ status: "error", lastError: `Die Datei ${DATA_FILE} ist ungültig und wurde nicht geladen: ${r.errors.join(" ")}` });
    }
    if (r.kind === "ok") {
      knownModified = r.lastModified;
      await applyBackup(r.backup);
      return set({ status: "connected", lastSavedAt: r.lastModified, lastError: null });
    }
    set({ status: "connected", lastError: null });
    await useFolderStore.getState().saveNow();
  } catch (err) {
    set({ status: "error", lastError: errMsg(err) });
  }
}

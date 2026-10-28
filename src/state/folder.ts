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
  /** Ausstehende (geplante) Speicherung sofort ausführen */
  flush: () => Promise<void>;
  checkExternalChange: () => Promise<void>;
}

let handle: DirHandle | null = null;
let suppress = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let knownModified = 0;
/** Es gibt Änderungen, die noch nicht im Ordner gespeichert sind (z. B. weil der Zugriff nach einem Neustart fehlte) */
let dirty = false;
/** Während eines Schreibvorgangs kam eine weitere Änderung → danach direkt nochmals speichern */
let pendingSave = false;

/** Nur für Tests: Modulzustand zurücksetzen */
export function _resetFolderStateForTests(h: DirHandle | null = null) {
  handle = h;
  dirty = false;
  pendingSave = false;
  suppress = false;
  if (timer) clearTimeout(timer);
  timer = null;
}

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
    if (!(await hasPermission(h, true))) return set({ status: "needs-permission", lastError: "Write access to the folder was not allowed." });
    handle = h;
    let remembered = true;
    try {
      await setMeta(HANDLE_KEY, h);
    } catch {
      remembered = false; // z. B. Browser ohne Unterstützung für gespeicherte Ordner-Handles
    }
    set({ folderName: h.name, lastError: remembered ? null : "This browser can’t remember the folder permanently – please choose it again after a restart." });
    try {
      const r = await readFolderData(h);
      if (r.kind === "invalid") return set({ status: "error", lastError: `The file ${DATA_FILE} in the folder is invalid: ${r.errors.join(" ")}` });
      if (r.kind === "ok") {
        knownModified = r.lastModified;
        if (hasLocalData() && !sameData(r.backup, currentBackup())) return set({ status: "connected", conflict: { backup: r.backup } });
        await applyBackup(r.backup);
        set({ status: "connected", lastSavedAt: r.lastModified });
        toast(`Data loaded from folder “${h.name}”.`, "pos");
        return;
      }
      set({ status: "connected" });
      await get().saveNow();
      toast(`Folder “${h.name}” connected – data will be saved there.`, "pos");
    } catch (err) {
      set({ status: "error", lastError: errMsg(err) });
    }
  },

  reconnect: async () => {
    if (!handle) return get().connect();
    try {
      if (!(await hasPermission(handle, true))) return set({ status: "needs-permission", lastError: "Access not allowed." });
      await syncFromFolder(set);
    } catch (err) {
      set({ status: "error", lastError: errMsg(err) });
    }
  },

  disconnect: async () => {
    handle = null;
    await deleteMeta(HANDLE_KEY);
    set({ status: "none", folderName: null, lastSavedAt: null, lastError: null, conflict: null });
    toast("Folder disconnected. Data stays saved in the browser.");
  },

  resolveConflict: async (keep) => {
    const c = get().conflict;
    if (!c) return;
    set({ conflict: null });
    if (keep === "folder") {
      await applyBackup(c.backup);
      toast("Data loaded from the folder.", "pos");
    } else {
      await get().saveNow();
      toast("Current data saved to the folder.", "pos");
    }
  },

  /**
   * Nach jeder Änderung aufgerufen. Mit verbundenem Ordner wird kurz danach gespeichert
   * (auch nach einem fehlgeschlagenen Versuch erneut). Fehlt der Zugriff, bleibt die Änderung
   * als „dirty“ vorgemerkt und wird gespeichert, sobald der Zugriff wieder erlaubt ist.
   */
  scheduleSave: () => {
    if (suppress) return;
    dirty = true;
    const { status, conflict } = get();
    if (!handle || conflict || (status !== "connected" && status !== "error")) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void get().saveNow(), 150);
  },

  saveNow: async () => {
    if (!handle || get().conflict) return;
    if (timer) clearTimeout(timer);
    timer = null;
    if (get().saving) {
      pendingSave = true;
      return;
    }
    set({ saving: true });
    try {
      dirty = false;
      await writeFolderData(handle, currentBackup());
      knownModified = (await fileLastModified(handle)) ?? Date.now();
      set({ saving: false, lastSavedAt: Date.now(), lastError: null, status: "connected" });
      if (pendingSave) {
        pendingSave = false;
        await get().saveNow();
      }
    } catch (err) {
      dirty = true;
      pendingSave = false;
      const msg = errMsg(err);
      const perm = /permission|NotAllowed/i.test(msg) || (err as DOMException)?.name === "NotAllowedError";
      set({ saving: false, lastError: `Saving to the folder failed: ${msg}`, status: perm ? "needs-permission" : "error" });
      toast("Saving to the folder failed – data is still safe in the browser.", "neg");
    }
  },

  flush: async () => {
    if (timer && get().status === "connected") await get().saveNow();
  },

  /** Wurde die Datei ausserhalb der App geändert (z. B. anderes Gerät via Cloud-Ordner), neu laden. */
  checkExternalChange: async () => {
    if (!handle || get().status !== "connected" || get().saving) return;
    const lm = await fileLastModified(handle);
    if (lm != null && lm > knownModified + 1000) {
      await syncFromFolder(set);
      toast("Data file was changed outside the app – reloaded.");
    }
  },
}));

async function syncFromFolder(set: (p: Partial<FolderState>) => void) {
  if (!handle) return;
  try {
    const r = await readFolderData(handle);
    if (r.kind === "invalid") {
      // Niemals eine ungültige Datei überschreiben – Nutzer entscheidet
      return set({ status: "error", lastError: `The file ${DATA_FILE} is invalid and was not loaded: ${r.errors.join(" ")}` });
    }
    if (r.kind === "ok") {
      knownModified = r.lastModified;
      // Ungespeicherte Änderungen aus diesem Browser nie stillschweigend überschreiben
      if (dirty && !sameData(r.backup, currentBackup())) return set({ status: "connected", lastError: null, conflict: { backup: r.backup } });
      dirty = false;
      await applyBackup(r.backup);
      return set({ status: "connected", lastSavedAt: r.lastModified, lastError: null });
    }
    set({ status: "connected", lastError: null });
    await useFolderStore.getState().saveNow();
  } catch (err) {
    set({ status: "error", lastError: errMsg(err) });
  }
}

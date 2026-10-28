import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createBackup } from "@/lib/storage/backup";
import { DATA_FILE, writeFolderData, type DirHandle, type FileHandle } from "@/lib/storage/folder";
import { DEFAULT_SETTINGS } from "@/lib/storage/settings-schema";
import type { Trade } from "@/lib/portfolio/schemas";
import { useDataStore } from "@/state/data";
import { _resetFolderStateForTests, useFolderStore } from "@/state/folder";

/** In-Memory-Nachbildung eines FileSystemDirectoryHandle (ohne Berechtigungsabfrage) */
function memDir(name = "Trades") {
  const files = new Map<string, { text: string; lastModified: number }>();
  let writes = 0;
  const dir: DirHandle = {
    kind: "directory",
    name,
    async getFileHandle(fname, opts) {
      if (!files.has(fname)) {
        if (!opts?.create) throw Object.assign(new Error("not found"), { name: "NotFoundError" });
        files.set(fname, { text: "", lastModified: Date.now() });
      }
      const fh: FileHandle = {
        async getFile() {
          const f = files.get(fname)!;
          return Object.assign(new Blob([f.text]), { lastModified: f.lastModified, name: fname }) as unknown as File;
        },
        async createWritable() {
          let buf = "";
          return {
            async write(d: string | Blob) { buf += typeof d === "string" ? d : await d.text(); },
            async close() {
              files.set(fname, { text: buf, lastModified: Date.now() });
              if (fname === DATA_FILE) writes++;
            },
          };
        },
      };
      return fh;
    },
  };
  return { dir, files, writes: () => writes };
}

const mkTrade = (id: string, name = "Abyssal whip"): Trade => ({
  id, itemId: 4151, itemName: name, createdAt: 1, updatedAt: 1,
  lots: [{ id: `${id}-l`, date: Date.UTC(2026, 9, 1, 10), quantity: 10, price: 1000, fees: 0 }],
  sales: [], offers: [], notes: "", history: [],
});

const tradesInFolder = (files: Map<string, { text: string }>) => (JSON.parse(files.get(DATA_FILE)!.text) as { trades: Trade[] }).trades.map((t) => t.id).sort();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  await useDataStore.getState().clearAll();
  useFolderStore.setState({ status: "unknown", folderName: null, lastSavedAt: null, lastError: null, saving: false, conflict: null });
  _resetFolderStateForTests(null);
});

describe("Automatisches Speichern im Ordner", () => {
  it("speichert jede Änderung kurz danach in den verbundenen Ordner", async () => {
    const { dir, files } = memDir();
    _resetFolderStateForTests(dir);
    useFolderStore.setState({ status: "connected", folderName: dir.name });
    await useDataStore.getState().saveTrade(mkTrade("a"), "created", "");
    useFolderStore.getState().scheduleSave();
    await wait(300);
    expect(tradesInFolder(files)).toEqual(["a"]);
    await useDataStore.getState().saveTrade(mkTrade("b"), "created", "");
    useFolderStore.getState().scheduleSave();
    await wait(300);
    expect(tradesInFolder(files)).toEqual(["a", "b"]);
  });

  it("Änderung während eines laufenden Speicherns wird danach ebenfalls geschrieben", async () => {
    const { dir, files } = memDir();
    _resetFolderStateForTests(dir);
    useFolderStore.setState({ status: "connected", folderName: dir.name });
    await useDataStore.getState().saveTrade(mkTrade("a"), "created", "");
    const first = useFolderStore.getState().saveNow();
    await useDataStore.getState().saveTrade(mkTrade("b"), "created", "");
    await useFolderStore.getState().saveNow(); // läuft noch → wird vorgemerkt
    await first;
    await wait(50);
    expect(tradesInFolder(files)).toEqual(["a", "b"]);
  });

  it("nach einem Fehler wird bei der nächsten Änderung erneut versucht", async () => {
    const { dir, files } = memDir();
    _resetFolderStateForTests(dir);
    useFolderStore.setState({ status: "error", folderName: dir.name });
    await useDataStore.getState().saveTrade(mkTrade("a"), "created", "");
    useFolderStore.getState().scheduleSave();
    await wait(300);
    expect(useFolderStore.getState().status).toBe("connected");
    expect(tradesInFolder(files)).toEqual(["a"]);
  });

  it("ohne Zugriff vorgemerkte Änderungen werden beim Wiederverbinden nicht vom Ordner überschrieben", async () => {
    const { dir, files } = memDir();
    // Ordner enthält einen älteren Stand
    await writeFolderData(dir, createBackup({ settings: DEFAULT_SETTINGS, trades: [mkTrade("old")], capital: [], watchlist: [], alerts: [], alertEvents: [] }));
    _resetFolderStateForTests(dir);
    useFolderStore.setState({ status: "needs-permission", folderName: dir.name });
    // Änderung, während der Zugriff fehlt → nicht geschrieben, aber vorgemerkt
    await useDataStore.getState().saveTrade(mkTrade("new"), "created", "");
    useFolderStore.getState().scheduleSave();
    await wait(300);
    expect(tradesInFolder(files)).toEqual(["old"]);
    // Zugriff wieder erlaubt → Konfliktdialog statt stillem Überschreiben der Browser-Daten
    await useFolderStore.getState().reconnect();
    expect(useFolderStore.getState().conflict).not.toBeNull();
    expect(useDataStore.getState().trades.map((t) => t.id)).toEqual(["new"]);
    // „Browser-Daten in Ordner speichern“
    await useFolderStore.getState().resolveConflict("local");
    expect(tradesInFolder(files)).toEqual(["new"]);
  });
});

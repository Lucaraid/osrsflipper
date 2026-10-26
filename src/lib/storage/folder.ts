import { computeFifo, saleTax } from "../portfolio/fifo";
import type { Trade } from "../portfolio/schemas";
import { parseBackup, type Backup, type ImportResult } from "./backup";

/**
 * Speicherung der persönlichen Daten in einem vom Nutzer gewählten Ordner auf dem eigenen Computer
 * (File System Access API – Chrome, Edge, Opera, Brave; nicht Firefox/Safari).
 *
 * Dateien im Ordner:
 * - `osrs-ge-flipper-daten.json` – vollständige Daten (Trades, Kapital, Watchlist, Alarme, Einstellungen)
 *   im validierten Backup-Format. Diese Datei ist die Quelle der Wahrheit, solange ein Ordner verbunden ist.
 * - `trades.csv` – lesbare Kopie aller Transaktionen (z. B. für Excel). Wird bei jedem Speichern
 *   neu geschrieben; Änderungen daran werden NICHT eingelesen.
 */

export const DATA_FILE = "osrs-ge-flipper-daten.json";
export const CSV_FILE = "trades.csv";
export const HANDLE_KEY = "dataFolderHandle";

/* Minimale Typen – die File System Access API ist (noch) nicht vollständig in lib.dom enthalten. */
type PermissionMode = { mode: "read" | "readwrite" };
export interface DirHandle {
  kind: "directory";
  name: string;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandle>;
  queryPermission?(d: PermissionMode): Promise<PermissionState>;
  requestPermission?(d: PermissionMode): Promise<PermissionState>;
}
export interface FileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string | Blob): Promise<void>; close(): Promise<void> }>;
}

export function isFolderStorageSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window && window.isSecureContext;
}

export async function pickFolder(): Promise<DirHandle> {
  const picker = (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker;
  return picker({ id: "osrs-ge-flipper", mode: "readwrite", startIn: "documents" });
}

export async function hasPermission(handle: DirHandle, request = false): Promise<boolean> {
  const desc: PermissionMode = { mode: "readwrite" };
  if (!handle.queryPermission) return true;
  if ((await handle.queryPermission(desc)) === "granted") return true;
  if (request && handle.requestPermission) return (await handle.requestPermission(desc)) === "granted";
  return false;
}

export type FolderRead = { kind: "missing" } | { kind: "ok"; backup: Backup; lastModified: number } | { kind: "invalid"; errors: string[] };

/** Liest und validiert die Datendatei im Ordner. Fehlt sie, wird "missing" geliefert. */
export async function readFolderData(handle: DirHandle): Promise<FolderRead> {
  let fh: FileHandle;
  try {
    fh = await handle.getFileHandle(DATA_FILE);
  } catch (err) {
    if ((err as DOMException)?.name === "NotFoundError") return { kind: "missing" };
    throw err;
  }
  const file = await fh.getFile();
  const text = await file.text();
  if (!text.trim()) return { kind: "missing" };
  const r: ImportResult = parseBackup(text);
  return r.ok ? { kind: "ok", backup: r.backup, lastModified: file.lastModified } : { kind: "invalid", errors: r.errors };
}

export async function fileLastModified(handle: DirHandle): Promise<number | null> {
  try {
    const f = await (await handle.getFileHandle(DATA_FILE)).getFile();
    return f.lastModified;
  } catch {
    return null;
  }
}

async function writeText(handle: DirHandle, name: string, text: string) {
  const fh = await handle.getFileHandle(name, { create: true });
  const w = await fh.createWritable(); // schreibt in eine temporäre Datei und ersetzt erst beim close() → kein halber Stand
  await w.write(text);
  await w.close();
}

/** Schreibt Daten (JSON) und die CSV-Kopie in den Ordner. */
export async function writeFolderData(handle: DirHandle, backup: Backup): Promise<void> {
  await writeText(handle, DATA_FILE, JSON.stringify(backup, null, 2));
  await writeText(handle, CSV_FILE, tradesToCsv(backup.trades));
}

/* ------------------------------------------------------------------ */

function csvCell(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function isoLocal(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * CSV (Semikolon-getrennt, UTF-8 mit BOM – öffnet in Excel mit deutschsprachigen Einstellungen direkt korrekt).
 * Eine Zeile pro Transaktion; bei Verkäufen inkl. Steuer und realisiertem Gewinn nach FIFO.
 */
export function tradesToCsv(trades: Trade[]): string {
  const header = ["Trade-ID", "Item", "Item-ID", "Typ", "Datum", "Menge", "Preis/Stück", "Gebühren", "Steuer", "Betrag netto", "Realisiert (FIFO)", "Status", "Notiz"];
  const rows: string[][] = [header];
  const sorted = [...trades].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  for (const t of sorted) {
    const s = computeFifo(t);
    const realizedBySale = new Map(s.sales.map((x) => [x.saleId, x.realized]));
    type Row = { date: number; cells: (string | number | null)[] };
    const items: Row[] = [];
    for (const l of t.lots) {
      items.push({ date: l.date, cells: [t.id, t.itemName, t.itemId, "Kauf", isoLocal(l.date), l.quantity, l.price, l.fees ?? 0, 0, -(l.price * l.quantity + (l.fees ?? 0)), null, s.status, t.notes] });
    }
    for (const x of t.sales) {
      const { tax } = saleTax(x, t.itemId);
      const net = x.price * x.quantity - tax - (x.fees ?? 0);
      items.push({ date: x.date, cells: [t.id, t.itemName, t.itemId, "Verkauf", isoLocal(x.date), x.quantity, x.price, x.fees ?? 0, tax, net, Math.round(realizedBySale.get(x.id) ?? 0), s.status, t.notes] });
    }
    for (const o of t.offers) {
      items.push({ date: o.date, cells: [t.id, t.itemName, t.itemId, "Kaufangebot (offen)", isoLocal(o.date), o.quantity, o.price, 0, 0, null, null, s.status, t.notes] });
    }
    items.sort((a, b) => a.date - b.date);
    for (const r of items) rows.push(r.cells.map((c) => (c == null ? "" : String(c))));
  }
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

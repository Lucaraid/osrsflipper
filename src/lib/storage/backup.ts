import { z } from "zod";
import { AlertSchema, CapitalEventSchema, TradeSchema, WatchItemSchema } from "../portfolio/schemas";
import { validateTrade } from "../portfolio/fifo";
import { SettingsSchema, type Settings } from "./settings-schema";

/**
 * Vollständiger Export/Import aller lokalen Daten als JSON.
 * Import validiert Struktur (Zod), Versionsnummer und fachliche Konsistenz (kein Überverkauf).
 * Ungültige Dateien werden vollständig abgelehnt – es wird nie ein halber Import geschrieben.
 */

export const BACKUP_FORMAT = "osrs-ge-flipper-backup";
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

const AlertEventSchema = z.object({
  id: z.string().min(1).max(64),
  alertId: z.string().min(1).max(64),
  itemId: z.number().int().positive(),
  at: z.number().int().nonnegative(),
  text: z.string().max(500),
});

export const BackupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.number().int().nonnegative(),
  settings: SettingsSchema,
  trades: z.array(TradeSchema).max(50_000),
  capital: z.array(CapitalEventSchema).max(50_000),
  watchlist: z.array(WatchItemSchema).max(10_000),
  alerts: z.array(AlertSchema).max(5_000),
  alertEvents: z.array(AlertEventSchema).max(10_000).default([]),
});
export type Backup = z.infer<typeof BackupSchema>;

export function createBackup(data: Omit<Backup, "format" | "version" | "exportedAt" | "settings"> & { settings: Settings }, now = Date.now()): Backup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, ...data };
}

export type ImportResult = { ok: true; backup: Backup } | { ok: false; errors: string[] };

export function parseBackup(text: string): ImportResult {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, errors: ["File is too large (max 20 MB)."] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["File is not valid JSON."] };
  }
  if (typeof raw === "object" && raw !== null) {
    const r = raw as Record<string, unknown>;
    if (r.format !== BACKUP_FORMAT) return { ok: false, errors: ["Unknown file format – not an OSRS GE Flipper backup."] };
    if (typeof r.version === "number" && r.version > BACKUP_VERSION)
      return { ok: false, errors: [`Backup is from a newer version (v${r.version}). Please update the app.`] };
  }
  const parsed = BackupSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const t of parsed.data.trades) {
    if (ids.has(t.id)) errors.push(`Duplicate trade ID ${t.id}.`);
    ids.add(t.id);
    for (const e of validateTrade(t)) errors.push(`${t.itemName}: ${e}`);
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, 10) };
  return { ok: true, backup: parsed.data };
}

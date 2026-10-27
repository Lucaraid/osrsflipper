import { computeFifo } from "../portfolio/fifo";
import type { Lot, Sale, Trade } from "../portfolio/schemas";
import { newId } from "../storage/db";
import { TAX_RULES, taxRulesAt } from "../tax/rules";
import { taxTotal } from "../tax/tax";

/**
 * Import der Trade-Historie aus dem RuneLite-Plugin „Flipping Utilities“ (CSV-Export).
 *
 * Format (Export-Button im Plugin):
 *   # Displaying trades for selected time interval: All
 *   name,date,quantity,price,state
 *   Imbued heart,2022-10-27 09:00 PM,1,30666269,BOUGHT
 *   # Total profit: -174268
 * Ein Block pro Item, Kommentarzeilen mit „#“, Datum in Ortszeit ohne Zeitzone, Preis pro Stück.
 * state: BOUGHT, SOLD, CANCELLED_BUY, CANCELLED_SELL. Bei abgebrochenen Angeboten ist quantity
 * die bereits gefüllte Menge – sie zählt wie ein normaler Kauf/Verkauf (geprüft: nur so ergibt sich
 * der vom Plugin ausgewiesene Gewinn).
 *
 * Der Export enthält die GANZE GE-Historie des Accounts, nicht nur Flips. Deshalb:
 * - Pro Item werden die Zeilen chronologisch abgespielt: ein Kauf ohne offenen Bestand startet einen
 *   Trade, weitere Käufe ergänzen ihn, Verkäufe schliessen ihn (Bestand 0 → Trade abgeschlossen).
 * - Verkäufe ohne über den GE gekauften Bestand (Drops, Skilling) sind keine Flips und werden übersprungen.
 * - Steuer: für Verkäufe vor dem aktuellen Steuersatz wird die damals gültige Steuer als
 *   „tatsächliche Steuer“ gespeichert (src/lib/tax), sonst rechnet die App nach aktuellen Regeln.
 * - Erneuter Import derselben Datei: bereits vorhandene Käufe/Verkäufe (gleiches Item, gleiche Minute,
 *   Menge und Preis) werden erkannt; neue Zeilen ergänzen den bestehenden Trade.
 */

export type FuSide = "buy" | "sell";

export interface FuRow {
  line: number;
  name: string;
  date: number;
  quantity: number;
  price: number;
  side: FuSide;
  cancelled: boolean;
}

export interface FuParseResult {
  rows: FuRow[];
  errors: { line: number; text: string }[];
  /** false, wenn die Datei nicht wie ein Flipping-Utilities-Export aussieht */
  recognized: boolean;
}

const STATES: Record<string, { side: FuSide; cancelled: boolean }> = {
  BOUGHT: { side: "buy", cancelled: false },
  SOLD: { side: "sell", cancelled: false },
  CANCELLED_BUY: { side: "buy", cancelled: true },
  CANCELLED_SELL: { side: "sell", cancelled: true },
};

/** CSV-Zeile mit Anführungszeichen-Unterstützung aufteilen. */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** „2022-10-27 09:00 PM“ (oder 24-h-Format) als Ortszeit → ms; null bei ungültigem Datum. */
export function parseFuDate(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(s.trim());
  if (!m) return null;
  const [, y, mo, d, hRaw, mi, sec, ampm] = m;
  let h = Number(hRaw);
  if (ampm) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ampm.toUpperCase() === "PM" ? 12 : 0);
  }
  if (h > 23) return null;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), h, Number(mi), Number(sec ?? 0));
  // Ungültige Tage (z. B. 2022-02-31) verschiebt Date stillschweigend → ablehnen
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) return null;
  return date.getTime();
}

function rowError(f: string[]): string | null {
  const [state = "", price = "", qty = "", date = ""] = [...f].reverse();
  if (f.length < 5) return "Expected 5 columns (name, date, quantity, price, state).";
  if (!STATES[state.toUpperCase()]) return `Unknown state “${state}”.`;
  if (!f.slice(0, -4).join(",").trim()) return "Item name missing.";
  if (parseFuDate(date) == null) return `Invalid date “${date}”.`;
  if (!Number.isInteger(Number(qty)) || Number(qty) < 0) return `Invalid quantity “${qty}”.`;
  if (!Number.isInteger(Number(price)) || Number(price) <= 0) return `Invalid price “${price}”.`;
  return null;
}

export function parseFlippingUtilitiesCsv(text: string): FuParseResult {
  const rows: FuRow[] = [];
  const errors: FuParseResult["errors"] = [];
  let recognized = false;
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    const no = i + 1;
    if (!line || line.startsWith("#")) continue;
    if (/^name,date,quantity,price,state$/i.test(line.replace(/\s+/g, ""))) {
      recognized = true;
      continue;
    }
    const f = splitCsv(line);
    const error = rowError(f);
    if (error) {
      errors.push({ line: no, text: error });
      continue;
    }
    // Von rechts lesen: ein Komma im (nicht gequoteten) Namen bleibt so Teil des Namens
    const [stateRaw, priceRaw, qtyRaw, dateRaw] = [...f].reverse() as [string, string, string, string];
    const state = STATES[stateRaw.toUpperCase()]!;
    recognized = true;
    const quantity = Number(qtyRaw);
    if (quantity === 0) continue; // abgebrochen ohne Füllung
    rows.push({ line: no, name: f.slice(0, -4).join(",").trim(), date: parseFuDate(dateRaw)!, quantity, price: Number(priceRaw), side: state.side, cancelled: state.cancelled });
  }
  return { rows, errors, recognized };
}

// ---------------------------------------------------------------------------------------------
// Planung: Zeilen → Trades (neu / Ergänzung bestehender / bereits importiert)
// ---------------------------------------------------------------------------------------------

export interface ItemRef {
  id: number;
  name: string;
}

export type CandidateKind = "new" | "update" | "duplicate" | "conflict";

export interface ImportCandidate {
  key: string;
  kind: CandidateKind;
  itemId: number;
  itemName: string;
  /** Neuer Trade bzw. ergänzter bestehender Trade; null bei Konflikt */
  trade: Trade | null;
  /** Bei „update“: Anzahl neu hinzugefügter Käufe/Verkäufe */
  added: number;
  closed: boolean;
  firstDate: number;
  lastDate: number;
  boughtQty: number;
  soldQty: number;
  /** Realisierter Gewinn nach FIFO (inkl. Steuer) des (ergänzten) Trades */
  realized: number;
  errors: string[];
}

export interface ImportPlan {
  candidates: ImportCandidate[];
  /** Namen ohne eindeutige Item-ID: Name → Anzahl Zeilen */
  unknownItems: Map<string, number>;
  /** Verkaufte Stück ohne GE-Kauf (keine Flips) */
  skippedSells: { rows: number; quantity: number };
}

/** Gespeicherte Steuer: nur für Verkäufe vor dem aktuellen Satz explizit, sonst null (= aktuelle Regeln) */
function saleTax(price: number, quantity: number, itemId: number, date: number): number | null {
  if (date >= Date.parse(TAX_RULES.effectiveFrom)) return null;
  return taxTotal(price, quantity, itemId, taxRulesAt(date));
}

const fingerprint = (side: FuSide, date: number, quantity: number, price: number) => `${side}|${Math.floor(date / 60_000)}|${quantity}|${price}`;

interface Draft {
  lots: Lot[];
  sales: Sale[];
  closed: boolean;
}

/** Spielt die Zeilen eines Items ab und bildet daraus Flips (siehe Kopfkommentar). */
function replayItem(ref: ItemRef, rows: FuRow[], skipped: ImportPlan["skippedSells"]): Draft[] {
  // CSV-Reihenfolge innerhalb derselben Minute beibehalten (Kauf vor Verkauf)
  const sorted = [...rows].sort((a, b) => a.date - b.date || a.line - b.line);
  const drafts: Draft[] = [];
  let cur: Draft | null = null;
  let position = 0;
  // Gleiche Minute → je 1 ms später, damit FIFO die CSV-Reihenfolge behält (sonst entscheidet die zufällige ID)
  let last = -Infinity;
  for (const row of sorted) {
    const r = { ...row, date: (last = Math.max(row.date, last + 1)) };
    if (r.side === "buy") {
      cur ??= { lots: [], sales: [], closed: false };
      cur.lots.push({ id: newId(), date: r.date, quantity: r.quantity, price: r.price, fees: 0 });
      position += r.quantity;
      continue;
    }
    const qty = Math.min(r.quantity, position);
    if (qty < r.quantity) {
      skipped.rows++;
      skipped.quantity += r.quantity - qty;
    }
    if (!cur || qty <= 0) continue;
    cur.sales.push({ id: newId(), date: r.date, quantity: qty, price: r.price, tax: saleTax(r.price, qty, ref.id, r.date), fees: 0 });
    position -= qty;
    if (position === 0) {
      cur.closed = true;
      drafts.push(cur);
      cur = null;
    }
  }
  if (cur) drafts.push(cur);
  return drafts;
}

/** Bestehende Käufe/Verkäufe als Multimenge von Fingerprints, um Duplikate zu erkennen. */
function existingIndex(existing: Trade[]) {
  const available = new Map<string, number>(); // `${tradeId}|${fp}` → Anzahl
  const tradesWithFp = new Map<string, string[]>(); // `${itemId}|${fp}` → Trade-IDs
  for (const t of existing) {
    const add = (fp: string) => {
      const k = `${t.id}|${fp}`;
      available.set(k, (available.get(k) ?? 0) + 1);
      const ik = `${t.itemId}|${fp}`;
      const ids = tradesWithFp.get(ik) ?? [];
      if (!ids.includes(t.id)) tradesWithFp.set(ik, [...ids, t.id]);
    };
    for (const l of t.lots) add(fingerprint("buy", l.date, l.quantity, l.price));
    for (const s of t.sales) add(fingerprint("sell", s.date, s.quantity, s.price));
  }
  /** Nimmt einen passenden bestehenden Eintrag (falls vorhanden) und gibt dessen Trade-ID zurück */
  return (itemId: number, fp: string): string | null => {
    for (const id of tradesWithFp.get(`${itemId}|${fp}`) ?? []) {
      const k = `${id}|${fp}`;
      const n = available.get(k) ?? 0;
      if (n > 0) {
        available.set(k, n - 1);
        return id;
      }
    }
    return null;
  };
}

export function planImport(rows: FuRow[], opts: { resolve: (name: string) => ItemRef | null; existing: Trade[]; now?: number }): ImportPlan {
  const now = opts.now ?? Date.now();
  const unknownItems = new Map<string, number>();
  const skippedSells = { rows: 0, quantity: 0 };
  const byItem = new Map<number, { ref: ItemRef; rows: FuRow[] }>();
  for (const r of rows) {
    const ref = opts.resolve(r.name);
    if (!ref) {
      unknownItems.set(r.name, (unknownItems.get(r.name) ?? 0) + 1);
      continue;
    }
    const g = byItem.get(ref.id) ?? { ref, rows: [] };
    g.rows.push(r);
    byItem.set(ref.id, g);
  }

  const consume = existingIndex(opts.existing);
  const byId = new Map(opts.existing.map((t) => [t.id, t]));
  const candidates: ImportCandidate[] = [];

  for (const { ref, rows: itemRows } of byItem.values()) {
    for (const d of replayItem(ref, itemRows, skippedSells)) {
      const matchedIn = new Set<string>();
      const missingLots = d.lots.filter((l) => {
        const id = consume(ref.id, fingerprint("buy", l.date, l.quantity, l.price));
        if (id) matchedIn.add(id);
        return !id;
      });
      const missingSales = d.sales.filter((s) => {
        const id = consume(ref.id, fingerprint("sell", s.date, s.quantity, s.price));
        if (id) matchedIn.add(id);
        return !id;
      });
      const dates = [...d.lots.map((l) => l.date), ...d.sales.map((s) => s.date)];
      const firstDate = Math.min(...dates);

      let kind: CandidateKind;
      let trade: Trade | null = null;
      let added = 0;
      const errors: string[] = [];
      const target = matchedIn.size === 1 ? byId.get([...matchedIn][0]!) : undefined;
      if (matchedIn.size === 0) {
        kind = "new";
        trade = {
          id: newId(),
          itemId: ref.id,
          itemName: ref.name,
          createdAt: firstDate,
          updatedAt: now,
          lots: d.lots,
          sales: d.sales,
          offers: [],
          notes: "Imported from Flipping Utilities",
          history: [],
        };
      } else if (target) {
        added = missingLots.length + missingSales.length;
        kind = added === 0 ? "duplicate" : "update";
        trade = { ...target, lots: [...target.lots, ...missingLots].sort((a, b) => a.date - b.date), sales: [...target.sales, ...missingSales].sort((a, b) => a.date - b.date) };
      } else {
        kind = "conflict";
        errors.push("These GE rows are spread over several existing trades – please check them manually.");
      }
      let realized = 0;
      if (trade) {
        const fifo = computeFifo(trade);
        realized = fifo.realized;
        if (kind !== "duplicate") errors.push(...fifo.errors);
      }
      candidates.push({
        key: `${ref.id}-${firstDate}`,
        kind,
        itemId: ref.id,
        itemName: ref.name,
        trade,
        added,
        closed: d.closed,
        firstDate,
        lastDate: Math.max(...dates),
        boughtQty: d.lots.reduce((a, l) => a + l.quantity, 0),
        soldQty: d.sales.reduce((a, s) => a + s.quantity, 0),
        realized,
        errors,
      });
    }
  }

  // Zwei Kandidaten dürfen nicht denselben bestehenden Trade ergänzen (z. B. manuell zusammengefasste Flips)
  const updated = new Set<string>();
  for (const c of candidates) {
    if (c.kind !== "update" || !c.trade) continue;
    if (updated.has(c.trade.id)) {
      c.kind = "conflict";
      c.trade = null;
      c.errors.push("Another import row already extends the same existing trade – please check it manually.");
    } else updated.add(c.trade.id);
  }
  candidates.sort((a, b) => b.lastDate - a.lastDate || a.itemName.localeCompare(b.itemName));
  return { candidates, unknownItems, skippedSells };
}

/** Offene Positionen ohne Aktivität seit so langer Zeit sind vermutlich Verbrauchsmaterial, kein Flip → nicht vorausgewählt */
export const STALE_OPEN_MS = 14 * 86_400_000;

/** Vorauswahl aus Nutzersicht: neue/ergänzte Flips ja, alte offene Positionen nein, fehlerhafte nie. */
export function isPreselected(c: ImportCandidate, now: number): boolean {
  if (c.errors.length > 0 || !c.trade) return false;
  if (c.kind !== "new" && c.kind !== "update") return false;
  return c.closed || now - c.lastDate <= STALE_OPEN_MS;
}

/** Item-Namen (wie im GE) → Item; mehrdeutige Namen ergeben null. */
export function nameResolver(items: { id: number; name: string }[]): (name: string) => ItemRef | null {
  const map = new Map<string, ItemRef | null>();
  for (const it of items) {
    const k = it.name.trim().toLowerCase();
    map.set(k, map.has(k) ? null : { id: it.id, name: it.name });
  }
  return (name) => map.get(name.trim().toLowerCase()) ?? null;
}

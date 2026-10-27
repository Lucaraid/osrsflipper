import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPreselected, nameResolver, parseFlippingUtilitiesCsv, parseFuDate, planImport, type ImportCandidate } from "@/lib/import/flipping-utilities";
import type { Trade } from "@/lib/portfolio/schemas";
import { TAX_RULES, TAX_RULES_1_PERCENT, taxRulesAt } from "@/lib/tax/rules";

const SAMPLE = fs.readFileSync(path.join(__dirname, "../fixtures/flipping-utilities-sample.csv"), "utf8");
const NOW = new Date(2026, 9, 27, 12, 0).getTime();

/** Synthetische IDs für die Testnamen (nur Bond mit echter ID, weil steuerbefreit) */
const ITEMS = [
  "Imbued heart", "Grimy ranarr weed", "Toadflax", "Mystic robe top (dark)", "Feldip hills teleport",
  "Purple firelighter", "Zulrah's scales", "Super restore(4)", "Death rune",
].map((name, i) => ({ id: i + 1, name })).concat({ id: 13190, name: "Old school bond" });
const resolve = nameResolver(ITEMS);
const idOf = (name: string) => ITEMS.find((i) => i.name === name)!.id;

const plan = (text = SAMPLE, existing: Trade[] = []) => planImport(parseFlippingUtilitiesCsv(text).rows, { resolve, existing, now: NOW });
const byItem = (cs: ImportCandidate[], name: string) => cs.filter((c) => c.itemName === name);
const csv = (...rows: string[]) => ["name,date,quantity,price,state", ...rows].join("\n");

describe("Flipping Utilities: CSV lesen", () => {
  it("liest den Export inkl. Kommentaren, Leerzeilen und Abbrüchen", () => {
    const r = parseFlippingUtilitiesCsv(SAMPLE);
    expect(r.recognized).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(33);
    expect(r.rows[0]).toMatchObject({ name: "Imbued heart", quantity: 1, price: 30666269, side: "buy", cancelled: false });
    expect(r.rows.find((x) => x.name === "Purple firelighter" && x.cancelled)).toMatchObject({ side: "buy", quantity: 116, price: 85 });
    expect(r.rows.some((x) => x.name === "Zulrah's scales")).toBe(true);
  });

  it("Datum in Ortszeit, 12-h-Format mit 12 AM/PM", () => {
    expect(parseFuDate("2022-10-03 12:14 AM")).toBe(new Date(2022, 9, 3, 0, 14).getTime());
    expect(parseFuDate("2025-09-13 12:10 PM")).toBe(new Date(2025, 8, 13, 12, 10).getTime());
    expect(parseFuDate("2022-10-27 09:00 PM")).toBe(new Date(2022, 9, 27, 21, 0).getTime());
    expect(parseFuDate("2022-10-27 21:00")).toBe(new Date(2022, 9, 27, 21, 0).getTime());
    expect(parseFuDate("2022-02-31 09:00 PM")).toBeNull();
    expect(parseFuDate("13:00 PM")).toBeNull();
  });

  it("Fehlerhafte Zeilen werden mit Zeilennummer gemeldet, Rest gelesen", () => {
    const r = parseFlippingUtilitiesCsv(csv("Coal,2022-01-01 01:00 PM,abc,5,SOLD", "Coal,2022-01-01 01:00 PM,5,5,TRADED", "Coal,2022-01-01 01:00 PM,5,5,SOLD"));
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toEqual([
      { line: 2, text: "Invalid quantity “abc”." },
      { line: 3, text: "Unknown state “TRADED”." },
    ]);
  });

  it("Namen mit Komma (gequotet) und abgebrochene Angebote ohne Füllung", () => {
    const r = parseFlippingUtilitiesCsv(csv('"Item, with comma",2022-01-01 01:00 PM,3,5,BOUGHT', "Coal,2022-01-01 01:00 PM,0,5,CANCELLED_BUY"));
    expect(r.rows).toEqual([expect.objectContaining({ name: "Item, with comma", quantity: 3 })]);
  });

  it("andere Dateien werden nicht erkannt", () => {
    expect(parseFlippingUtilitiesCsv("id,itemName,qty\n1,Coal,5").recognized).toBe(false);
  });
});

describe("Flipping Utilities: Trades bilden", () => {
  const p = plan();

  it("Flips pro Item: Kauf startet, Verkauf bis Bestand 0 schliesst", () => {
    expect(p.candidates).toHaveLength(10);
    const robes = byItem(p.candidates, "Mystic robe top (dark)").sort((a, b) => a.firstDate - b.firstDate);
    expect(robes.map((c) => c.closed)).toEqual([true, true, false]);
    // 1 % Steuer (2024): floor(71'910 × 1 %) = 719
    expect(robes.map((c) => c.realized)).toEqual([71910 - 719 - 74816, 71910 - 719 - 72636, 0]);
  });

  it("Verkäufe ohne GE-Kauf (Drops, Skilling) werden übersprungen", () => {
    expect(byItem(p.candidates, "Grimy ranarr weed")).toHaveLength(0);
    expect(byItem(p.candidates, "Feldip hills teleport")).toHaveLength(0);
    // Imbued heart 1 + Ranarr 3 + Feldip 4 + Super restore 1 + Bond 1 + Death rune (Rest) 1
    expect(p.skippedSells).toEqual({ rows: 11, quantity: 1 + 1014 + 27 + 4 + 1 + 5077 });
    const heart = byItem(p.candidates, "Imbued heart");
    expect(heart).toHaveLength(1);
    expect(heart[0]).toMatchObject({ closed: true, boughtQty: 1, soldQty: 1 });
  });

  it("abgebrochene Angebote zählen mit ihrer gefüllten Menge (FIFO wie im Plugin)", () => {
    // Plugin: 1'726 ohne Steuer. Hier zusätzlich 1 % Steuer 2022/23: 11 + 12 + 10 + 0 = 33
    const [fire] = byItem(p.candidates, "Purple firelighter");
    expect(fire).toMatchObject({ boughtQty: 250, soldQty: 48, closed: false, realized: 1726 - 33 });
    const [death] = byItem(p.candidates, "Death rune");
    expect(death).toMatchObject({ boughtQty: 25000, soldQty: 25000, closed: true });
    expect(death!.realized).toBe(20077 * 158 + 4923 * 167 - (16000 * 150 + 9000 * 151));
  });

  it("historische Steuer wird als tatsächliche Steuer gespeichert, aktuelle Verkäufe nach Regeln", () => {
    const [heart] = byItem(p.candidates, "Imbued heart");
    expect(heart!.trade!.sales[0]!.tax).toBe(304920); // 2022: 1 %
    const recent = plan(csv("Coal,2026-01-01 01:00 PM,10,200,BOUGHT", "Coal,2026-01-02 01:00 PM,10,250,SOLD"), []);
    // Coal unbekannt → nichts; mit bekanntem Item:
    expect(recent.unknownItems.get("Coal")).toBe(2);
    const known = planImport(parseFlippingUtilitiesCsv(csv("Toadflax,2026-01-01 01:00 PM,10,200,BOUGHT", "Toadflax,2026-01-02 01:00 PM,10,250,SOLD")).rows, { resolve, existing: [], now: NOW });
    expect(known.candidates[0]!.trade!.sales[0]!.tax).toBeNull();
    // vor Einführung der Steuer: 0
    const old = planImport(parseFlippingUtilitiesCsv(csv("Toadflax,2021-01-01 01:00 PM,10,200,BOUGHT", "Toadflax,2021-01-02 01:00 PM,10,250,SOLD")).rows, { resolve, existing: [], now: NOW });
    expect(old.candidates[0]!.trade!.sales[0]!.tax).toBe(0);
  });

  it("Vorauswahl: abgeschlossene Flips ja, alte offene Positionen nein", () => {
    const selected = p.candidates.filter((c) => isPreselected(c, NOW)).map((c) => c.itemName).sort();
    expect(selected).toEqual(["Death rune", "Imbued heart", "Mystic robe top (dark)", "Mystic robe top (dark)"]);
    const fresh = planImport(parseFlippingUtilitiesCsv(csv("Toadflax,2026-10-20 01:00 PM,10,200,BOUGHT")).rows, { resolve, existing: [], now: NOW });
    expect(isPreselected(fresh.candidates[0]!, NOW)).toBe(true);
  });

  it("unbekannte und mehrdeutige Namen", () => {
    const r = nameResolver([{ id: 1, name: "Twin" }, { id: 2, name: "Twin" }, { id: 3, name: "Coal" }]);
    expect(r("twin")).toBeNull();
    expect(r(" coal ")).toEqual({ id: 3, name: "Coal" });
  });
});

describe("Flipping Utilities: erneuter Import", () => {
  const first = plan();
  const imported = first.candidates.map((c) => c.trade!).filter(Boolean);

  it("dieselbe Datei nochmals → alles bereits importiert", () => {
    const again = plan(SAMPLE, imported);
    expect(again.candidates.every((c) => c.kind === "duplicate")).toBe(true);
    expect(again.candidates.filter((c) => isPreselected(c, NOW))).toHaveLength(0);
  });

  it("neue Verkäufe ergänzen den bestehenden offenen Trade", () => {
    const death = first.candidates.find((c) => c.itemName === "Death rune")!.trade!;
    const earlier: Trade = { ...death, sales: [] }; // Stand vor den Verkäufen
    const again = plan(SAMPLE, [earlier]);
    const [c] = byItem(again.candidates, "Death rune");
    expect(c).toMatchObject({ kind: "update", added: 2 });
    expect(c!.trade!.id).toBe(death.id);
    expect(c!.trade!.sales).toHaveLength(2);
    expect(isPreselected(c!, NOW)).toBe(true);
  });

  it("manuell erfasste Käufe in derselben Minute gelten als vorhanden; identische Zeilen werden gezählt", () => {
    const at = new Date(2026, 9, 20, 13, 5, 42).getTime(); // Sekunden weichen ab
    const manual: Trade = {
      id: "m", itemId: idOf("Toadflax"), itemName: "Toadflax", createdAt: at, updatedAt: at, notes: "", history: [], offers: [],
      lots: [{ id: "l", date: at, quantity: 2, price: 100, fees: 0 }],
      sales: [{ id: "s", date: at + 60_000, quantity: 1, price: 150, tax: null, fees: 0 }],
    };
    const text = csv("Toadflax,2026-10-20 01:05 PM,2,100,BOUGHT", "Toadflax,2026-10-20 01:06 PM,1,150,SOLD", "Toadflax,2026-10-20 01:06 PM,1,150,SOLD");
    const [c] = plan(text, [manual]).candidates;
    expect(c).toMatchObject({ kind: "update", added: 1, closed: true });
    expect(c!.trade!.sales).toHaveLength(2);
  });

  it("Zeilen über mehrere bestehende Trades verteilt → Konflikt, nicht importieren", () => {
    const t = (id: string, date: number, side: "lot" | "sale"): Trade => ({
      id, itemId: idOf("Toadflax"), itemName: "Toadflax", createdAt: date, updatedAt: date, notes: "", history: [], offers: [],
      lots: side === "lot" ? [{ id: id + "l", date, quantity: 2, price: 100, fees: 0 }] : [{ id: id + "l", date: date - 1, quantity: 2, price: 90, fees: 0 }],
      sales: side === "sale" ? [{ id: id + "s", date, quantity: 2, price: 150, tax: null, fees: 0 }] : [],
    });
    const buyAt = new Date(2026, 9, 20, 13, 5).getTime();
    const sellAt = new Date(2026, 9, 20, 13, 6).getTime();
    const text = csv("Toadflax,2026-10-20 01:05 PM,2,100,BOUGHT", "Toadflax,2026-10-20 01:06 PM,2,150,SOLD");
    const [c] = plan(text, [t("a", buyAt, "lot"), t("b", sellAt, "sale")]).candidates;
    expect(c!.kind).toBe("conflict");
    expect(c!.trade).toBeNull();
    expect(isPreselected(c!, NOW)).toBe(false);
  });
});

describe("Steuer nach Verkaufsdatum", () => {
  it("0 % vor 2021-12-09, 1 % bis 2025-05-28, danach aktuelle Regeln", () => {
    expect(taxRulesAt(Date.parse("2021-12-08T12:00:00Z")).rate).toBe(0);
    expect(taxRulesAt(Date.parse("2021-12-09T12:00:00Z"))).toBe(TAX_RULES_1_PERCENT);
    expect(taxRulesAt(Date.parse("2025-05-28T12:00:00Z")).rate).toBe(0.01);
    expect(taxRulesAt(Date.parse("2025-05-29T12:00:00Z"))).toBe(TAX_RULES);
  });
});

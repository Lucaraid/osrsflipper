import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { CSV_FILE, DATA_FILE, readFolderData, tradesToCsv, writeFolderData, type DirHandle, type FileHandle } from "@/lib/storage/folder";
import { createBackup } from "@/lib/storage/backup";
import { DEFAULT_SETTINGS } from "@/lib/storage/settings-schema";
import { topBuys } from "@/lib/analysis/top";
import { buildCandidate, type ScannerContext } from "@/lib/analysis/scanner";
import { sameData } from "@/state/folder";
import type { Trade } from "@/lib/portfolio/schemas";
import type { DayAgg, ItemMeta, MarketRow } from "@/lib/market/types";

/** In-Memory-Nachbildung eines FileSystemDirectoryHandle */
function memDir(name = "Trades") {
  const files = new Map<string, { text: string; lastModified: number }>();
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
            async close() { files.set(fname, { text: buf, lastModified: Date.now() }); },
          };
        },
      };
      return fh;
    },
  };
  return { dir, files };
}

const trade: Trade = {
  id: "t1", itemId: 4151, itemName: "Abyssal whip", createdAt: 1, updatedAt: 1,
  lots: [{ id: "l1", date: Date.UTC(2026, 9, 1, 10), quantity: 10, price: 1000, fees: 0 }],
  sales: [{ id: "s1", date: Date.UTC(2026, 9, 1, 12), quantity: 4, price: 1100, tax: null, fees: 0 }],
  offers: [], notes: 'Notiz; mit "Zeichen"', history: [],
};

describe("Ordner-Speicherung", () => {
  it("schreibt JSON + CSV und liest sie validiert wieder ein", async () => {
    const { dir, files } = memDir();
    expect((await readFolderData(dir)).kind).toBe("missing");
    const backup = createBackup({ settings: DEFAULT_SETTINGS, trades: [trade], capital: [], watchlist: [], alerts: [], alertEvents: [] }, 123);
    await writeFolderData(dir, backup);
    expect(files.has(DATA_FILE)).toBe(true);
    expect(files.has(CSV_FILE)).toBe(true);
    const r = await readFolderData(dir);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.backup.trades).toEqual([trade]);
  });

  it("ungültige Datei wird erkannt (und nicht überschrieben)", async () => {
    const { dir, files } = memDir();
    files.set(DATA_FILE, { text: "{kaputt", lastModified: 1 });
    const r = await readFolderData(dir);
    expect(r.kind).toBe("invalid");
    expect(files.get(DATA_FILE)?.text).toBe("{kaputt");
  });

  it("CSV: eine Zeile pro Transaktion, Semikolon, BOM, Steuer und FIFO-Gewinn, Escaping", () => {
    const csv = tradesToCsv([trade]);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("Trade-ID;Item;Item-ID;Typ");
    expect(lines[1]).toContain(";Kauf;");
    expect(lines[1]).toContain(";-10000;");
    // Verkauf: 4 × 1100 − 4 × 22 = 4312 netto, realisiert 4 × (1100 − 22 − 1000) = 312
    expect(lines[2]).toContain(";Verkauf;");
    expect(lines[2]).toContain(";88;4312;312;");
    expect(lines[2]).toContain('"Notiz; mit ""Zeichen"""');
  });

  it("sameData vergleicht unabhängig von der Reihenfolge", () => {
    const a = { trades: [trade, { ...trade, id: "t2" }], capital: [], watchlist: [], alerts: [] };
    const b = { trades: [{ ...trade, id: "t2" }, trade], capital: [], watchlist: [], alerts: [] };
    expect(sameData(a, b)).toBe(true);
    expect(sameData(a, { ...b, trades: [trade] })).toBe(false);
  });
});

const NOW = 1_800_000_000;
const day = (o: Partial<DayAgg> = {}): DayAgg => ({ avgHigh: 1_100, avgLow: 1_000, volHigh: 5_000, volLow: 5_000, activeBlocks: 24, bothSidedBlocks: 24, cv: 0.005, minAvg: 1_000, maxAvg: 1_100, firstAvg: 1_050, lastAvg: 1_050, avgSpread: 100, cvRecent: 0.004, cvPrior: 0.005, ...o });
const row = (o: Partial<MarketRow> = {}): MarketRow => ({ id: 1, high: 1_100, highTime: NOW - 60, low: 1_000, lowTime: NOW - 60, m5: null, h1: { avgHigh: 1_100, avgLow: 1_000, volHigh: 200, volLow: 200 }, d1: day(), ...o });
const meta = (o: Partial<ItemMeta> = {}): ItemMeta => ({ id: 1, name: "A", examine: "", members: true, limit: 10_000, value: 1, highalch: 1, icon: "", ...o });
const ctx: ScannerContext = { nowSec: NOW, capital: 5_000_000, priceOffset: 1, thresholds: { freshMinutes: 10, staleMinutes: 60 }, dayBlocksLoaded: 24 };

describe("Top 10 Käufe", () => {
  it("schliesst Items mit zu wenig 24h-Volumen aus und reduziert Mengen auf das x-fache Volumen", () => {
    const liquid = buildCandidate(meta({ id: 1 }), row({ id: 1 }), ctx); // qty 4995 (Kapital), Volumen schwach 5000
    const thin = buildCandidate(meta({ id: 2, name: "B" }), row({ id: 2, d1: day({ volHigh: 300, volLow: 100 }) }), ctx);
    const r = topBuys([liquid, thin], { minVolume24h: 500, minCoverage: 10, sort: "profit" });
    expect(r.picks.map((p) => p.c.id)).toEqual([1]);
    expect(r.excluded.lowVolume).toBe(1);
    const p = r.picks[0]!;
    expect(p.qty).toBe(500); // ⌊5000 / 10⌋ statt 4995
    expect(p.qtyReducedByVolume).toBe(true);
    expect(p.coverage).toBe(10);
    expect(p.profit).toBe(500 * (1_099 - 21 - 1_001));
  });

  it("sortiert nach Gewinn/ROI und begrenzt auf 10", () => {
    const cands = Array.from({ length: 15 }, (_, i) => buildCandidate(meta({ id: i + 1, name: `I${i}` }), row({ id: i + 1, high: 1_100 + i * 10, h1: { avgHigh: 1_100 + i * 10, avgLow: 1_000, volHigh: 200, volLow: 200 } }), ctx));
    const r = topBuys(cands, { minVolume24h: 100, minCoverage: 1, sort: "profit" });
    expect(r.picks).toHaveLength(10);
    expect(r.picks[0]!.c.id).toBe(15);
    for (let i = 1; i < r.picks.length; i++) expect(r.picks[i - 1]!.profit).toBeGreaterThanOrEqual(r.picks[i]!.profit);
    const ex = topBuys(cands, { minVolume24h: 100, minCoverage: 1, sort: "roi", excludeIds: new Set([15]) });
    expect(ex.picks[0]!.c.id).toBe(14);
  });
});

describe("Top 10 High Value", () => {
  it("filtert nach Mindestgewinn pro Trade (nach Volumen-Reduktion)", () => {
    const big = buildCandidate(meta({ id: 1, name: "Teuer", limit: 8 }), row({ id: 1, high: 50_000_000, low: 49_000_000, h1: { avgHigh: 50_000_000, avgLow: 49_000_000, volHigh: 5, volLow: 5 }, d1: day({ avgHigh: 50_000_000, avgLow: 49_000_000, volHigh: 60, volLow: 40, avgSpread: 1_000_000 }) }), { ...ctx, capital: 500_000_000 });
    const small = buildCandidate(meta({ id: 2, name: "Billig" }), row({ id: 2 }), { ...ctx, capital: 500_000_000 });
    // Teuer: Menge min(Kapital 10, Limit 8, Volumen 40/3=13) = 8; Marge 49'999'999 − 1'000'000 − 49'000'001 = −2 → nicht profitabel
    const r = topBuys([big, small], { minVolume24h: 20, minCoverage: 3, sort: "profit", minProfit: 2_000_000 });
    expect(r.picks).toHaveLength(0);
    expect(r.excluded.lowProfit + r.excluded.noMargin).toBe(2);
    const steuerfreiGross = buildCandidate(meta({ id: 13190, name: "Old school bond", limit: 100 }), row({ id: 13190, high: 10_000_000, low: 9_500_000, h1: { avgHigh: 10_000_000, avgLow: 9_500_000, volHigh: 300, volLow: 300 }, d1: day({ avgHigh: 10_000_000, avgLow: 9_500_000, volHigh: 7_000, volLow: 7_000, avgSpread: 500_000 }) }), { ...ctx, capital: 500_000_000 });
    const r2 = topBuys([steuerfreiGross, small], { minVolume24h: 20, minCoverage: 3, sort: "profit", minProfit: 2_000_000 });
    expect(r2.picks.map((p) => p.c.id)).toEqual([13190]);
    expect(r2.picks[0]!.qty).toBe(52); // ⌊500M ÷ 9.5M⌋ = 52 < Limit 100, Volumen 7000/3 reicht
  });
});

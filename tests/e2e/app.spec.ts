import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";

/**
 * E2E-Hauptabläufe. Läuft gegen den Produktions-Build im Testdaten-Modus (synthetische Preise).
 * Jeder Test startet mit leerem Browser-Speicher (eigener Context).
 */

async function openApp(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.getByTestId("fixture-banner")).toBeVisible();
}

test("1. Webseite öffnen & Hauptnavigation", async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("No personal data yet")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  for (const [label, heading] of [
    ["Flip Scanner", "Flip Scanner"],
    ["Profit Calculator", "Profit Calculator"],
    ["My Portfolio", "My Portfolio"],
    ["Flip History", "Flip History"],
    ["Watchlist", "Watchlist"],
    ["Settings", "Settings"],
  ]) {
    await nav.getByRole("link", { name: label }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
});

test("Design: hell ist Standard, Umschalter wechselt auf dunkel und bleibt gespeichert", async ({ page }) => {
  await openApp(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("2./3. Item suchen und Details aufrufen", async ({ page }) => {
  await openApp(page);
  await page.getByTestId("global-search").click();
  await page.getByTestId("search-input").fill("whip");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("item-title")).toHaveText("Abyssal whip");
  await expect(page.getByText("Last instant-buy")).toBeVisible();
  // Suche per ID
  await page.keyboard.press("Control+k");
  await page.getByTestId("search-input").fill("13190");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("item-title")).toHaveText("Old school bond");
  await expect(page.getByText("tax-free").first()).toBeVisible();
  // Zeitraum wechseln
  await page.getByTestId("lookback-7d").click();
  await expect(page.getByText(/Resolution: 1 hour per point/)).toBeVisible();
  await expect(page.getByTestId("indicators")).toBeVisible();
});

test("4. Flip berechnen (Profit-Rechner)", async ({ page }) => {
  await openApp(page, "/calculator");
  await page.getByTestId("calc-buy").fill("1000");
  await page.getByTestId("calc-sell").fill("1100");
  await page.getByTestId("calc-qty").fill("10");
  // 10 × (1100 − 22 − 1000) = 780
  await expect(page.getByTestId("calc-net")).toHaveText("780");
  await expect(page.getByTestId("calc-roi")).toContainText("7.8");
  await expect(page.getByTestId("calc-breakeven")).toHaveText(/^1.020$/); // 1020 − 20 = 1000 (Tausendertrennzeichen)
  // Kurzschreibweise
  await page.getByTestId("calc-buy").fill("1.5k");
  await page.getByTestId("calc-sell").fill("1.6k");
  await expect(page.getByTestId("calc-net")).toHaveText("680"); // 10 × (1600 − 32 − 1500)
});

test("5. Filter im Scanner setzen", async ({ page }) => {
  await openApp(page, "/scanner");
  await expect(page.getByTestId("scanner-row").first()).toBeVisible();
  const before = await page.getByTestId("scanner-row").count();
  expect(before).toBeGreaterThan(0); // synthetische Preise variieren zeitabhängig
  await page.getByTestId("toggle-filters").click();
  await page.getByTestId("filter-min-roi").fill("1000");
  await expect(page.getByText("No items match the filters")).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.getByTestId("scanner-row").first()).toBeVisible();
  await page.getByTestId("filter-min-quality").selectOption("75");
  const filtered = await page.getByTestId("scanner-row").count();
  expect(filtered).toBeLessThanOrEqual(before);
  await page.getByTestId("scanner-sort").selectOption("roi");
  await expect(page.getByTestId("scanner-row").first()).toBeVisible();
});

test("6. Item zur Watchlist hinzufügen", async ({ page }) => {
  await openApp(page, "/items/4151");
  await page.getByTestId("watch-4151").click();
  await expect(page.getByText("added to watchlist")).toBeVisible();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Watchlist" }).click();
  await expect(page.getByTestId("watch-row")).toHaveCount(1);
  await expect(page.getByTestId("watch-row")).toContainText("Abyssal whip");
  // bleibt nach Reload erhalten (IndexedDB)
  await page.reload();
  await expect(page.getByTestId("watch-row")).toHaveCount(1);
});

async function createTrade(page: Page, navigate = true) {
  if (navigate) await openApp(page, "/history");
  else await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Flip History" }).click();
  await page.getByTestId("new-trade").click();
  await page.getByTestId("trade-item").click();
  await page.getByTestId("trade-item").fill("Abyssal whip");
  await page.getByRole("option", { name: /Abyssal whip/ }).click();
  await page.getByTestId("lot-qty").fill("10");
  await page.getByTestId("lot-price").fill("1000");
  await page.getByTestId("save-trade").click();
  await expect(page.getByTestId("trade-row")).toHaveCount(1);
}

test("7.–9. Trade erstellen, Teilverkauf erfassen, realisierten Gewinn prüfen", async ({ page }) => {
  await createTrade(page);
  await expect(page.getByTestId("trade-row")).toContainText("open");
  // 10 × 1000 gp offen investiert
  await expect(page.getByTestId("invested-open")).toContainText(/10.000/);
  // Einstand 1000 → mit Gewinn ab 1021 (1021 − 20 Steuer = 1001)
  await expect(page.getByTestId("trade-min-sell")).toHaveText(/^1.021$/);
  // empfohlener Verkaufspreis aus den (synthetischen) Marktdaten
  await expect(page.getByTestId("trade-sell-at")).toHaveText(/^\d[\d'’.]*$/);
  await page.getByTestId("edit-trade").click();
  await expect(page.getByTestId("lot-heads")).toContainText("Buy price each");
  await page.getByTestId("add-sale").click();
  await expect(page.getByTestId("sale-heads")).toContainText("Tax paid");
  await page.getByTestId("sale-qty").fill("4");
  await page.getByTestId("sale-price").fill("1100");
  // Vorschau: 4 × (1100 − 22 − 1000) = 312
  await expect(page.getByTestId("trade-preview")).toContainText("312");
  await page.getByTestId("save-trade").click();
  await expect(page.getByTestId("trade-row")).toContainText("partly sold");
  await expect(page.getByTestId("trade-realized")).toHaveText("312");
  // nach Verkauf von 4 Stück: noch 6 × 1000 investiert
  await expect(page.getByTestId("invested-open")).toContainText(/6.000/);

  // Überverkauf wird verhindert
  await page.getByTestId("edit-trade").click();
  await page.getByTestId("add-sale").click();
  await page.getByTestId("sale-qty").last().fill("50");
  await page.getByTestId("sale-price").last().fill("1100");
  await page.getByTestId("save-trade").click();
  await expect(page.getByText(/more than you held at that time/).first()).toBeVisible();
  await page.keyboard.press("Escape");

  // Dashboard zeigt realisierten Gewinn
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Dashboard" }).click();
  await expect(page.getByTestId("dashboard-kpis")).toContainText("312");
});

test("10. Daten exportieren und wieder importieren", async ({ page }, testInfo) => {
  await createTrade(page);
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Settings" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-button").click()]);
  const file = testInfo.outputPath("backup.json");
  await download.saveAs(file);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  expect(json.format).toBe("osrs-ge-flipper-backup");
  expect(json.trades).toHaveLength(1);

  // alles löschen
  await page.getByRole("button", { name: "Delete all data" }).click();
  await page.getByTestId("confirm-button").click();
  await expect(page.getByText(/Currently saved: 0 trades/)).toBeVisible();

  // ungültige Datei wird abgelehnt
  const bad = testInfo.outputPath("bad.json");
  fs.writeFileSync(bad, JSON.stringify({ format: "osrs-ge-flipper-backup", version: 1, trades: "kaputt" }));
  await page.getByTestId("import-input").setInputFiles(bad);
  await expect(page.getByText("Import rejected:")).toBeVisible();

  // gültige Datei importieren
  await page.getByTestId("import-input").setInputFiles(file);
  await expect(page.getByText(/Currently saved: 1 trades/)).toBeVisible();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Flip History" }).click();
  await expect(page.getByTestId("trade-row")).toHaveCount(1);
});

test("API: Validierung und Fehlerantworten", async ({ request }) => {
  const bad = await request.get("/api/timeseries?id=abc&lookback=5y");
  expect(bad.status()).toBe(400);
  const body = await bad.json();
  expect(body.error).toBeTruthy();
  expect(JSON.stringify(body)).not.toMatch(/stack|at .*\.ts/);
  const ok = await request.get("/api/timeseries?id=4151&lookback=24h");
  expect(ok.status()).toBe(200);
  const market = await request.get("/api/market");
  const m = await market.json();
  expect(m.meta.source).toBe("fixtures");
  expect(m.rows.length).toBeGreaterThan(10);
  const headers = market.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
});

test("Trades in gewähltem Ordner speichern (File System Access API, simuliert)", async ({ page }) => {
  // Simulierter Ordner: Playwright kann den nativen Ordner-Dialog nicht bedienen.
  await page.addInitScript(() => {
    const files: Record<string, string> = {};
    (window as unknown as { __files: Record<string, string> }).__files = files;
    class MemFile {
      constructor(private n: string) {}
      async getFile() {
        return new File([files[this.n] ?? ""], this.n, { lastModified: Date.now() });
      }
      async createWritable() {
        let buf = "";
        const n = this.n;
        return { write: async (d: string) => void (buf += d), close: async () => void (files[n] = buf) };
      }
    }
    class MemDir {
      kind = "directory";
      name = "D-Trades";
      async getFileHandle(n: string, o?: { create?: boolean }) {
        if (!(n in files)) {
          if (!o?.create) throw new DOMException("missing", "NotFoundError");
          files[n] = "";
        }
        return new MemFile(n);
      }
      async queryPermission() { return "granted"; }
      async requestPermission() { return "granted"; }
    }
    (window as unknown as { showDirectoryPicker: () => Promise<MemDir> }).showDirectoryPicker = async () => new MemDir();
  });
  await openApp(page, "/settings");
  await page.getByTestId("folder-pick").click();
  await expect(page.getByTestId("folder-connected")).toContainText("D-Trades");
  await createTrade(page, false); // clientseitige Navigation – der simulierte Ordner lebt nur im Seitenspeicher
  await expect(page.getByTestId("history-folder")).toContainText("D-Trades");
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __files: Record<string, string> }).__files["osrs-ge-flipper-daten.json"] ?? "")).toContain("Abyssal whip");
  const csv = await page.evaluate(() => (window as unknown as { __files: Record<string, string> }).__files["trades.csv"] ?? "");
  expect(csv).toContain(";Buy;");
});

test("Top 10 Käufe: Empfehlungen mit Volumen-Kriterium und Kaufangebot erfassen", async ({ page }) => {
  await openApp(page, "/top");
  const picks = page.getByTestId("top-pick");
  await expect(picks.first()).toBeVisible();
  expect(await picks.count()).toBeLessThanOrEqual(10);
  // sehr hohes Mindestvolumen → keine Empfehlungen
  await page.getByTestId("top-min-volume").fill("100000000");
  await expect(page.getByText("No item meets all criteria right now")).toBeVisible();
  await page.getByTestId("top-min-volume").fill("10");
  await expect(picks.first()).toBeVisible();
  await picks.first().getByTestId("top-create-offer").click();
  await expect(page.getByText(/Buy offer for .* logged/)).toBeVisible();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Flip History" }).click();
  await expect(page.getByTestId("trade-row")).toHaveCount(1);
  // leerer Flip mit offenem Angebot: nichts investiert, aber Geld im GE gebunden
  await expect(page.getByTestId("invested-open")).toContainText("0 open flips");
  await expect(page.getByTestId("pending-offers")).toContainText("Not bought yet");
  await expect(page.getByTestId("pending-offers").locator(".num").first()).not.toHaveText("0");
});

test("Top 10 High Value: Mindestgewinn pro Trade", async ({ page }) => {
  await openApp(page, "/top");
  await page.getByTestId("tab-high-value").click();
  await page.getByTestId("hv-min-profit").fill("1000000000");
  await expect(page.getByText("No item meets all criteria right now")).toBeVisible();
  await page.getByTestId("hv-min-profit").fill("1");
  await page.getByTestId("hv-min-volume").fill("1");
  await expect(page.getByTestId("hv-list").getByTestId("top-pick").first()).toBeVisible();
});

test("Trade erfassen übernimmt Rechner-Werte; danach wird ein Verkauf mit offener Menge vorbereitet", async ({ page }) => {
  await openApp(page, "/items/4151");
  await page.getByTestId("calc-buy").fill("1000");
  await page.getByTestId("calc-sell").fill("1200");
  await page.getByTestId("calc-qty").fill("7");
  await expect(page.getByTestId("item-new-trade")).toHaveText(/Log trade/);
  await page.getByTestId("item-new-trade").click();
  await expect(page.getByTestId("lot-qty")).toHaveValue("7");
  await expect(page.getByTestId("lot-price")).toHaveValue(/^1.000$/);
  await page.getByTestId("save-trade").click();

  // offener Kauf vorhanden → Button wird zu "Log sale"
  await expect(page.getByTestId("item-new-trade")).toHaveText(/Log sale/);
  await page.getByTestId("item-new-trade").click();
  await expect(page.getByRole("dialog")).toContainText("Log sale");
  await expect(page.getByTestId("sale-qty").last()).toHaveValue("7");
  await expect(page.getByTestId("sale-price").last()).toHaveValue(/^1.200$/);
  await page.getByTestId("save-trade").click();
  // vollständig verkauft → wieder "Trade erfassen"
  await expect(page.getByTestId("item-new-trade")).toHaveText(/Log trade/);

  // Flip-Historie: Gewinn 7 × (1200 − 24 − 1000) = 1232
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Flip History" }).click();
  await expect(page.getByTestId("trade-realized")).toHaveText(/^1.232$/);
});

test("Flip-Historie: „Verkaufen“ bei offenem Trade füllt Menge vor", async ({ page }) => {
  await createTrade(page);
  await page.getByTestId("sell-trade").click();
  await expect(page.getByRole("dialog")).toContainText("Log sale");
  await expect(page.getByTestId("sale-qty").last()).toHaveValue("10");
  await expect(page.getByTestId("sale-price").last()).not.toHaveValue("");
});

async function seedLimiter(page: Page, limiter: { count: number; challenge: { answer: string; guesses: string[] } | null }) {
  await page.evaluate((l) => {
    localStorage.setItem("osrs-ge-flipper:settings:v1", JSON.stringify({ requestLimiter: { enabled: true, requestsPerPuzzle: 10 } }));
    localStorage.setItem("osrs-ge-flipper:limiter:v1", JSON.stringify(l));
  }, limiter);
  await page.reload();
}

test("Anfrage-Limiter: Wordle hält Anfragen an, bis es gelöst ist", async ({ page }) => {
  await openApp(page);
  await seedLimiter(page, { count: 10, challenge: { answer: "RUNES", guesses: [] } });
  const gate = page.getByTestId("wordle-gate");
  await expect(gate).toBeVisible();
  // nicht schliessbar
  await page.keyboard.press("Escape");
  await expect(gate).toBeVisible();

  // zu kurz → Hinweis, zählt nicht
  await page.keyboard.type("RUN");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("wordle-message")).toHaveText("Not enough letters");
  for (let i = 0; i < 3; i++) await page.keyboard.press("Backspace");

  // physische Tastatur: SNORE → S, N, R, E gelb, O rot
  await page.keyboard.type("SNORE");
  await page.keyboard.press("Enter");
  const states = (r: number) => Promise.all([0, 1, 2, 3, 4].map((c) => page.getByTestId(`wordle-tile-${r}-${c}`).getAttribute("data-state")));
  expect(await states(0)).toEqual(["present", "present", "miss", "present", "present"]);
  await expect(page.getByTestId("wordle-key-O")).toHaveAttribute("data-state", "miss");

  // Bildschirmtastatur: TUNES → T rot, Rest grün
  for (const k of "TUNES") await page.getByTestId(`wordle-key-${k}`).click();
  await page.getByTestId("wordle-enter").click();
  expect(await states(1)).toEqual(["miss", "hit", "hit", "hit", "hit"]);

  await page.keyboard.type("RUNES");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("wordle-message")).toContainText("Solved in 3/6");
  await page.getByTestId("wordle-continue").click();
  await expect(gate).toBeHidden();
  // Anfragen laufen weiter, Zähler neu
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Settings" }).click();
  await expect(page.getByTestId("limiter-status")).toContainText(/of 10 requests used/);
  await page.reload();
  await expect(gate).toBeHidden();
});

test("Anfrage-Limiter: nach 6 Fehlversuchen gibt es ein neues Wort", async ({ page }) => {
  await openApp(page);
  await seedLimiter(page, { count: 10, challenge: { answer: "RUNES", guesses: ["CRANE", "CRANE", "CRANE", "CRANE", "CRANE"] } });
  await expect(page.getByTestId("wordle-gate")).toBeVisible();
  await page.keyboard.type("BUILT");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("wordle-answer")).toHaveText("RUNES");
  await page.getByTestId("wordle-new").click();
  await expect(page.getByTestId("wordle-tile-0-0")).toHaveAttribute("data-state", "empty");
  await expect(page.getByTestId("wordle-gate")).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("osrs-ge-flipper:limiter:v1") ?? "{}"));
  expect(stored.challenge.guesses).toEqual([]);
  expect(stored.challenge.answer).not.toBe("RUNES");
});

test("Anfrage-Limiter: in den Einstellungen abschaltbar", async ({ page }) => {
  await openApp(page, "/settings");
  await seedLimiter(page, { count: 0, challenge: null });
  await expect(page.getByTestId("limiter-status")).toBeVisible();
  await page.getByTestId("limiter-enabled").uncheck();
  await expect(page.getByTestId("limiter-status")).toBeHidden();
  await page.evaluate(() => localStorage.setItem("osrs-ge-flipper:limiter:v1", JSON.stringify({ count: 1000, challenge: null })));
  await page.reload();
  await page.getByTestId("global-search").click();
  await page.getByTestId("search-input").fill("whip");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("item-title")).toHaveText("Abyssal whip");
  await expect(page.getByTestId("wordle-gate")).toBeHidden();
});

test("Anfrage-Limiter: Tipps und Ausweg über die Einstellungen", async ({ page }) => {
  await openApp(page);
  await seedLimiter(page, { count: 10, challenge: { answer: "RUNES", guesses: [] } });
  const gate = page.getByTestId("wordle-gate");
  await expect(gate).toBeVisible();

  // zwei Tipps verraten je einen Buchstaben am richtigen Platz
  await page.getByTestId("wordle-hint").click();
  await expect(page.getByTestId("wordle-hint")).toContainText("1 left");
  await page.getByTestId("wordle-hint").click();
  await expect(page.getByTestId("wordle-hint")).toBeDisabled();
  const revealed: string[] = [];
  for (let i = 0; i < 5; i++) {
    const t = (await page.getByTestId(`wordle-hint-${i}`).textContent()) ?? "";
    if (t !== "?") {
      expect(t).toBe("RUNES"[i]);
      revealed.push(t);
    }
  }
  expect(revealed).toHaveLength(2);

  // Einstellungen sind trotz Rätsel erreichbar, andere Seiten nicht
  await page.getByTestId("wordle-settings-link").click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(gate).toBeHidden();
  await expect(page.getByTestId("limiter-paused")).toBeVisible();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Dashboard" }).click();
  await expect(gate).toBeVisible();
  await expect(page.getByTestId("wordle-hint")).toBeDisabled(); // Tipps bleiben verbraucht

  // abschalten → Rätsel verworfen, Daten laufen wieder
  await page.getByTestId("wordle-settings-link").click();
  await page.getByTestId("limiter-enabled").uncheck();
  await expect(page.getByTestId("limiter-paused")).toBeHidden();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Dashboard" }).click();
  await expect(gate).toBeHidden();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("osrs-ge-flipper:limiter:v1") ?? "{}"));
  expect(stored.challenge).toBeNull();
});

# CLAUDE.md – Projektkontext für Claude Code

Dieses Projekt wurde in einem Claude-Chat (Cowork) gebaut und wird in Claude Code weitergeführt.
Diese Datei fasst alles Wichtige zusammen, damit eine neue Sitzung ohne den alten Chat weiterarbeiten kann.

## Nutzer & Sprache

- Besitzer: Pascal (Schweiz). **Antworten an Pascal auf Deutsch (Schweizer Schreibweise: „ss“ statt „ß“). Die App-Oberfläche ist auf Englisch** (seit 2026-10-26). Zahlenformat bleibt de-CH (1'234'567), Datumsformat en-GB.
- Pascal spielt OSRS und nutzt das Tool selbst zum Flippen. Er will praktische, schnelle Bedienung (möglichst wenig Tippen).
- Läuft auf Windows: in PowerShell `npm.cmd` statt `npm` verwenden (Execution Policy blockiert `npm.ps1`).

## Was das Projekt ist

OSRS Grand Exchange Flipper – Next.js-Webapp, die Flip-Gelegenheiten aus der **OSRS Wiki Real-time Prices API v2** (`https://prices.runescape.wiki/api/v2/osrs`) berechnet und eigene Trades trackt. Ausführliche Doku: `README.md`, `docs/01–05`.

Seiten (UI englisch): Dashboard · **Top 10 Buys** (Tabs Standard + High Value ≥ 2M Gewinn/Trade + Volatile = vom 30-Tage-Abgleich ausgeschlossene Items zur manuellen Prüfung) · Flip Scanner · Item-Detail (über Suche Ctrl+K) · Profit Calculator · My Portfolio · Flip History (Tracker) · Watchlist · Settings · Methodology (`/methodology`) · Privacy (`/privacy`).

## Befehle

```bash
npm run dev          # Entwicklung (http://localhost:3000)
npm run build        # Produktions-Build (muss grün sein)
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # Vitest (Unit + Integration)
npm run test:e2e     # Playwright gegen `next start` mit MARKET_DATA_SOURCE=fixtures (vorher build!)
```

Vor jedem Abschluss: `lint`, `typecheck`, `test`, `build`, `test:e2e` – alles muss grün sein.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript strict (`noUncheckedIndexedAccess`) · Tailwind CSS 4 (Tokens in `src/app/globals.css`) · Radix UI im shadcn-Stil (`src/components/ui`) · TanStack Query · Zustand · Zod 4 · Lightweight Charts 5 · idb · Vitest 5 · Playwright 1.63.

## Architektur (Kurzfassung)

- `src/lib/market/` – Wiki-Client (UA, Timeout, Retry/Backoff, Semaphor), TtlCache (stale-on-error), Parser (Zod), 24h-Aggregation aus 24 × `/1h`, **30-Tage-Grundlinie** aus 30 × `/24h?timestamp=` (`history.ts`), `MarketService` (Server-Singleton in `server.ts`), Rate-Limit, gzip-JSON.
- `src/app/api/{items,market,history,timeseries,health}` – eigene API-Routen; Client holt nur von dort.
- `src/lib/tax/` – **einzige** Stelle für GE-Steuer: 2 % pro Stück, abgerundet, max. 5M/Stück, 48 befreite Item-IDs (Stand 2026-10-24).
- `src/lib/calc/profit.ts` – zentrale Flip-Berechnung (`calculateFlip`, Break-even, max. Kaufpreis, max. Menge).
- `src/lib/analysis/` – Datenqualität, Risiko, Scanner + Ranking (inkl. **konservativer Marge** mit 1h-Ø-Preisen), **30-Tage-Abgleich** (`history-check.ts`: Spitze, wiederkehrende Spitzen, Trend, Sprunghaftigkeit, Spread-Deckel, normales Volumen), Top-10 (`top.ts`), Indikatoren.
- `src/lib/portfolio/` – Zod-Schemas, FIFO (`fifo.ts`), Portfolio ohne Doppelzählung, Zeitreihe.
- `src/lib/storage/` – IndexedDB (v2, Store `meta` für Ordner-Handle), Settings (LocalStorage, Zod), Backup-Format, **Ordner-Speicherung** (`folder.ts`, File System Access API: `osrs-ge-flipper-daten.json` + `trades.csv`).
- `src/state/` – Zustand-Stores: `data` (Trades etc.), `settings`, `folder`, `calc` (letzte Rechner-Werte je Item), `toasts`.
- Testdaten: `tests/fixtures/synthetic-market.ts` (synthetisch, nur bei `MARKET_DATA_SOURCE=fixtures`, UI zeigt „TESTDATEN“-Banner).

## Verbindliche Grundsätze (aus dem ursprünglichen Auftrag)

1. Nie Preise, Volumen oder Historie erfinden. Fehlt etwas → „Nicht verfügbar“.
2. Schätzungen kennzeichnen (`<Est />` = „gesch.“). Letzte Beobachtung ≠ ausführbarer Preis (kein Orderbuch).
3. Keine Aussagen wie „garantierter Gewinn“. Ranking = Entscheidungshilfe.
4. Steuer immer über `src/lib/tax`, Gewinne immer über `calculateFlip` bzw. FIFO.
5. API-Fehler → zwischengespeicherte Daten mit Altershinweis, nie Ersatzdaten.
6. Persönliche Daten nur lokal (Browser oder gewählter Ordner); keine Konten, kein Tracking.
7. Neue Funktionen bekommen Unit- und, wo sinnvoll, E2E-Tests (`data-testid`s nutzen).

## Bisherige Wünsche von Pascal (Verlauf)

1. Vollständige Plattform laut Master-Prompt (alle Phasen umgesetzt).
2. Trades lokal in einem **selbst gewählten Ordner** speichern → Einstellungen › Speicherort (Chrome/Edge).
3. **Top 10 Käufe** mit ausreichend 24h-Volumen (schwächere Seite ≥ 500 Stück und ≥ 10× Menge, sonst Menge reduzieren).
4. **High Value Top 10**: ≥ 2M gp Gewinn pro Trade (Kapital pro Trade = Gesamtkapital, Volumen ≥ 20 / ≥ 3×).
5. Git-Repository (lokal angelegt; Push zu GitHub macht Pascal selbst).
6. **„Trade erfassen“ übernimmt Kaufpreis + Stückzahl aus dem Profit-Rechner**; existiert bereits ein offener Kauf für das Item, wird direkt ein **Verkauf** mit Verkaufspreis aus dem Rechner und der offenen Menge vorbereitet. Flip-Historie hat einen „Verkaufen“-Button.
7. **Design fröhlicher, Standard = helles Design in Pergament-Braun wie das OSRS Wiki** (dunkel = warmes Holz-Braun, Umschalter oben rechts). Farben nur über Tokens in `globals.css`. App vereinfacht: Marktanalyse, Preisalarme und Item-Explorer-Liste entfernt (Alarm-Daten bleiben im Speicher-/Backup-Format für Kompatibilität), Einstellungen ohne Datenaktualität/Positionsregeln, Dashboard mit 6 Kennzahlen.
8. **Ganze App auf Englisch.** Interne Werte bleiben deutsch, damit gespeicherte Daten gültig bleiben (Trade-Status `offen/teilweise/geschlossen`, Risiko/Qualität `niedrig/mittel/hoch/unzureichend`, Dateiname `osrs-ge-flipper-daten.json`) – Anzeige über Label-Maps (`LEVEL_LABEL`, `STATUS_LABEL`). Code-Kommentare bleiben deutsch.
9. **Kaufchargen ohne Gebühren-Feld** (gibt es im GE nicht); beim Verkauf bleibt das optionale Feld für die tatsächliche Steuer.
10. **Scanner/Top 10 gegen die letzten 30 Tage absichern** (Items, die regelmässig ausschlagen oder fallen, sollen nicht als gute Flips erscheinen) → `docs/03-methodik.md` Abschnitt 6a. Ausgeschlossene Items nicht verstecken, sondern im Tab **Volatile** mit Grund zeigen (Nutzer entscheidet selbst).

## Bekannte Grenzen / Ideen

- Items ohne bekanntes GE-Limit: Menge nur durch Kapital/Volumen begrenzt.
- 4-h-Kauflimit wird nur aus **erfassten** Käufen/offenen Angeboten nachverfolgt (`src/lib/portfolio/buy-limit.ts`); nicht erfasste Käufe kennt die App nicht.
- Siehe `docs/05-limitations.md`.

## Umgebung

- `.env.local` aus `.env.example` erstellen; `WIKI_USER_AGENT` mit Kontakt setzen (Pflicht laut Wiki-API).
- Hinter einem Proxy: Node ≥ 22.21 mit `NODE_USE_ENV_PROXY=1`.

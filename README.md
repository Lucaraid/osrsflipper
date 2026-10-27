# OSRS GE Flipper

Datenbasierter Trading-Assistent für den **Old School RuneScape Grand Exchange**: Flip-Scanner, Profit-Rechner mit verifizierter GE-Steuer, Item-Analyse mit interaktiven Charts sowie ein vollständiger Trade-Tracker (FIFO, Teilverkäufe) mit Portfolio und Watchlist.

- **Datenquelle:** [OSRS Wiki Real-time Prices API v2](https://oldschool.runescape.wiki/w/RuneScape:Real-time_Prices). Es werden keine Preise erfunden. Schätzungen sind als solche gekennzeichnet.
- **Kein Konto nötig:** Persönliche Daten bleiben lokal – in einem selbst gewählten Ordner (Chrome/Edge) oder im Browser-Speicher; Export/Import als JSON.
- **Stack:** Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Radix UI (shadcn-Stil) · TanStack Query · Zustand · Zod 4 · Lightweight Charts 5 · Vitest · Playwright

> Kein offizielles Jagex-Produkt. Alle Berechnungen sind Schätzungen ohne Gewähr und keine Finanzberatung. Marktdaten: OSRS Wiki, CC BY-NC-SA 3.0.

---

## Inhalt

1. [Funktionen](#funktionen)
2. [Schnellstart](#schnellstart)
3. [Skripte](#skripte)
4. [Konfiguration](#konfiguration)
5. [Projektstruktur](#projektstruktur)
6. [Eigene API-Routen](#eigene-api-routen)
7. [Tests](#tests)
8. [Deployment](#deployment)
9. [Fehlerbehebung](#fehlerbehebung)
10. [Weitere Dokumentation](#weitere-dokumentation)

## Funktionen

| Bereich | Inhalt |
|---|---|
| **Top 10 Käufe** | Die 10 besten aktuellen Kauf-Kandidaten mit konkretem Kaufgebot, Verkaufspreis, Menge, Kapital und geschätztem Gewinn. Voraussetzung: genug **Handelsvolumen der letzten 24 h** (einstellbar: Mindeststückzahl auf der schwächeren Seite und Volumen ≥ x-fache Menge; ist die Menge zu gross, wird sie reduziert). Ein Klick erfasst das Kaufangebot direkt im Tracker. Zweiter Tab **High Value**: nur Items mit **≥ 2M gp Gewinn pro Trade** (einstellbar), Kapital pro Trade = Gesamtkapital, angepasste Volumen-Kriterien. |
| **Dashboard** | Verfügbares/gebundenes Kapital, Portfoliowert (gesch.), realisierter/unrealisierter Gewinn, ROI, Erfolgsquote, Ø Gewinn/Flip, Ø Haltedauer, Kapitalverlauf, offene/abgeschlossene Trades, Watchlist, Top-Scanner-Ergebnisse, Warnungen zu veralteten Daten. Ohne Daten erscheint ein leerer Zustand ohne Beispielwerte. |
| **Flip Scanner** | Alle ca. 4'500 gehandelten Items mit letzten Instant-Buy/-Sell-Preisen und deren Alter, geschätzten Kauf-/Verkaufspreisen, Nettomarge nach Steuer, ROI, Menge nach Kapital und Limit, Kapitalbedarf, Gewinn beim gewählten Kapital, Potenzial pro Limit, Volumen 1h/24h, Risiko, Datenqualität und einem transparenten Ranking mit Begründungen. 14 Filter, 9 Sortierungen, Teilallokation und speicherbare Filter-Presets. |
| **Item-Detail** | Suche nach Name/ID mit Relevanz und Autovervollständigung (Strg/Cmd+K). Detailseite mit allen Preisindikatoren, interaktivem Chart (6h–1y, Zoom/Pan, Tooltip, Volumen, sichtbare Lücken), Marktindikatoren, Profit-Rechner, Datenqualität und eigener Trade-Historie. |
| **Profit-Rechner** | Bruttogewinn, Umsatz, GE-Steuer (oder tatsächliche Steuer), Nettogewinn, ROI, Break-even-Preis, maximaler Kaufpreis für einen Zielgewinn, maximale Menge bei gegebenem Kapital, Kapitalbedarf. Eingaben im OSRS-Stil (`1.5m`, `250k`). |
| **Flip-Historie** | Speicherung wahlweise in einem **Ordner deiner Wahl** auf dem eigenen Computer (`osrs-ge-flipper-daten.json` + `trades.csv` für Excel; Chrome/Edge). Trades mit mehreren Kaufchargen, Teilverkäufen, Gebühren, offenen Kaufangeboten, Notizen und Änderungshistorie. Gewinne nach FIFO, Überverkäufe werden blockiert. Filter nach Item, Status, Ergebnis und Datum. |
| **Portfolio** | Kapitalbuchungen und manueller Abgleich, Cash/Reserve/Verfügbar/Gebunden ohne Doppelzählung, offene Positionen mit geschätztem Marktwert, Kapitalverteilung, Positionsregeln mit Warnungen (inkl. GE-Slots). |
| **Watchlist** | Favoriten, Notizen, Zielpreise, Zielmarge und Ziel-ROI. |
| **Einstellungen** | Hell (Pergament-Braun wie das OSRS Wiki) / Dunkel, Standardkapital, Über-/Unterbieten, GE-Slots, JSON-Export/-Import, Daten löschen. |

## Schnellstart

Voraussetzung: **Node.js ≥ 20.9** (getestet mit 22) und npm.

```bash
npm install
cp .env.example .env.local      # WIKI_USER_AGENT mit eigener Kontaktadresse setzen
npm run dev                     # http://localhost:3000
```

Produktions-Build lokal:

```bash
npm run build
npm start                       # http://localhost:3000
```

### App aktualisieren

Läuft die App lokal aus einem Git-Klon, erscheint unten in der Seitenleiste der Link **„Update app“**. Er zeigt die installierte Version, prüft per `git fetch`, ob neue Commits vorliegen, und lädt sie auf Knopfdruck mit `git pull --ff-only` – ohne Konsole. Danach:

- `npm run dev`: Änderungen werden automatisch übernommen, Seite neu laden.
- Haben sich `package.json`/`package-lock.json` geändert: `npm install` ausführen und neu starten (die App weist darauf hin).
- `npm start` (Produktions-Build): `npm run build` und neu starten.

Sicherheit: Es werden nur fest definierte Git-Befehle ausgeführt. Die Funktion ist nur über `localhost`/`127.0.0.1` erreichbar, POST nur vom selben Origin, auf Vercel automatisch aus und per `SELF_UPDATE=0` abschaltbar. Lokale Commits werden nie gemergt (`--ff-only`); in diesem Fall zeigt der Dialog die Git-Meldung.

## Skripte

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver (Turbopack) |
| `npm run build` | Produktions-Build |
| `npm start` | Produktionsserver (nach `build`) |
| `npm run lint` | ESLint (Next.js Core Web Vitals + TypeScript) |
| `npm run typecheck` | TypeScript-Prüfung ohne Build |
| `npm test` | Unit- und Integrationstests (Vitest) |
| `npm run test:e2e` | End-to-End-Tests (Playwright, startet `next start` mit Testdaten; vorher `npm run build`) |

## Konfiguration

Siehe `.env.example`:

| Variable | Standard | Beschreibung |
|---|---|---|
| `WIKI_USER_AGENT` | generischer UA | **Pflicht für Produktion.** Beschreibender User-Agent mit Kontakt (E-Mail/Discord), wie in der API-Doku gefordert. |
| `MARKET_DATA_SOURCE` | `wiki` | `fixtures` schaltet auf **synthetische Testdaten** (nur für Tests). Die UI zeigt dann ein unübersehbares „TESTDATEN“-Banner. |
| `API_RATE_LIMIT_PER_MINUTE` | `120` | Rate-Limit der eigenen API-Routen pro IP und Minute. |
| `SELF_UPDATE` | an | `0` blendet den Link „Update app“ aus und sperrt `/api/update` (auf Vercel immer aus). |
| `GIT_PATH` | – | Pfad zu `git`, falls es nicht im `PATH` liegt (unter Windows wird zusätzlich `C:\Program Files\Git\cmd\git.exe` versucht). |

Es werden keine Geheimnisse oder API-Schlüssel benötigt.

## Projektstruktur

```
src/
  app/                     Seiten (App Router) und API-Routen
    api/{items,market,timeseries,health}/route.ts
    page.tsx               Dashboard
    scanner/ items/ items/[id]/ market/ calculator/ portfolio/ history/ watchlist/ alerts/ settings/
    methodik/ datenschutz/
  components/              UI (ui = Basiskomponenten, layout, charts, scanner, items, trades, common)
  hooks/                   Datenabruf (TanStack Query), Portfolio-Hook
  state/                   Zustand-Stores (Einstellungen, persönliche Daten, Toasts)
  lib/
    market/                Wiki-Client, Cache, Parser, Aggregation, Service, Rate-Limit
    tax/                   Verifizierte GE-Steuerregeln (zentral) und Berechnung
    calc/                  Zentrale Flip-Berechnung (Profit, Break-even, Mengen)
    analysis/              Datenqualität, Risiko, Scanner/Ranking, Top 10, Indikatoren
    portfolio/             Zod-Schemas, FIFO, Portfolio und Zeitreihe
    storage/               IndexedDB, LocalStorage-Einstellungen, Backup (Export/Import)
    alerts/ search/
tests/
  unit/ integration/ e2e/  Vitest- und Playwright-Tests
  fixtures/                Synthetische Testdaten (klar getrennt, nie in Produktion aktiv)
docs/                      Recherche, Architektur, Methodik, Deployment, Einschränkungen
```

## Eigene API-Routen

Alle Routen antworten mit JSON (gzip, wenn der Client es akzeptiert), sind per IP rate-limitiert und geben Fehler ohne interne Details zurück.

| Route | Parameter | Antwort | Cache-Control |
|---|---|---|---|
| `GET /api/items` | – | `{ meta, items: ItemMeta[] }` (Mapping) | `s-maxage=3600` |
| `GET /api/market` | – | `{ meta, rows: MarketRow[] }`: latest + 5m + 1h + 24h-Aggregat je Item, inkl. Abrufzeitpunkten und Stale-Status | `s-maxage=20` |
| `GET /api/timeseries` | `id` (int), `lookback` ∈ `6h,24h,7d,30d,6m,1y` | `{ meta (timestep, start, end, stale), itemId, points }` | `s-maxage=60` |
| `GET /api/health` | – | `{ ok, source, time }` | `no-store` |
| `GET /api/update` | `check=1` (optional, mit `git fetch`) | `{ enabled, version, behind?, upstream? }` bzw. `{ enabled: false, reason }` | `no-store` |
| `POST /api/update` | – | `git pull --ff-only`: `{ ok, updated, commits, output, needsInstall, needsRestart }`; nur localhost + gleicher Origin | `no-store` |

Status: `400` bei ungültigen Parametern, `429` bei Rate-Limit (mit `Retry-After`), `503`, wenn die Wiki-API nicht erreichbar ist und keine zwischengespeicherten Daten vorliegen. Typen: `src/lib/market/types.ts`.

## Tests

```bash
npm test                 # 85 Unit-/Integrationstests
npm run build && npm run test:e2e   # 12 E2E-Tests (Desktop + Mobile)
```

- **Unit:** Steuer (Grenzen, Cap, Rundung, Ausnahmen), Profit-Rechner (inkl. Extremwerte, fehlende Eingaben, Kapital), FIFO/Teilverkäufe/Überverkauf, Portfolio ohne Doppelzählung, Datenqualität, Risiko, Scanner/Ranking/Filter/Sortierung, konservative Marge, Strategien, Indikatoren, Anomalien, Kategorien, Suche, Rate-Limit.
- **Integration:** Parser gegen das verifizierte API-Format, Wiki-Client (User-Agent, Retry/Backoff, 429/Retry-After, Timeout, kein Retry bei 4xx, ungültiges JSON), Cache (TTL, In-flight-Deduplizierung, Stale-on-Error, Cooldown), Marktservice (24h-Aggregation, Caching, API-Ausfall), IndexedDB-Export/Import mit Validierung (fake-indexeddb), Einstellungen.
- **E2E:** die 10 geforderten Nutzerabläufe plus API-Validierung, Sicherheits-Header und ein Mobile-Durchlauf. Die Testdaten sind synthetisch (`tests/fixtures/synthetic-market.ts`) und klar von echten Marktdaten getrennt.

> Playwright nutzt die installierten Chromium-Browser. Auf einem neuen Rechner einmalig `npx playwright install chromium` ausführen.

## Deployment

Empfohlen: **Vercel** (keine Datenbank, keine Secrets nötig). Kurzfassung:

1. Repository zu GitHub/GitLab pushen.
2. In Vercel „New Project“ wählen und importieren. Das Framework (Next.js) wird automatisch erkannt.
3. Environment Variable `WIKI_USER_AGENT` setzen, z. B. `osrs-ge-flipper - contact: deine@mail.ch`.
4. Deploy. Danach prüfen: `/api/health` antwortet mit `{"ok":true,"source":"wiki"}`.

Alternativ läuft die App auf jeder Node-Plattform mit `npm run build && npm start` (Render, Railway, Fly.io, eigener Server, Docker). Details, Checkliste vor dem Go-Live und Hinweise zu Lizenz und Nutzungsbedingungen: [`docs/04-deployment.md`](docs/04-deployment.md).

## Fehlerbehebung

| Problem | Lösung |
|---|---|
| „Marktdaten nicht verfügbar“ | Ist `prices.runescape.wiki` vom Server aus erreichbar? `curl -A "test" https://prices.runescape.wiki/api/v2/osrs/latest?id=4151`. Hinter einem Proxy Node mit `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21) und gesetztem `HTTPS_PROXY` starten. |
| HTTP 403 von der Wiki-API | User-Agent fehlt oder ist generisch. `WIKI_USER_AGENT` setzen. |
| Gelbes Banner „zwischengespeicherte Marktdaten“ | Die Wiki-API ist vorübergehend nicht erreichbar. Die App zeigt die letzten Daten mit Alter an und versucht es automatisch erneut. |
| 24h-Historie „x/24“ | Nach einem Kaltstart werden 23 Stundenblöcke nachgeladen (wenige Sekunden). Werte werden danach vollständig. |
| „Zugriff erneuern“ oben rechts | Chrome/Edge verlangen nach einem Neustart eine Bestätigung für den Datenordner. Anklicken und „Bei jedem Besuch erlauben“ wählen. |
| Ordner-Speicherung nicht verfügbar | Nur Chrome, Edge, Brave, Opera (File System Access API). In Firefox/Safari bleibt der Browser-Speicher + Export. |
| Persönliche Daten weg | Browserdaten wurden gelöscht oder der private Modus wurde genutzt. Regelmässig unter Einstellungen exportieren. |
| E2E-Tests finden keinen Browser | `npx playwright install chromium` |
| Port belegt | `npm start -- -p 3001` |
| „Update app“ fehlt | App über `http://localhost:3000` öffnen (nicht über die LAN-IP), Ordner muss ein Git-Klon sein, `git` muss installiert sein (sonst `GIT_PATH` setzen). |
| Update schlägt fehl („Not possible to fast-forward“) | Lokale Commits weichen vom Remote ab. Im Projektordner manuell `git pull --rebase` oder die Änderungen sichern. |

## Weitere Dokumentation

- [`docs/01-research.md`](docs/01-research.md): verifizierte API-Endpunkte, Datenarten, Steuerregeln (Phase 1)
- [`docs/02-architecture.md`](docs/02-architecture.md): Architektur, Datenmodell, Caching und Aktualisierung
- [`docs/03-methodik.md`](docs/03-methodik.md): Gebührenberechnung, Datenqualität, Risiko, Ranking, Indikatoren, FIFO
- [`docs/04-deployment.md`](docs/04-deployment.md): Deployment-Anleitung und Go-Live-Checkliste
- [`docs/05-limitations.md`](docs/05-limitations.md): Annahmen, Einschränkungen, mögliche Erweiterungen
- In der App: `/methodik` und `/datenschutz`

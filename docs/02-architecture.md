# Architektur, Datenmodell, Caching

## Überblick

```
Browser (React 19, App Router, Client Components)
 ├─ TanStack Query ── GET /api/items (1×/h) · /api/market (alle 60 s) · /api/timeseries (on demand)
 ├─ Zustand-Stores ── Einstellungen (LocalStorage) · persönliche Daten (IndexedDB)
 └─ Reine Berechnungsmodule (lib/analysis, lib/calc, lib/portfolio, lib/tax) – laufen im Browser

Next.js-Server (Node-Runtime, API-Routen)
 ├─ Rate-Limit pro IP (lib/market/rate-limit)
 ├─ MarketService (Singleton) ── TtlCache (TTL, In-flight-Dedupe, Stale-on-Error)
 │     └─ MarketSource (Interface) ── WikiSource → WikiClient (UA, Timeout, Retry/Backoff, Semaphor = 3)
 │                                 └─ FixtureSource (nur MARKET_DATA_SOURCE=fixtures)
 └─ Antworten: gzip, Cache-Control, Fehler ohne interne Details
```

### Trennung der Verantwortlichkeiten

| Bereich | Modul |
|---|---|
| UI & Navigation | `src/app/*`, `src/components/*` |
| Marktdatenservice | `src/lib/market/service.ts`, `sources.ts`, `wiki-client.ts`, `cache.ts` |
| Item-Metadaten & Suche | `/api/items`, `src/lib/search/search.ts`, `hooks/market.ts` (Index einmal pro Laden) |
| Preis- & Gebührenberechnung | `src/lib/tax/*`, `src/lib/calc/profit.ts` |
| Flip-Scanner & Ranking | `src/lib/analysis/scanner.ts` |
| Risiko & Liquidität | `src/lib/analysis/risk.ts` |
| Datenqualität | `src/lib/analysis/quality.ts` |
| Historische Analysen | `src/lib/analysis/indicators.ts`, `market-analysis.ts`, `strategy.ts` |
| Portfolio & Trades | `src/lib/portfolio/*` |
| Lokale Speicherung | `src/lib/storage/*`, `src/state/data.ts`, `src/state/settings.ts` |
| Konfiguration & Fehler | `.env`, `next.config.ts` (Security-Header), `lib/market/http.ts`, `app/error.tsx` |

Neue Datenquellen implementieren `MarketSource` (`sources.ts`) und werden in `server.ts` gewählt. Service, API und UI bleiben unverändert.

## Datenfluss Marktsnapshot

1. `/api/market` ruft `MarketService.getSnapshot()` auf (Snapshot-Cache 20 s).
2. Parallel: `/latest` (60 s), `/5m` (60 s), `/1h` (5 min). Jede Antwort wird mit Zod geprüft. Ungültige Einzeleinträge werden verworfen und gezählt (`meta.invalidEntries`).
3. 24h-Fenster: Aus dem `timestamp` des aktuellen `/1h`-Blocks werden die 23 vorherigen Blöcke über `/1h?timestamp=…` geladen. Abgeschlossene Blöcke sind unveränderlich (Cache 26 h), daher fallen nach dem Kaltstart nur noch 1 bis 2 neue Abrufe pro Stunde an. Der Snapshot wartet höchstens 4 s auf fehlende Blöcke und meldet `day.blocksLoaded/blocksExpected`.
4. `aggregateDay()` berechnet je Item die volumengewichteten 24h-Durchschnitte beider Seiten, das Volumen, aktive und beidseitige Stunden, den Variationskoeffizienten der stündlichen Mittelpreise (letzte 6 h vs. davor), Min/Max, erste/letzte Stunde und den Ø-Spread. Es wird nichts interpoliert.
5. Der Client verknüpft den Snapshot mit den Metadaten und berechnet Scanner, Qualität, Risiko und Ranking lokal (ca. 4'500 Items, < 50 ms).

## Caching & Aktualisierung

| Ebene | Was | Dauer |
|---|---|---|
| Wiki-CDN | alle Endpunkte | `max-age=60` (laut Header) |
| Server (In-Memory) | mapping 6 h · latest 60 s · 5m 60 s · 1h 5 min · Stundenblöcke 26 h · Snapshot 20 s · timeseries 1 min–1 h je Lookback | pro Server-Instanz |
| HTTP (eigene Routen) | `s-maxage` + `stale-while-revalidate` | items 1 h, market 20 s, timeseries 60 s |
| Browser (TanStack Query) | items `staleTime` 1 h · market Refetch 60 s · timeseries 60 s | Sitzung |

- **In-flight-Deduplizierung:** Gleichzeitige Anfragen teilen sich einen Abruf.
- **Stale-on-Error:** Schlägt ein Abruf fehl, liefert der Cache den letzten Wert mit `stale: true` und `error`. Die UI zeigt Banner und Alter an. Neue Versuche folgen frühestens nach 15 s (Cooldown).
- **Begrenzte Parallelität:** höchstens 3 gleichzeitige Wiki-Anfragen (Semaphor).
- **Retry:** Netzwerkfehler, Timeout (12 s, Mapping 20 s), HTTP 5xx und 429 werden bis zu 3-mal mit exponentiellem Backoff und Jitter wiederholt (429 mit `Retry-After`, max. 10 s). Andere 4xx werden nicht wiederholt.
- **Abbruch:** TanStack Query bricht nicht mehr benötigte Requests über `AbortSignal` ab.
- **Kein Abruf pro Tastendruck:** Die Suche läuft vollständig lokal auf den geladenen Metadaten.

## Datenmodell

### Marktdaten (Server → Client)

```ts
ItemMeta   { id, name, examine, members, limit: number|null, value, highalch, icon }
MarketRow  { id, high, highTime, low, lowTime, m5: BlockAgg|null, h1: BlockAgg|null, d1: DayAgg|null }
BlockAgg   { avgHigh|null, avgLow|null, volHigh, volLow }
DayAgg     { avgHigh, avgLow, volHigh, volLow, activeBlocks, bothSidedBlocks, cv, cvRecent, cvPrior,
             minAvg, maxAvg, firstAvg, lastAvg, avgSpread }
MarketSnapshot { meta: { source, generatedAt, latest|fiveMin|oneHour: {fetchedAt, stale, error, blockTimestamp},
                         day: {blocksLoaded, blocksExpected, from, to}, invalidEntries }, rows }
```

### Persönliche Daten (IndexedDB `osrs-ge-flipper`, Version 1)

| Store | Schlüssel | Inhalt |
|---|---|---|
| `trades` | `id` | `Trade { itemId, itemName, lots: Lot[], sales: Sale[], offers: Offer[], notes, history[] }` |
| `capital` | `id` | `CapitalEvent { date, amount (±), kind: deposit/withdrawal/adjustment, note }` |
| `watchlist` | `itemId` | `WatchItem { favorite, note, targetBuy, targetSell, targetMargin, targetRoi }` |
| `alerts` | `id` | `Alert { itemId, kind, side, threshold, enabled, cooldownMinutes, lastTriggeredAt }` |
| `alertEvents` | `id` | ausgelöste Alarme (Index `byAt`) |

- `Lot { date, quantity, price, fees }` = ausgeführter Kauf · `Sale { date, quantity, price, tax|null, fees }` = ausgeführter Verkauf (`tax=null` → nach Regeln berechnet) · `Offer { date, quantity, price }` = offenes Kaufangebot (reserviert Cash).
- Alle Schemas sind in `src/lib/portfolio/schemas.ts` (Zod) definiert und gelten sowohl beim Speichern als auch beim Import.
- **Datenordner (optional):** Über die File System Access API wählt der Nutzer einen Ordner. Das `FileSystemDirectoryHandle` wird im Store `meta` (IndexedDB v2) gemerkt. Solange verbunden, ist `osrs-ge-flipper-daten.json` (Backup-Format, validiert) die Quelle der Wahrheit: Beim Start wird sie geladen, jede Änderung wird nach 400 ms geschrieben (`createWritable` → atomares Ersetzen), zusätzlich `trades.csv` (nur Ausgabe). Ungültige Dateien werden nie überschrieben. Bei abweichenden Daten beim Verbinden entscheidet der Nutzer (Konfliktdialog). Beim Fokussieren des Fensters wird auf externe Änderungen geprüft (z. B. Cloud-Ordner). Code: `src/lib/storage/folder.ts`, `src/state/folder.ts`, `src/components/layout/folder-sync.tsx`.
- **Einstellungen** liegen in LocalStorage (`osrs-ge-flipper:settings:v1`), validiert mit `SettingsSchema`. Bei Defekt werden die Standardwerte verwendet.
- **Backup-Format** (`osrs-ge-flipper-backup`, Version 1): Einstellungen und alle Stores. Der Import prüft Format, Version (neuere werden abgelehnt), Schema und fachliche Konsistenz (FIFO, doppelte IDs) und ersetzt die Daten in einer einzigen Transaktion.

## Sicherheit

- Security-Header über `next.config.ts`: CSP (`default-src 'self'`, Bilder nur von `oldschool.runescape.wiki`, `frame-ancestors 'none'`, `connect-src 'self'`), `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`. HTTPS/HSTS übernimmt der Hoster.
- Alle Query-Parameter werden serverseitig mit Zod validiert. Externe Antworten werden mit Zod geparst und sind nie vertrauenswürdig.
- React escaped alle Ausgaben. `dangerouslySetInnerHTML` wird nur für das statische Theme-Skript genutzt. Der Chart-Tooltip baut HTML aus Seriennamen (können Item-Namen aus der Wiki enthalten) – alle Werte werden HTML-escaped, Farben gegen ein Hex-Muster geprüft.
- Keine Secrets im Frontend, keine Nutzerkonten, kein Tracking, Rate-Limit auf allen API-Routen.
- `npm audit`: 0 bekannte Schwachstellen zum Zeitpunkt der Erstellung.

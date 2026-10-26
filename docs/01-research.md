# Phase 1 – Recherche: Datenquellen, Steuerlogik, Architektur

Stand der Recherche: 24.10.2026. Quellen: siehe Ende des Dokuments.

## 1. OSRS Wiki Real-time Prices API

**Wichtig:** Die Doku beschreibt inzwischen eine **v2** (`/api/v2/osrs`). v1 existiert noch,
kann aber entfernt werden. Wir verwenden ausschliesslich v2.

Seit dem 30.09.2026 stammen die Daten laut Doku von Jagex (alle Clients); davor nur von RuneLite-Nutzern.
Ältere historische Werte haben daher eine kleinere Stichprobe – das wird in der UI vermerkt.

Base-URL: `https://prices.runescape.wiki/api/v2/osrs`

| Endpunkt | Parameter | Inhalt | verifiziert |
|---|---|---|---|
| `/latest` | `id` optional | `{ data: { [id]: { high, highTime, low, lowTime } } }` – letzter Instant-Buy (`high`) bzw. Instant-Sell (`low`) inkl. Unix-Zeit. `null`, wenn nie beobachtet. | ✅ Antwort geprüft |
| `/mapping` | – | `[{ examine, id, members, lowalch, limit, value, highalch, icon, name }]` – `limit` = GE-Kauflimit (4 h), `icon` = Wiki-Dateiname | ✅ laut Doku, Beispielobjekt |
| `/5m` | `timestamp` optional | `{ data: { [id]: { avgHighPrice, highPriceVolume, avgLowPrice, lowPriceVolume } }, timestamp }` – Mittelwerte & Stückzahlen im 5‑min-Block | ✅ Antwort geprüft |
| `/1h` | `timestamp` optional | wie `/5m`, 1‑h-Block | ✅ laut Doku (gleiches Format) |
| `/timeseries` | `id`, `lookback` ∈ `6h, 24h, 7d, 30d, 6m, 1y` | `{ data: [{ timestamp, avgHighPrice, avgLowPrice, highPriceVolume, lowPriceVolume }], itemId, startTimestamp, endTimestamp, timestep }` | ✅ Antwort geprüft (`24h` → 72 Punkte à 300 s) |

Hinweise aus der Doku:

- Es gibt **keinen** `/24h`-Endpunkt in v2.
- Der `timestep` von `/timeseries` ist **nicht garantiert** – wir lesen ihn immer aus der Antwort und zeigen ihn an.
- v2-Durchschnitte haben bis zu 2 Nachkommastellen. Preise können > 2³¹ sein → JS `number` (53 Bit) reicht.
- Werte in `/5m`/`/1h`/`/timeseries` können `null` sein, wenn im Block kein Handel stattfand → wird als Datenlücke behandelt, nie interpoliert.
- **User-Agent** muss beschreibend sein (z. B. `osrs-ge-flipper – <Kontakt>`); Standard-UAs von curl/python-requests werden geblockt.
- Keine festen Rate-Limits; Massenabrufe ohne `id` sind ausdrücklich erwünscht (≈100× ressourcenschonender). Mehrere grosse Anfragen pro Sekunde über längere Zeit können zur Sperre führen.
- Lizenz Wiki-Inhalte: CC BY-NC-SA 3.0 → Quelle in der App nennen, nicht kommerziell nutzen.

### Bedeutung der Werte (für die App verbindlich)

| Begriff in der App | Quelle | Bedeutung |
|---|---|---|
| **Letzter Instant-Buy** | `/latest.high` | Preis, zu dem zuletzt jemand *sofort gekauft* hat (traf ein Verkaufsangebot). Kein Orderbuch! |
| **Letzter Instant-Sell** | `/latest.low` | Preis, zu dem zuletzt jemand *sofort verkauft* hat. |
| **5‑min / 1‑h-Durchschnitt** | `/5m`, `/1h` | Mittelwert ausgeführter Trades im Block, mit Volumen. Historisch, aggregiert. |
| **Geschätzter Einkaufspreis** | abgeleitet | Wir schätzen: Gebot knapp über `low` platzieren (Flip-Konvention). Schätzung. |
| **Geschätzter Verkaufspreis** | abgeleitet | Angebot knapp unter `high`. Schätzung. |

Daraus folgt: Eine "Marge" = `high − low − Steuer(high)` ist **theoretisch**. Ob ein Gebot zu `low` gefüllt wird, ist nicht belegt.

### Aktualisierungs-/Cache-Strategie

| Daten | Server-Cache (TTL) | Begründung |
|---|---|---|
| `/mapping` | 6 h | Metadaten ändern sich selten (Updates mittwochs) |
| `/latest` (bulk) | 60 s | Live-Daten; Wiki cached selbst |
| `/5m` (bulk) | 60 s | neuer Block alle 5 min |
| `/1h` (bulk) | 5 min | neuer Block stündlich |
| `/timeseries` | 60 s (6h/24h) … 1 h (6m/1y) | pro Item, on demand |

Stale-while-error: Bei Fehlern werden zuletzt erfolgreiche Daten mit Alter ausgeliefert, nie erfundene.

## 2. GE-Steuer ("Convenience fee")

| Regel | Wert | Quelle |
|---|---|---|
| Satz | **2 %** des Verkaufspreises (seit 29.05.2025; vorher 1 % seit 09.12.2021) | Wiki GE, Update „Yama CAs & More!“ |
| Wer zahlt | nur der Verkäufer, vom Erlös abgezogen | Wiki GE |
| Berechnung | **pro Stück**, abgerundet: `floor(preis × 0.02)` | Wiki GE (Beispiele 49/50, 99/100) |
| Untergrenze | Preis < 50 gp → Steuer 0 (folgt aus Abrundung) | Wiki GE |
| Obergrenze | max. **5'000'000 gp pro Stück** (greift ab 250'000'000 gp) | Wiki GE |
| Ausnahmen | siehe Liste unten | Wiki GE (Exemption list) |
| Altangebote | Angebote von vor dem 29.05.2025 behalten 1 % – für neue Trades irrelevant | Update-Post |

Ausnahmeliste (laut Wiki-Seite „Grand Exchange“):

- Old school bond
- Energy potion (alle Dosen; Update-Text: „Energy potions have been exempted“)
- Bronze/Iron/Steel arrow, Bronze/Iron/Steel dart, Mind rune
- Bass, Bread, Cake, Cooked chicken, Cooked meat, Herring, Lobster, Mackerel, Meat pie, Pike, Salmon, Shrimps, Tuna
- Teleport-Tabletten: Ardougne, Camelot, Civitas illa fortis, Falador, Kourend castle, Lumbridge, Varrock, Teleport to house; Games necklace(8); Ring of dueling(8)
- Werkzeuge: Chisel, Gardening trowel, Glassblowing pipe, Hammer, Needle, Pestle and mortar, Rake, Saw, Secateurs, Seed dibber, Shears, Spade, Watering can

**Unsicherheiten (dokumentiert, in der UI markiert):**

- Alle 48 Einträge wurden am 24.10.2026 gegen `/mapping` auf Item-IDs aufgelöst und als **ID-Liste** in `src/lib/tax/rules.ts` hinterlegt (Namen nur zur Dokumentation). Die Civitas-Tablette heisst im Mapping „Civitas illa fortis teleport“ (ID 28824).
- Gefüllte Watering-can-Varianten sind nicht GE-handelbar (nicht im Mapping) → keine Unsicherheit für Flips.
- Die Wiki-Liste ist die einzige vollständige Quelle; das Update-Posting nennt nur Beispiele („such as“). Neue Ausnahmen durch künftige Updates müssen manuell nachgetragen werden – die App zeigt Stand und Quelle der Regeln an.

## 3. Weitere Spielregeln

- GE-Kauflimit gilt pro 4 Stunden (`mapping.limit`). Fehlt `limit`, zeigen wir „Nicht verfügbar“ und rechnen nicht mit einem Limit.
- GE-Slots: 8 (Members), 3 (F2P) – für Planungswarnungen.

## 4. Architektur (Entscheidung)

Siehe `docs/02-architecture.md`.

## Quellen

- https://oldschool.runescape.wiki/w/RuneScape:Real-time_Prices
- https://prices.runescape.wiki/api/v2/osrs/latest?id=4151, …/5m, …/timeseries?lookback=24h&id=4151
- https://oldschool.runescape.wiki/w/Grand_Exchange
- https://oldschool.runescape.wiki/w/Update:Yama_CAs_%26_More!
- https://oldschool.runescape.wiki/w/Energy_potions

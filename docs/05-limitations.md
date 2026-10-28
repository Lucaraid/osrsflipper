# Annahmen, Einschränkungen, Erweiterungen

## Technische Entscheidungen & Annahmen

| Thema | Entscheidung | Begründung |
|---|---|---|
| Next.js 16 statt 15 | 16.4.3 | Next 15 hatte zum Zeitpunkt der Erstellung offene Advisories in einer gebündelten Abhängigkeit (`npm audit`). |
| Zod 4, Vitest 5 | aktuelle Major-Versionen | Ältere Versionen hatten bekannte Schwachstellen. `npm audit` meldet 0 Funde. |
| shadcn/ui | Komponenten im shadcn-Stil, direkt auf Radix UI + CVA | Gleiches Muster wie shadcn, ohne CLI-Abhängigkeit. |
| Native `<select>` | statt Radix Select | Barrierearm, mobil besser bedienbar, weniger Code. |
| Charts | TradingView Lightweight Charts 5 | Zoom/Pan/Crosshair sind eingebaut, sehr performant. Attribution steht in der Sidebar. |
| Pagination statt Virtualisierung | 50–60 Zeilen pro Seite | Einfach, robust, schnell genug bei ca. 4'500 Items. Filter und Sortierung laufen im Speicher. |
| Clientseitige Analyse | Scanner, Qualität und Risiko im Browser | Der Server liefert einen kompakten Snapshot. Kapital, Filter und Einstellungen wirken ohne erneuten Serveraufruf. |
| Kategorien | heuristisch nach Item-Namen | Die API liefert keine Kategorien. In der UI ist die Kategorie als „heuristisch“ gekennzeichnet. |
| Offset 1 gp | Über-/Unterbieten der letzten Preise | Übliche Flip-Konvention, einstellbar. |
| 24h-Fenster | 24 abgeschlossene `/1h`-Blöcke | Es gibt in v2 keinen `/24h`-Endpunkt. Die Blöcke sind unveränderlich und daher gut cachebar. |

## Bekannte Einschränkungen (datenbedingt)

- **Keine ausführbaren Preise:** Die API liefert letzte Transaktionen und Durchschnitte, kein Orderbuch. Margen sind Schätzungen. Ob ein Gebot gefüllt wird, ist nicht vorhersagbar.
- **Kauflimits:** `mapping.limit` fehlt bei ca. 520 Items (bei 2 ist es 0). Diese Items gelten als „Limit nicht verfügbar“. Das 4-Stunden-Fenster wird aus den **im Tracker erfassten** Käufen und offenen Angeboten berechnet (`src/lib/portfolio/buy-limit.ts`). Käufe, die nicht erfasst sind, kennt die App nicht; massgebend ist das erfasste Kaufdatum, nicht der genaue Zeitpunkt im Spiel.
- **Historische Stichprobe:** Daten vor dem 30.09.2026 stammen laut Wiki nur von RuneLite-Nutzern.
- **Zeitreihen-Auflösung:** Die Schrittweite von `/timeseries` ist laut Doku nicht garantiert. Sie wird angezeigt und nie angenommen. Beobachtet: 6h/24h → 5 min, 7d → 1 h, 30d → 6 h, 6m/1y → 1 Tag.
- **Steuerausnahmen:** Spiel-Updates können die Liste ändern. Sie ist zentral in `src/lib/tax/rules.ts` gepflegt (Stand 24.10.2026, `verifiedAt`).
- **Alte Angebote mit 1 % Steuer** (vor dem 29.05.2025 eingestellt) werden nicht modelliert. Für neue Trades ist das irrelevant.

## Bewusst nicht implementiert

- **Serverseitige Alarme / Push bei geschlossener Seite:** Dafür wären ein Hintergrundprozess, Speicherung von Push-Subscriptions und damit personenbezogene Serverdaten nötig. Alarme laufen lokal und nur bei geöffnetem Tab. Das steht so auch in der UI.
- **Cloud-Synchronisierung / Konten:** nicht vorhanden. Daten bleiben im Browser, Export/Import als JSON.
- **Simulation (Backtesting) von Strategien:** Ohne Orderbuch und Ausführungsdaten wären die Ergebnisse irreführend. Der Strategie-Vergleich arbeitet nur mit den aktuellen Schätzungen.

## Mögliche Erweiterungen

1. Serverseitige Alarme (Web Push + Cron/Queue), opt-in mit Datenschutzhinweis
2. Persistenter Server-Cache (z. B. Redis/KV) für gemeinsame Caches über Serverless-Instanzen
3. Mehrsprachigkeit (EN)
4. Service Worker für Offline-Nutzung der persönlichen Daten
5. Weitere Datenquellen über das `MarketSource`-Interface

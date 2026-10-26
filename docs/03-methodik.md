# Methodik: Gebühren, Schätzungen, Bewertungen

Alle Formeln sind in `src/lib` implementiert und durch Tests in `tests/unit` abgesichert. Die gleiche Beschreibung ist in der App unter `/methodik` zu finden.

## 1. Datenarten (verbindliche Begriffe)

| Begriff | Quelle | Art |
|---|---|---|
| Letzter Instant-Buy | `/latest.high` + `highTime` | beobachtet: letzter Sofortkauf |
| Letzter Instant-Sell | `/latest.low` + `lowTime` | beobachtet: letzter Sofortverkauf |
| Ø Instant-Buy/-Sell (5 min, 1 h) | `/5m`, `/1h` | historisch, aggregiert, mit Volumen |
| 24h-Aggregat | 24 × `/1h` | historisch, volumengewichtet je Seite |
| Verlauf | `/timeseries` | historisch, aggregiert je Zeitschritt |
| Gesch. Kauf-/Verkaufspreis | abgeleitet | **Schätzung** |
| Gesch. Marktwert offener Stücke | abgeleitet | **Schätzung** |

Es gibt kein öffentliches Orderbuch. Aus letzten Transaktionspreisen werden keine aktuell ausführbaren Preise abgeleitet. Schätzwerte tragen in der UI die Kennzeichnung „gesch.“.

## 2. GE-Steuer (`src/lib/tax`)

- Satz **2 %** (seit 29.05.2025), **pro Stück**, abgerundet: `tax = min(floor(preis × 0.02), 5'000'000)`.
- Rechnung in Basispunkten (`floor(preis × 200 / 10000)`), um Fliesskommafehler zu vermeiden (z. B. 50 × 0.02 = 1.0000000000000002).
- Preise < 50 gp sind dadurch steuerfrei. Ab 250'000'000 gp greift die Obergrenze.
- 48 befreite Items als ID-Liste (`TAX_EXEMPT_ITEMS`), am 24.10.2026 gegen `/mapping` aufgelöst.
- Steuer auf eine Menge = Steuer pro Stück × Menge (nicht auf den Gesamtbetrag).
- Wurde bei einem eigenen Trade die tatsächliche Steuer erfasst, ersetzt sie die berechnete.

Referenzfälle aus den Tests: 49 → 0 · 50 → 1 · 99 → 1 · 100 → 2 · 1'234'567 → 24'691 · 249'999'999 → 4'999'999 · 250'000'000 → 5'000'000 · Bond 9M → 0.

## 3. Profit-Rechner (`src/lib/calc/profit.ts`)

```
Einkauf            = Kaufpreis × Menge
Kapitalbedarf      = Einkauf + sonstige Kosten
Umsatz brutto      = Verkaufspreis × Menge
Steuer             = tatsächliche Steuer ?? taxPerItem(Verkaufspreis) × Menge
Bruttogewinn       = Umsatz − Einkauf
Nettogewinn        = Umsatz − Steuer − Kapitalbedarf
ROI                = Nettogewinn ÷ Kapitalbedarf
Break-even-Preis   = kleinster ganzzahliger Preis p mit p − taxPerItem(p) ≥ Kapitalbedarf ÷ Menge   (binäre Suche; monoton)
Max. Kaufpreis     = floor(Verkaufspreis − Steuer(Verkaufspreis) − Zielgewinn/Stk)
Max. Menge         = min(floor(Kapital ÷ Kaufpreis), GE-Limit)
```

Eingaben werden auf ganze gp abgeschnitten und auf 1 … 2'147'483'647 begrenzt. Fehlende oder ungültige Werte führen zu `ok=false` mit Hinweisen. Unzureichendes Kapital und ein überschrittenes Limit erscheinen als Warnung.

## 4. Scanner-Schätzungen (`src/lib/analysis/scanner.ts`)

- Gesch. Kauf = letzter Instant-Sell + Offset · gesch. Verkauf = letzter Instant-Buy − Offset (Offset einstellbar, Standard 1 gp).
- Nettomarge = Verkauf − Steuer(Verkauf) − Kauf · ROI = Nettomarge ÷ Kauf.
- **Konservative Marge:** Verkauf = min(gesch. Verkauf, Ø Instant-Buy 1h − Offset), Kauf = max(gesch. Kauf, Ø Instant-Sell 1h + Offset). Fehlt der 1h-Block, wird der 24h-Durchschnitt verwendet. So werden Margen erkannt, die nur durch einen einzelnen Ausreisser-Trade entstehen. Der Standardfilter „Nur plausible Margen“ blendet Items mit konservativer Marge ≤ 0 aus.
- Menge = min(⌊Kapital × Allokation ÷ Kauf⌋, Limit). Unbekannte Limits werden nicht angenommen.
- Kapitalanteil = Kapitalbedarf ÷ Kapital · Gewinn @ Kapital = Nettomarge × Menge · Potenzial/Limit = Nettomarge × Limit.

## 5. Datenqualität (0–100, `quality.ts`)

| Komponente | Punkte | Regel |
|---|---|---|
| Aktualität | 30 | je Seite 15: Alter ≤ „frisch“ → 15; ≥ „veraltet“ → 0; dazwischen linear (Grenzen einstellbar, Standard 10/60 min) |
| Beide Seiten | 10 | Instant-Buy und Instant-Sell vorhanden |
| Aktivität 1 h | 15 | Volumen auf beiden (15) / einer (7) / keiner (0) Seite |
| Historie 24 h | 25 | 15 × aktive Stunden/24 + 10 × beidseitige Stunden/24 |
| Plausibilität | 20 | Spread jetzt ÷ Ø-Spread 24h ∈ [⅓, 3] → 20; ∈ [⅙, 6] → 10; sonst 3; ohne Historie 5; Inversion (Sell > Buy) → 0; Mitte > 30 % vom 24h-Mittel entfernt → max. 5 |

Stufen: ≥ 75 hoch · ≥ 50 mittel · ≥ 25 niedrig · darunter unzureichend. Jede Bewertung liefert Hinweistexte, z. B. „Preis zuletzt vor 18 Minuten beobachtet“ oder „Handelsvolumen nicht verfügbar“.

## 6. Risiko (0–100, `risk.ts`)

| Komponente | max | Regel |
|---|---|---|
| Volatilität | 30 | CV der stündlichen Mittelpreise (24 h): 0 % → 0 … ≥ 5 % → 30; unbekannt → 15 |
| Liquidität | 30 | Abdeckung = 24h-Volumen der schwächeren Seite ÷ Menge; ≥ 5× → 0; ≤ 0,5× → 30; dazwischen log. |
| Spread | 20 | (Buy − Sell) ÷ Sell: ≤ 1 % → 0 … ≥ 10 % → 20 |
| Daten | 20 | (100 − Qualität) × 0,2 |

Klassen: < 30 niedrig · < 60 mittel · sonst hoch. Das Risiko ist eine Bewertung der Vergangenheit und keine Prognose.

## 7. Ranking (0–100)

```
score = 100 × Plausibilitätsfaktor × Σ (Gewicht × Faktor)
Plausibilitätsfaktor = 0,5 + 0,5 × Plausibilität/20
```

| Faktor | Gewicht | Normierung |
|---|---|---|
| Gewinn @ Kapital (min(letzt, konservativ)) | 30 % | log₁₀(1+Gewinn)/7 |
| ROI (min(letzt, konservativ)) | 10 % | ROI/10 % |
| Liquidität | 20 % | log₁₀(1+Abdeckung)/log₁₀(11) |
| Stabilität | 15 % | 1 − (Volatilitäts- + Spread-Risikopunkte)/50 |
| Datenaktualität | 10 % | Aktualität/30 |
| Datenqualität | 15 % | Qualität/100 |

Ohne positive Nettomarge ist der Score 0. Begründungen (positiv/negativ/neutral) werden pro Item erzeugt. Die Sortierung ist deterministisch (Wert, dann Item-ID). `null` steht immer am Ende.

## 8. Marktindikatoren (Item-Detail, `indicators.ts`)

- Preis je Zeitschritt = Mittelpreis (Ø Buy + Ø Sell)/2, bei nur einer Seite deren Wert.
- Änderung = (letzter − erster Punkt mit Handel)/erster · Volatilität = Standardabweichung der Log-Renditen pro Zeitschritt (nicht annualisiert).
- Mittelwert, Median, Min/Max, Schwankungsbreite = (Max − Min)/Mittel, Abweichung = (letzter − Mittel)/Mittel, Ø-Spread, Volumen, Anteil aktiver Schritte.
- Bei < 10 Punkten mit Handel gibt es keine Volatilität und einen Hinweis „nicht belastbar“. Lücken werden nicht interpoliert und im Chart als Lücken dargestellt.

## 9. Marktanalyse & Anomalien (`market-analysis.ts`)

- Ranglisten nur für Items mit ≥ 12 aktiven Stunden und ≥ 10 Stück/h.
- Anomalien zusätzlich nur bei ≥ 20 aktiven Stunden und ≥ 50 Stück/h. Preisregeln gelten ab einem Mittelpreis von 100 gp und nur, wenn in der letzten Stunde beide Seiten mit ≥ 5 Stück gehandelt wurden.
- Regeln: |Mittel 1h vs. 24h| ≥ 20 % · Volumen 1h ≥ 4× bzw. ≤ 0,1× des Stundenmittels · CV der letzten 6 h ≥ 4× CV davor (und ≥ 2 %) · Mitte der letzten Instant-Preise ≥ 25 % vom 24h-Mittel.
- Die Schwellen wurden am 24.10.2026 an der realen Verteilung kalibriert (ca. 1–3 % der liquiden Items je Regel). Eine Anomalie ist kein Beleg für Manipulation.

## 10. Strategie-Vergleich (`strategy.ts`)

Alle Strategien setzen voraus: positive Marge (letzte und konservative), Qualität ≥ 60, Plausibilität ≥ 10 und Abdeckung ≥ 1×. Das Kapital wird gleichmässig auf die Top-N-Items verteilt (N = GE-Slots), begrenzt durch die Limits. Gewinne werden konservativ gerechnet. Es wird keine Vergangenheit simuliert.

## 11. Trades, FIFO & Portfolio (`portfolio/*`)

- Chargen und Verkäufe werden chronologisch sortiert. Jeder Verkauf verbraucht die ältesten offenen Chargen, die vor dem Verkaufsdatum gekauft wurden.
- Einstand pro Stück = (Preis × Menge + Gebühren) ÷ Menge.
- Realisiert = Netto-Erlös × gedeckter Anteil − FIFO-Einstand. Überverkauf und Verkauf vor Kauf sind Fehler: Der Store speichert solche Trades nicht, und der Import lehnt sie ab.
- Haltedauer = mengengewichteter Abstand Kauf → Verkauf.
- Portfolio: `Cash = Σ Kapital − Σ Käufe + Σ Netto-Erlöse` · `Verfügbar = Cash − Reserviert (offene Angebote)` · `Gebunden = Σ offener Einstand` · `Marktwert (gesch.) = Σ offene Menge × (letzter Instant-Sell − Steuer)` (ohne Preis zum Einstand) · `Gesamtwert = Cash + Marktwert`.
- Invariante (getestet): `Gesamtwert = Σ Kapital + Realisiert + Unrealisiert`.
- Kapitalverlauf: ausschliesslich aus Transaktionen (Buchwert = Cash + Einstand), ohne Marktpreisschätzung.

## 12. Top 10 Käufe (`top.ts`)

- Basis: Scanner-Kandidaten mit Kapital pro Flip (Standard: Gesamtkapital ÷ GE-Slots).
- Voraussetzungen: positive Marge (letzte Beobachtung **und** mit Ø-Preisen der letzten Stunde), Datenqualität ≥ 60, Plausibilität ≥ 10, keine veralteten Preise.
- **Volumen 24 h** (schwächere Seite, weil Kauf und Verkauf gefüllt werden müssen): ≥ Mindeststückzahl (Standard 500) und ≥ x-fache empfohlene Menge (Standard 10×). Reicht das Volumen nicht für die volle Menge, wird sie auf ⌊Volumen ÷ x⌋ reduziert.
- Gewinn = Menge × min(Marge letzte Beobachtung, Marge mit Ø-Preisen). Sortierung: Ranking (Standard), Gewinn pro Flip oder ROI; Tiebreaker Gewinn, dann Item-ID.

### High Value (Tab auf derselben Seite)

- Gleiche Kriterien, aber: Kapital pro Trade = gesamtes Kapital (statt ÷ GE-Slots), Volumen ≥ 20 Stück und ≥ 3× Menge (Standard), **Gewinn pro Trade ≥ 2'000'000 gp** (konservativ, nach Steuer; einstellbar). Sortierung Standard: höchster Gewinn.
- „Trade“ = ein Kauf bis zum GE-Limit (4 h) bzw. bis zur durch Kapital/Volumen begrenzten Menge.
- Erreichen weniger als 10 Items den Mindestgewinn, werden bis zu 5 Items „knapp darunter“ separat angezeigt.
- Beobachtung am 26.10.2026: Mit 100M gp pro Trade erreichen nur wenige Items 2M gp konservativen Gewinn; mit 10M gp keines.

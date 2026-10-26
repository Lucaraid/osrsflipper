import type { Metadata } from "next";
import { RANK_WEIGHTS } from "@/lib/analysis/scanner";
import { ANOMALY_RULES, MIN_ACTIVE_BLOCKS, MIN_HOURLY_VOLUME } from "@/lib/analysis/market-analysis";
import { TAX_RULES } from "@/lib/tax/rules";

export const metadata: Metadata = { title: "Methodik" };

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-1.5 mt-6 text-base font-semibold">{children}</h2>;
}

export default function MethodikPage() {
  const w = RANK_WEIGHTS;
  return (
    <article className="max-w-3xl text-sm leading-relaxed text-muted [&_b]:text-text [&_li]:mb-1 [&_table]:my-2 [&_td]:border-b [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:text-text [&_ul]:list-disc [&_ul]:pl-5">
      <h1 className="text-lg font-semibold text-text">Methodik & Transparenz</h1>
      <p className="mt-1">So berechnet OSRS GE Flipper seine Kennzahlen. Alle Formeln sind im Quellcode unter <code>src/lib</code> nachvollziehbar und durch automatisierte Tests abgesichert.</p>

      <H>Datenquelle</H>
      <ul>
        <li><b>OSRS Wiki Real-time Prices API v2</b> (<code>prices.runescape.wiki/api/v2/osrs</code>): <code>/mapping</code> (Metadaten, Limits), <code>/latest</code> (letzte Instant-Buy/-Sell-Beobachtung), <code>/5m</code> und <code>/1h</code> (Durchschnitte & Volumen je Block), <code>/timeseries</code> (Verlauf: 6h, 24h, 7d, 30d, 6m, 1y).</li>
        <li>Seit dem 30.09.2026 stammen die Daten laut Wiki von Jagex (alle Clients), davor nur von RuneLite-Nutzern. Ältere Historie basiert daher auf einer kleineren Stichprobe.</li>
        <li>Es gibt <b>kein öffentliches Orderbuch</b>. „Instant-Buy“ ist der letzte Preis, zu dem jemand sofort gekauft hat; „Instant-Sell“ der letzte Preis eines Sofortverkaufs. Daraus folgt nicht, dass zu diesen Preisen aktuell gehandelt werden kann.</li>
        <li>Caching: Server-Cache (latest/5m 60 s, 1h 5 min, Mapping 6 h, abgeschlossene Stundenblöcke 26 h). Bei API-Ausfällen werden die letzten erfolgreichen Daten mit Altershinweis angezeigt – nie erfundene Werte.</li>
      </ul>

      <H>GE-Steuer</H>
      <p>
        {TAX_RULES.rate * 100} % des Verkaufspreises <b>pro Stück</b>, auf ganze Coins abgerundet (Preise unter 50 gp sind dadurch steuerfrei), höchstens {TAX_RULES.capPerItem.toLocaleString("de-CH")} gp pro Stück. {Object.keys(TAX_RULES.exemptItems).length} Items sind befreit (u. a. Old school bond, Energy potions, einfache Werkzeuge, Teleport-Tabletten). Stand {TAX_RULES.verifiedAt}.
      </p>

      <H>Scanner-Schätzungen</H>
      <ul>
        <li>Gesch. Kaufpreis = letzter Instant-Sell + Offset; gesch. Verkaufspreis = letzter Instant-Buy − Offset (Offset einstellbar, Standard 1 gp).</li>
        <li>Nettomarge = Verkauf − Steuer(Verkauf) − Kauf. ROI = Nettomarge ÷ Kauf.</li>
        <li>Menge = min(⌊Kapital ÷ Kauf⌋, GE-Limit). Nur bekannte Limits werden berücksichtigt; fehlt das Limit, wird „Nicht verfügbar“ angezeigt.</li>
        <li>Gewinn @ Kapital = Nettomarge × Menge. Potenzial pro Limit = Nettomarge × Limit (unabhängig vom Kapital).</li>
      </ul>

      <H>Datenqualität (0–100)</H>
      <table>
        <thead><tr><th>Komponente</th><th>Punkte</th><th>Grundlage</th></tr></thead>
        <tbody>
          <tr><td>Aktualität</td><td>30</td><td>je Preisseite 15; voll bis „frisch“, linear bis 0 bei „veraltet“ (einstellbar)</td></tr>
          <tr><td>Beide Preisseiten</td><td>10</td><td>Instant-Buy und Instant-Sell vorhanden</td></tr>
          <tr><td>Aktivität 1 h</td><td>15</td><td>Volumen auf beiden (15) bzw. einer Seite (7)</td></tr>
          <tr><td>Historie 24 h</td><td>25</td><td>Anteil aktiver Stunden (15) + beidseitiger Stunden (10)</td></tr>
          <tr><td>Plausibilität</td><td>20</td><td>aktueller Spread vs. Ø-Spread 24 h; Inversion und &gt; 30 % Abweichung vom 24h-Mittel werden bestraft</td></tr>
        </tbody>
      </table>

      <H>Risiko (0–100, höher = riskanter)</H>
      <table>
        <thead><tr><th>Komponente</th><th>max.</th><th>Grundlage</th></tr></thead>
        <tbody>
          <tr><td>Volatilität</td><td>30</td><td>Variationskoeffizient der stündlichen Ø-Preise (24 h): 0 % → 0, ≥ 5 % → 30</td></tr>
          <tr><td>Liquidität</td><td>30</td><td>24h-Volumen der schwächeren Seite ÷ geplante Menge: ≥ 5× → 0, ≤ 0,5× → 30 (log.)</td></tr>
          <tr><td>Spread</td><td>20</td><td>(Instant-Buy − Instant-Sell) ÷ Instant-Sell: ≤ 1 % → 0, ≥ 10 % → 20</td></tr>
          <tr><td>Datenqualität</td><td>20</td><td>(100 − Qualität) × 0,2</td></tr>
        </tbody>
      </table>
      <p>Klassen: &lt; 30 niedrig, &lt; 60 mittel, sonst hoch.</p>

      <H>Ranking (0–100)</H>
      <p>Gewichtete Summe normierter Faktoren (je 0–1), multipliziert mit einem <b>Plausibilitätsfaktor</b> von 0,5–1 (aus der Plausibilitätskomponente der Datenqualität). Items ohne positive Nettomarge erhalten 0.</p>
      <p>Gewinn und ROI fliessen <b>konservativ</b> ein: Es zählt jeweils der kleinere Wert aus (a) der Marge der letzten Beobachtung und (b) einer Marge mit Durchschnittspreisen des letzten 1h-Blocks (Verkauf = min(letzter, Ø Instant-Buy), Kauf = max(letzter, Ø Instant-Sell)). So rutschen einzelne Ausreisser-Trades nicht nach oben.</p>
      <table>
        <thead><tr><th>Faktor</th><th>Gewicht</th><th>Normierung</th></tr></thead>
        <tbody>
          <tr><td>Gewinnpotenzial @ Kapital (konservativ)</td><td>{w.profit * 100} %</td><td>log₁₀(1 + Gewinn) ÷ 7 (10M gp → 1)</td></tr>
          <tr><td>ROI (konservativ)</td><td>{w.roi * 100} %</td><td>ROI ÷ 10 % (gedeckelt)</td></tr>
          <tr><td>Liquidität</td><td>{w.liquidity * 100} %</td><td>log₁₀(1 + Abdeckung) ÷ log₁₀(11) (10× → 1)</td></tr>
          <tr><td>Stabilität</td><td>{w.stability * 100} %</td><td>1 − (Volatilitäts- + Spread-Risikopunkte) ÷ 50</td></tr>
          <tr><td>Datenaktualität</td><td>{w.freshness * 100} %</td><td>Aktualitätspunkte ÷ 30</td></tr>
          <tr><td>Datenqualität</td><td>{w.quality * 100} %</td><td>Qualität ÷ 100</td></tr>
        </tbody>
      </table>
      <p>Das Ranking ist eine <b>Entscheidungshilfe</b>, keine Gewinnwahrscheinlichkeit. Die Gründe werden pro Item angezeigt.</p>

      <H>Marktindikatoren (Item-Detail)</H>
      <ul>
        <li>Preis je Zeitschritt = volumengewichtetes Mittel aus Ø-Instant-Buy und Ø-Instant-Sell.</li>
        <li>Preisänderung = (letzter − erster Punkt mit Handel) ÷ erster. Volatilität = Standardabweichung der Log-Renditen (pro Zeitschritt, nicht annualisiert).</li>
        <li>Median, Mittelwert, Min/Max, Schwankungsbreite = (Max − Min) ÷ Mittelwert, Abweichung = (letzter − Mittel) ÷ Mittel.</li>
        <li>Unter 10 Punkten mit Handel gelten Statistiken als nicht belastbar. Lücken werden nie interpoliert.</li>
      </ul>

      <H>Marktanalyse & Anomalien</H>
      <ul>
        <li>Nur Items mit ≥ {MIN_ACTIVE_BLOCKS} aktiven Stunden und ≥ {MIN_HOURLY_VOLUME} Stück/h im Schnitt (24 h).</li>
        <li>Anomalie-Regeln: |Ø 1h vs. Ø 24h| ≥ {ANOMALY_RULES.priceMove * 100} %; Stundenvolumen ≥ {ANOMALY_RULES.activityHigh}× oder ≤ {ANOMALY_RULES.activityLow}× des Durchschnitts; Volatilität der letzten 6 h ≥ {ANOMALY_RULES.volatilityJump}× der vorherigen Stunden; letzte Preise ≥ {ANOMALY_RULES.deviation * 100} % vom 24h-Mittel.</li>
        <li>Eine Anomalie ist kein Beleg für Manipulation.</li>
      </ul>

      <H>Trades, FIFO & Portfolio</H>
      <ul>
        <li>Verkäufe werden nach <b>FIFO</b> den ältesten offenen Kaufchargen zugeordnet; Gebühren einer Charge werden auf ihre Stücke verteilt. Überverkäufe werden abgelehnt.</li>
        <li>Cash = Kapitalbuchungen − Käufe + Netto-Verkaufserlöse. Offene Kaufangebote reservieren Cash, werden aber erst beim Erfassen als Kauf abgezogen (keine Doppelzählung).</li>
        <li>Gesch. Marktwert offener Stücke = Menge × (letzter Instant-Sell − Steuer). Ohne Marktpreis: Bewertung zum Einstand.</li>
      </ul>
    </article>
  );
}

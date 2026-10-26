import type { Metadata } from "next";

export const metadata: Metadata = { title: "Datenschutz" };

export default function DatenschutzPage() {
  return (
    <article className="max-w-3xl space-y-3 text-sm leading-relaxed text-muted [&_b]:text-text [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-text [&_ul]:list-disc [&_ul]:pl-5">
      <h1 className="text-lg font-semibold text-text">Datenschutzerklärung</h1>
      <p>Diese Erklärung beschreibt die tatsächliche Datenverarbeitung von OSRS GE Flipper. Bitte vor der Veröffentlichung um die Angaben des Betreibers (Name, Kontakt) ergänzen.</p>

      <h2>1. Keine Konten, kein Tracking</h2>
      <p>Die Nutzung erfordert keine Registrierung. Es werden keine Analyse-, Werbe- oder Tracking-Dienste und keine Cookies zu Trackingzwecken eingesetzt.</p>

      <h2>2. Lokal im Browser gespeicherte Daten</h2>
      <p>Trades, Kapitalbuchungen, Watchlist, Preisalarme und Einstellungen werden <b>ausschliesslich lokal in deinem Browser</b> (IndexedDB und LocalStorage) gespeichert und nicht an unseren Server übertragen. Du kannst sie jederzeit unter „Einstellungen“ exportieren oder löschen. Beim Löschen der Browserdaten gehen sie verloren.</p>

      <h2>3. Server- und Hosting-Logs</h2>
      <p>Beim Aufruf der Webseite verarbeitet der Hosting-Anbieter technisch notwendige Daten (u. a. IP-Adresse, Zeitpunkt, aufgerufene URL, User-Agent) in Server-Logs, um die Seite auszuliefern und vor Missbrauch zu schützen. Die eigenen API-Routen nutzen die IP-Adresse kurzzeitig im Arbeitsspeicher für ein Rate-Limit (max. 60 Sekunden, keine Speicherung). Art und Dauer der Log-Speicherung richten sich nach dem Hosting-Anbieter.</p>

      <h2>4. Externe Inhalte</h2>
      <ul>
        <li><b>Marktdaten</b> werden serverseitig von der OSRS Wiki API (prices.runescape.wiki) abgerufen; dabei werden keine Daten über dich übermittelt.</li>
        <li><b>Item-Icons</b> werden direkt von oldschool.runescape.wiki geladen. Dabei erhält die Wiki technisch bedingt deine IP-Adresse und den User-Agent.</li>
      </ul>

      <h2>5. Browser-Benachrichtigungen</h2>
      <p>Benachrichtigungen werden nur nach deiner ausdrücklichen Zustimmung im Browser angezeigt und lokal erzeugt.</p>

      <h2>6. Rechtliches</h2>
      <p>Marktdaten: OSRS Wiki, Lizenz CC BY-NC-SA 3.0. Old School RuneScape ist eine Marke von Jagex Ltd. Dieses Projekt ist nicht mit Jagex verbunden. Alle Berechnungen sind Schätzungen ohne Gewähr und keine Finanzberatung.</p>
    </article>
  );
}

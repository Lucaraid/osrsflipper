import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl space-y-3 text-sm leading-relaxed text-muted [&_b]:text-text [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-text [&_ul]:list-disc [&_ul]:pl-5">
      <h1 className="text-2xl font-extrabold text-text">Privacy policy</h1>
      <p>This policy describes how OSRS GE Flipper actually handles data. Please add the operator’s details (name, contact) before publishing.</p>

      <h2>1. No accounts, no tracking</h2>
      <p>No sign-up is needed. No analytics, advertising or tracking services are used, and no tracking cookies are set.</p>

      <h2>2. Data stored locally in your browser</h2>
      <p>Trades, capital entries, watchlist and settings are stored <b>only locally in your browser</b> (IndexedDB and LocalStorage), or in a folder you choose, and are never sent to our server. You can export or delete them at any time under “Settings”. They are lost if you clear your browser data.</p>

      <h2>3. Server and hosting logs</h2>
      <p>When you open the website, the hosting provider processes technically necessary data (e.g. IP address, time, requested URL, user agent) in server logs to deliver the site and protect it from abuse. The app’s own API routes keep the IP address briefly in memory for rate limiting (max 60 seconds, not stored). How long logs are kept depends on the hosting provider.</p>

      <h2>4. External content</h2>
      <ul>
        <li><b>Market data</b> is fetched server-side from the OSRS Wiki API (prices.runescape.wiki); no data about you is sent.</li>
        <li><b>Item icons</b> are loaded directly from oldschool.runescape.wiki. The wiki therefore receives your IP address and user agent.</li>
      </ul>

      <h2>5. Legal</h2>
      <p>Market data: OSRS Wiki, licensed CC BY-NC-SA 3.0. Old School RuneScape is a trademark of Jagex Ltd. This project is not affiliated with Jagex. All calculations are estimates without warranty and are not financial advice.</p>
    </article>
  );
}

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "OSRS GE Flipper", template: "%s · OSRS GE Flipper" },
  description: "Datenbasierter Trading-Assistent für den Old School RuneScape Grand Exchange – Flip-Scanner, Profit-Rechner, Trade-Tracker. Daten: OSRS Wiki Real-time Prices API.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0e1013",
  width: "device-width",
  initialScale: 1,
};

// Setzt das Theme vor dem ersten Rendern (verhindert Aufblitzen)
const themeScript = `try{var t=localStorage.getItem("osrs-ge-flipper:theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de-CH" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}

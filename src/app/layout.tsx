import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "OSRS GE Flipper", template: "%s · OSRS GE Flipper" },
  description: "Data-driven trading assistant for the Old School RuneScape Grand Exchange – flip scanner, profit calculator, trade tracker. Data: OSRS Wiki Real-time Prices API.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#c8b28c",
  width: "device-width",
  initialScale: 1,
};

// Setzt das Theme vor dem ersten Rendern (verhindert Aufblitzen)
const themeScript = `try{var t=localStorage.getItem("osrs-ge-flipper:theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
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

"use client";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DataStatus, FixtureBanner, StaleBanner } from "./data-status";
import { MOBILE_TABS, NAV } from "./nav";
import { SearchCommand } from "./search-command";
import { FolderStatusChip } from "./folder-sync";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 px-1 font-semibold tracking-tight">
      <span className="flex size-6 items-center justify-center rounded bg-accent text-[11px] font-bold text-[#1a1407]">GE</span>
      <span>OSRS GE Flipper</span>
    </Link>
  );
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Hauptnavigation">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-text",
            isActive(pathname, href) && "bg-surface-2 font-medium text-text",
          )}
          aria-current={isActive(pathname, href) ? "page" : undefined}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="min-h-screen">
      <FixtureBanner />
      {/* Desktop-Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-border bg-surface px-3 py-3 md:flex">
        <Logo />
        <div className="mt-5 flex-1 overflow-y-auto">
          <NavList pathname={pathname} />
        </div>
        <div className="space-y-1 border-t border-border pt-3 text-[11px] text-faint">
          <p>
            Daten:{" "}
            <a className="underline hover:text-muted" href="https://oldschool.runescape.wiki/w/RuneScape:Real-time_Prices" target="_blank" rel="noreferrer">
              OSRS Wiki
            </a>{" "}
            (CC BY-NC-SA 3.0)
          </p>
          <p>
            Charts:{" "}
            <a className="underline hover:text-muted" href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noreferrer">
              TradingView Lightweight Charts
            </a>
          </p>
          <p>
            <Link className="underline hover:text-muted" href="/methodik">Methodik</Link> ·{" "}
            <Link className="underline hover:text-muted" href="/datenschutz">Datenschutz</Link>
          </p>
          <p>Kein offizielles Jagex-Produkt.</p>
        </div>
      </aside>

      {/* Mobile-Drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-border bg-surface p-3 animate-fade-in">
            <div className="mb-4 flex items-center justify-between">
              <Logo />
              <button type="button" onClick={() => setDrawer(false)} className="rounded p-1 text-muted" aria-label="Menü schliessen">
                <X className="size-5" />
              </button>
            </div>
            <NavList pathname={pathname} onNavigate={() => setDrawer(false)} />
            <p className="mt-4 text-[11px] text-faint">
              <Link href="/methodik" onClick={() => setDrawer(false)} className="underline">Methodik</Link> ·{" "}
              <Link href="/datenschutz" onClick={() => setDrawer(false)} className="underline">Datenschutz</Link>
            </p>
          </div>
        </div>
      )}

      <div className="md:pl-56">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-border bg-bg/90 px-3 backdrop-blur md:px-5">
          <button type="button" className="rounded p-1 text-muted md:hidden" onClick={() => setDrawer(true)} aria-label="Menü öffnen" data-testid="menu-button">
            <Menu className="size-5" />
          </button>
          <div className="flex-1">
            <SearchCommand />
          </div>
          <FolderStatusChip />
          <DataStatus />
        </header>
        <StaleBanner />
        <main className="mx-auto max-w-[1600px] px-3 py-4 pb-20 md:px-5 md:pb-8">{children}</main>
      </div>

      {/* Mobile-Tabbar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface md:hidden" aria-label="Schnellnavigation">
        {MOBILE_TABS.map((href) => {
          const item = NAV.find((n) => n.href === href)!;
          const Icon = item.icon;
          return (
            <Link key={href} href={href} className={cn("flex flex-col items-center gap-0.5 py-1.5 text-[10px] text-muted", isActive(pathname, href) && "text-accent")}>
              <Icon className="size-5" />
              {item.label.replace("Flip ", "").replace("Profit-", "").replace("Flip-", "").replace(" Käufe", "")}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

"use client";
import { Menu, Moon, Sun, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSettings, useSettingsStore } from "@/state/settings";
import { DataStatus, FixtureBanner, StaleBanner } from "./data-status";
import { MOBILE_TABS, NAV, NAV_TONES } from "./nav";
import { SearchCommand } from "./search-command";
import { FolderStatusChip } from "./folder-sync";
import { WordleGate } from "./wordle-gate";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-1">
      <span className="coin flex size-9 items-center justify-center rounded-full text-xs font-black">GE</span>
      <span className="leading-tight">
        <span className="block text-base font-extrabold tracking-tight">GE Flipper</span>
        <span className="block text-[11px] font-medium text-muted">Old School RuneScape</span>
      </span>
    </Link>
  );
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Main navigation">
      {NAV.map(({ href, label, icon: Icon, tone }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text",
            isActive(pathname, href) && "bg-surface-2 font-bold text-text shadow-card",
          )}
          aria-current={isActive(pathname, href) ? "page" : undefined}
        >
          <span className={cn("flex size-7 items-center justify-center rounded-lg", NAV_TONES[tone])}>
            <Icon className="size-4" />
          </span>
          {label}
        </Link>
      ))}
    </nav>
  );
}

function ThemeToggle() {
  const theme = useSettings().theme;
  const update = useSettingsStore((s) => s.update);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => update({ theme: next })}
      className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-accent shadow-card hover:bg-surface-2"
      aria-label={next === "light" ? "Light theme" : "Dark theme"}
      title={next === "light" ? "Light theme" : "Dark theme"}
      data-testid="theme-toggle"
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="min-h-screen">
      <FixtureBanner />
      <WordleGate />
      {/* Desktop-Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface px-3 py-4 md:flex">
        <Logo />
        <div className="mt-6 flex-1 overflow-y-auto">
          <NavList pathname={pathname} />
        </div>
        <div className="space-y-1 border-t border-border pt-3 text-[11px] text-faint">
          <p>
            Data:{" "}
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
            <Link className="underline hover:text-muted" href="/methodology">Methodology</Link> ·{" "}
            <Link className="underline hover:text-muted" href="/privacy">Privacy</Link>
          </p>
          <p>Not an official Jagex product.</p>
        </div>
      </aside>

      {/* Mobile-Drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-border bg-surface p-3 shadow-2xl animate-fade-in">
            <div className="mb-4 flex items-center justify-between">
              <Logo />
              <button type="button" onClick={() => setDrawer(false)} className="rounded p-1 text-muted" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            <NavList pathname={pathname} onNavigate={() => setDrawer(false)} />
            <p className="mt-4 text-[11px] text-faint">
              <Link href="/methodology" onClick={() => setDrawer(false)} className="underline">Methodology</Link> ·{" "}
              <Link href="/privacy" onClick={() => setDrawer(false)} className="underline">Privacy</Link>
            </p>
          </div>
        </div>
      )}

      <div className="md:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-[var(--header-bg)] px-3 backdrop-blur md:px-5">
          <button type="button" className="rounded p-1 text-muted md:hidden" onClick={() => setDrawer(true)} aria-label="Open menu" data-testid="menu-button">
            <Menu className="size-5" />
          </button>
          <div className="flex-1">
            <SearchCommand />
          </div>
          <FolderStatusChip />
          <DataStatus />
          <ThemeToggle />
        </header>
        <StaleBanner />
        <main className="mx-auto max-w-[1600px] px-3 py-5 pb-24 md:px-6 md:pb-10">{children}</main>
      </div>

      {/* Mobile-Tabbar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface shadow-card md:hidden" aria-label="Quick navigation">
        {MOBILE_TABS.map((href) => {
          const item = NAV.find((n) => n.href === href)!;
          const Icon = item.icon;
          return (
            <Link key={href} href={href} className={cn("flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium text-muted", isActive(pathname, href) && "font-bold text-accent")}>
              <span className={cn("flex h-7 w-10 items-center justify-center rounded-full", isActive(pathname, href) && NAV_TONES[item.tone])}>
                <Icon className="size-5" />
              </span>
              {item.label.replace("Flip Scanner", "Scanner").replace("Profit Calculator", "Calculator").replace("Flip History", "History").replace(" Buys", "")}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

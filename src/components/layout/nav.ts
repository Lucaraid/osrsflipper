import { Calculator, Eye, History, LayoutDashboard, Radar, Settings, Trophy, Wallet } from "lucide-react";

/** Farbton des Icon-Chips (Klassen müssen statisch sein, damit Tailwind sie findet) */
export const NAV_TONES = {
  gold: "bg-accent-soft text-accent",
  green: "bg-pos-soft text-pos",
  blue: "bg-info-soft text-info",
  violet: "bg-violet-soft text-violet",
  red: "bg-neg-soft text-neg",
  neutral: "bg-surface-3 text-muted",
} as const;

export const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, tone: "gold" },
  { href: "/top", label: "Top 10 Buys", icon: Trophy, tone: "gold" },
  { href: "/scanner", label: "Flip Scanner", icon: Radar, tone: "blue" },
  { href: "/calculator", label: "Profit Calculator", icon: Calculator, tone: "green" },
  { href: "/history", label: "Flip History", icon: History, tone: "violet" },
  { href: "/portfolio", label: "My Portfolio", icon: Wallet, tone: "green" },
  { href: "/watchlist", label: "Watchlist", icon: Eye, tone: "red" },
  { href: "/settings", label: "Settings", icon: Settings, tone: "neutral" },
] as const;

export const MOBILE_TABS = ["/", "/top", "/scanner", "/history", "/calculator"] as const;

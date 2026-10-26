import { BarChart3, Bell, Calculator, Eye, History, LayoutDashboard, Radar, Search, Settings, Trophy, Wallet } from "lucide-react";

export const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/top", label: "Top 10 Käufe", icon: Trophy },
  { href: "/scanner", label: "Flip Scanner", icon: Radar },
  { href: "/items", label: "Item Explorer", icon: Search },
  { href: "/market", label: "Marktanalyse", icon: BarChart3 },
  { href: "/calculator", label: "Profit-Rechner", icon: Calculator },
  { href: "/portfolio", label: "Mein Portfolio", icon: Wallet },
  { href: "/history", label: "Flip-Historie", icon: History },
  { href: "/watchlist", label: "Watchlist", icon: Eye },
  { href: "/alerts", label: "Preisalarme", icon: Bell },
  { href: "/settings", label: "Einstellungen", icon: Settings },
] as const;

export const MOBILE_TABS = ["/", "/top", "/scanner", "/history", "/watchlist"] as const;

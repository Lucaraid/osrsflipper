import { netSellPerItem } from "../tax/tax";
import type { PositionRules } from "../storage/settings-schema";
import { computeFifo, type TradeSummary } from "./fifo";
import type { CapitalEvent, Trade } from "./schemas";

/**
 * Portfolio-Berechnung ohne Doppelzählungen:
 *
 *   Cash             = Σ Kapitalbuchungen − Σ Käufe (inkl. Gebühren) + Σ Netto-Verkaufserlöse
 *   Reserviert       = Σ offene Kaufangebote (Preis × Menge) – Teil des Cash, nur nicht verfügbar
 *   Verfügbar        = Cash − Reserviert
 *   Gebunden         = FIFO-Einstand aller offenen Stücke
 *   Marktwert (gesch.)= Σ offene Stücke × (letzter Instant-Sell − Steuer)  ← konservativer Liquidationswert
 *   Gesamtwert (gesch.)= Cash + Marktwert offener Stücke
 *   Unrealisiert     = Marktwert − Gebunden (nur Positionen mit Marktpreis)
 *
 * Kaufangebote werden erst beim Erfassen als Kauf vom Cash abgezogen; bis dahin nur reserviert.
 */

export interface PriceInfo {
  low: number | null;
  high: number | null;
}

export interface PositionView {
  itemId: number;
  itemName: string;
  openQty: number;
  costBasis: number;
  marketValue: number | null;
  unrealized: number | null;
  share: number | null;
}

export interface PortfolioSummary {
  capitalIn: number;
  cash: number;
  reserved: number;
  available: number;
  bound: number;
  marketValueOpen: number;
  /** Anzahl offener Positionen ohne Marktpreis (zum Einstand bewertet) */
  unpricedPositions: number;
  totalValue: number;
  unrealized: number;
  realized: number;
  roi: number | null;
  openTrades: number;
  closedTrades: number;
  winRate: number | null;
  avgProfitClosed: number | null;
  avgHoldMs: number | null;
  positions: PositionView[];
  summaries: TradeSummary[];
  errors: string[];
}

export function liquidationValuePerItem(itemId: number, price: PriceInfo | null | undefined): number | null {
  if (!price || price.low == null) return null;
  return netSellPerItem(price.low, itemId);
}

export function computePortfolio(
  trades: Trade[],
  events: CapitalEvent[],
  priceOf: (itemId: number) => PriceInfo | null | undefined,
): PortfolioSummary {
  const summaries = trades.map(computeFifo);
  const capitalIn = events.reduce((a, e) => a + e.amount, 0);
  const buyCost = summaries.reduce((a, s) => a + s.totalBuyCost, 0);
  const proceeds = summaries.reduce((a, s) => a + s.proceedsNet, 0);
  const cash = capitalIn - buyCost + proceeds;
  const reserved = summaries.reduce((a, s) => a + s.reservedForOffers, 0);

  const byItem = new Map<number, PositionView>();
  let unpriced = 0;
  summaries.forEach((s, i) => {
    if (s.openQty <= 0) return;
    const t = trades[i] as Trade;
    const p = byItem.get(s.itemId) ?? { itemId: s.itemId, itemName: t.itemName, openQty: 0, costBasis: 0, marketValue: 0, unrealized: 0, share: null };
    p.openQty += s.openQty;
    p.costBasis += s.openCostBasis;
    byItem.set(s.itemId, p);
  });
  for (const p of byItem.values()) {
    const unit = liquidationValuePerItem(p.itemId, priceOf(p.itemId));
    if (unit == null) {
      unpriced++;
      p.marketValue = null;
      p.unrealized = null;
    } else {
      p.marketValue = unit * p.openQty;
      p.unrealized = p.marketValue - p.costBasis;
    }
  }
  const positions = [...byItem.values()];
  const bound = positions.reduce((a, p) => a + p.costBasis, 0);
  // Positionen ohne Marktpreis werden zum Einstand bewertet (keine erfundenen Preise)
  const marketValueOpen = positions.reduce((a, p) => a + (p.marketValue ?? p.costBasis), 0);
  const totalValue = cash + marketValueOpen;
  for (const p of positions) p.share = totalValue > 0 ? (p.marketValue ?? p.costBasis) / totalValue : null;
  positions.sort((a, b) => b.costBasis - a.costBasis || a.itemId - b.itemId);

  const closed = summaries.filter((s) => s.status === "geschlossen");
  const realized = summaries.reduce((a, s) => a + s.realized, 0);
  const soldCost = summaries.reduce((a, s) => a + s.soldCostBasis, 0);
  let holdW = 0, holdQ = 0;
  for (const s of summaries) for (const sale of s.sales) for (const m of sale.matches) { holdW += m.holdMs * m.quantity; holdQ += m.quantity; }

  return {
    capitalIn,
    cash,
    reserved,
    available: cash - reserved,
    bound,
    marketValueOpen,
    unpricedPositions: unpriced,
    totalValue,
    unrealized: positions.reduce((a, p) => a + (p.unrealized ?? 0), 0),
    realized,
    roi: soldCost > 0 ? realized / soldCost : null,
    openTrades: summaries.filter((s) => s.status === "offen" || s.status === "teilweise").length,
    closedTrades: closed.length,
    winRate: closed.length ? closed.filter((s) => s.realized > 0).length / closed.length : null,
    avgProfitClosed: closed.length ? closed.reduce((a, s) => a + s.realized, 0) / closed.length : null,
    avgHoldMs: holdQ > 0 ? holdW / holdQ : null,
    positions,
    summaries,
    errors: summaries.flatMap((s) => s.errors),
  };
}

export interface TimelinePoint {
  time: number;
  cash: number;
  /** Buchwert = Cash + Einstand offener Stücke (ohne Marktpreisschätzung) */
  bookValue: number;
  realizedCum: number;
}

/**
 * Zeitreihe ausschliesslich aus erfassten Transaktionen. Keine Marktpreise → keine Schätzung.
 */
export function computeTimeline(trades: Trade[], events: CapitalEvent[]): TimelinePoint[] {
  type Ev = { time: number; order: number; cash: number; book: number; realized: number };
  const evs: Ev[] = [];
  for (const e of events) evs.push({ time: e.date, order: 0, cash: e.amount, book: e.amount, realized: 0 });
  trades.forEach((t) => {
    const s = computeFifo(t);
    for (const l of t.lots) {
      const cost = l.price * l.quantity + (l.fees ?? 0);
      evs.push({ time: l.date, order: 1, cash: -cost, book: 0, realized: 0 }); // Cash → Bestand, Buchwert unverändert
    }
    for (const r of s.sales) {
      // Buchwert ändert sich um den realisierten Gewinn
      evs.push({ time: r.date, order: 2, cash: r.proceedsNet, book: r.realized, realized: r.realized });
    }
  });
  evs.sort((a, b) => a.time - b.time || a.order - b.order);
  const out: TimelinePoint[] = [];
  let cash = 0, book = 0, realized = 0;
  for (const e of evs) {
    cash += e.cash;
    book += e.book;
    realized += e.realized;
    const last = out[out.length - 1];
    if (last && last.time === e.time) {
      last.cash = cash; last.bookValue = book; last.realizedCum = realized;
    } else out.push({ time: e.time, cash, bookValue: book, realizedCum: realized });
  }
  return out;
}

export interface RuleWarning {
  rule: keyof PositionRules | "geSlots";
  text: string;
}

export function checkPositionRules(p: PortfolioSummary, rules: PositionRules, geSlots: number, offersCount: number): RuleWarning[] {
  const w: RuleWarning[] = [];
  for (const pos of p.positions) {
    if (rules.maxCapitalPerItem != null && pos.costBasis > rules.maxCapitalPerItem)
      w.push({ rule: "maxCapitalPerItem", text: `${pos.itemName}: gebundenes Kapital über dem Maximum pro Item.` });
    if (rules.maxPositionPct != null && pos.share != null && pos.share > rules.maxPositionPct)
      w.push({ rule: "maxPositionPct", text: `${pos.itemName}: ${(pos.share * 100).toFixed(1)} % des Portfolios (Maximum ${(rules.maxPositionPct * 100).toFixed(0)} %).` });
  }
  if (rules.maxOpenPositions != null && p.positions.length > rules.maxOpenPositions)
    w.push({ rule: "maxOpenPositions", text: `${p.positions.length} offene Positionen (Maximum ${rules.maxOpenPositions}).` });
  if (rules.minReserve != null && p.available < rules.minReserve)
    w.push({ rule: "minReserve", text: `Verfügbares Kapital unter der Mindestreserve.` });
  if (offersCount > geSlots) w.push({ rule: "geSlots", text: `${offersCount} offene Kaufangebote, aber nur ${geSlots} GE-Slots.` });
  return w;
}

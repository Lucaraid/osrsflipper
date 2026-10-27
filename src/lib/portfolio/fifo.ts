import { taxTotal } from "../tax/tax";
import type { Lot, Sale, Trade } from "./schemas";

/**
 * Einstandskosten nach FIFO (First In, First Out):
 * Verkäufe werden chronologisch den ältesten noch offenen Kaufchargen zugeordnet.
 * Gebühren einer Charge werden gleichmässig auf deren Stücke verteilt.
 * Ein Verkauf kann nie mehr Stücke realisieren, als zu diesem Zeitpunkt offen sind
 * (Überverkauf wird als Fehler gemeldet und NICHT als Gewinn gezählt).
 */

export interface SaleMatch {
  lotId: string;
  quantity: number;
  unitCost: number;
  holdMs: number;
}

export interface SaleResult {
  saleId: string;
  date: number;
  quantity: number;
  matchedQuantity: number;
  price: number;
  tax: number;
  taxIsActual: boolean;
  proceedsNet: number;
  costBasis: number;
  realized: number;
  matches: SaleMatch[];
}

export interface OpenLot {
  lotId: string;
  date: number;
  quantity: number;
  unitCost: number;
  price: number;
}

export type TradeStatus = "leer" | "offen" | "teilweise" | "geschlossen";

export interface TradeSummary {
  tradeId: string;
  itemId: number;
  boughtQty: number;
  soldQty: number;
  openQty: number;
  /** Durchschnittlicher Einkaufspreis über alle Chargen (ohne Gebühren) */
  avgBuyPrice: number | null;
  totalBuyCost: number;
  /** FIFO-Einstand der noch offenen Stücke */
  openCostBasis: number;
  /** FIFO-Einstand der verkauften Stücke */
  soldCostBasis: number;
  proceedsNet: number;
  proceedsGross: number;
  taxTotal: number;
  realized: number;
  roi: number | null;
  avgHoldMs: number | null;
  status: TradeStatus;
  firstBuy: number | null;
  lastActivity: number | null;
  sales: SaleResult[];
  openLots: OpenLot[];
  reservedForOffers: number;
  errors: string[];
}

const byDate = <T extends { date: number; id: string }>(a: T, b: T) => a.date - b.date || a.id.localeCompare(b.id);

export function lotUnitCost(l: Lot): number {
  return (l.price * l.quantity + (l.fees ?? 0)) / l.quantity;
}

export function saleTax(s: Sale, itemId: number): { tax: number; actual: boolean } {
  if (s.tax != null) return { tax: s.tax, actual: true };
  return { tax: taxTotal(s.price, s.quantity, itemId), actual: false };
}

export function computeFifo(trade: Trade): TradeSummary {
  const errors: string[] = [];
  const lots = [...trade.lots].sort(byDate);
  const sales = [...trade.sales].sort(byDate);
  const queue = lots.map((l) => ({ lot: l, remaining: l.quantity, unitCost: lotUnitCost(l) }));

  const saleResults: SaleResult[] = [];
  let holdWeighted = 0;
  let holdQty = 0;

  for (const s of sales) {
    let need = s.quantity;
    const matches: SaleMatch[] = [];
    let costBasis = 0;
    for (const q of queue) {
      if (need <= 0) break;
      if (q.remaining <= 0 || q.lot.date > s.date) continue;
      const take = Math.min(need, q.remaining);
      q.remaining -= take;
      need -= take;
      costBasis += take * q.unitCost;
      const hold = s.date - q.lot.date;
      matches.push({ lotId: q.lot.id, quantity: take, unitCost: q.unitCost, holdMs: hold });
      holdWeighted += hold * take;
      holdQty += take;
    }
    const matched = s.quantity - need;
    if (need > 0) {
      errors.push(`Sale on ${new Date(s.date).toISOString().slice(0, 10)}: sold ${need} more than you held at that time.`);
    }
    const { tax, actual } = saleTax(s, trade.itemId);
    // Bei Überverkauf nur den gedeckten Anteil realisieren (anteilige Erlöse, Steuer und Gebühren)
    const share = s.quantity > 0 ? matched / s.quantity : 0;
    const proceedsNet = s.price * s.quantity - tax - (s.fees ?? 0);
    const realized = proceedsNet * share - costBasis;
    saleResults.push({
      saleId: s.id,
      date: s.date,
      quantity: s.quantity,
      matchedQuantity: matched,
      price: s.price,
      tax,
      taxIsActual: actual,
      proceedsNet,
      costBasis,
      realized,
      matches,
    });
  }

  const openLots: OpenLot[] = queue
    .filter((q) => q.remaining > 0)
    .map((q) => ({ lotId: q.lot.id, date: q.lot.date, quantity: q.remaining, unitCost: q.unitCost, price: q.lot.price }));

  const boughtQty = lots.reduce((a, l) => a + l.quantity, 0);
  const soldQty = sales.reduce((a, s) => a + s.quantity, 0);
  const matchedSold = saleResults.reduce((a, s) => a + s.matchedQuantity, 0);
  const openQty = boughtQty - matchedSold;
  const totalBuyCost = lots.reduce((a, l) => a + l.price * l.quantity + (l.fees ?? 0), 0);
  const openCostBasis = openLots.reduce((a, l) => a + l.quantity * l.unitCost, 0);
  const soldCostBasis = saleResults.reduce((a, s) => a + s.costBasis, 0);
  const realized = saleResults.reduce((a, s) => a + s.realized, 0);
  const proceedsNet = saleResults.reduce((a, s) => a + s.proceedsNet, 0);
  const proceedsGross = sales.reduce((a, s) => a + s.price * s.quantity, 0);
  const taxSum = saleResults.reduce((a, s) => a + s.tax, 0);

  let status: TradeStatus = "leer";
  if (boughtQty > 0) status = soldQty === 0 ? "offen" : openQty > 0 ? "teilweise" : "geschlossen";

  const dates = [...lots.map((l) => l.date), ...sales.map((s) => s.date)];
  return {
    tradeId: trade.id,
    itemId: trade.itemId,
    boughtQty,
    soldQty,
    openQty,
    avgBuyPrice: boughtQty > 0 ? lots.reduce((a, l) => a + l.price * l.quantity, 0) / boughtQty : null,
    totalBuyCost,
    openCostBasis,
    soldCostBasis,
    proceedsNet,
    proceedsGross,
    taxTotal: taxSum,
    realized,
    roi: soldCostBasis > 0 ? realized / soldCostBasis : null,
    avgHoldMs: holdQty > 0 ? holdWeighted / holdQty : null,
    status,
    firstBuy: lots[0]?.date ?? null,
    lastActivity: dates.length ? Math.max(...dates) : null,
    sales: saleResults,
    openLots,
    reservedForOffers: trade.offers.reduce((a, o) => a + o.price * o.quantity, 0),
    errors,
  };
}

/**
 * Prüft, ob ein Trade konsistent ist (kein Überverkauf, kein Verkauf vor dem Kauf).
 * Wird vor dem Speichern aufgerufen, damit keine Stückzahl doppelt als Gewinn zählt.
 */
/** In offenen Flips gebundenes Kapital: Summe der FIFO-Einstände aller noch gehaltenen Stücke */
export function investedInOpenFlips(summaries: TradeSummary[]): { invested: number; openFlips: number } {
  const open = summaries.filter((s) => s.openQty > 0);
  return { invested: open.reduce((a, s) => a + s.openCostBasis, 0), openFlips: open.length };
}

export function validateTrade(trade: Trade): string[] {
  return computeFifo(trade).errors;
}

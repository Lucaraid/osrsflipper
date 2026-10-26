import { z } from "zod";

/** Persönliche Daten – lokal im Browser gespeichert (IndexedDB). Alle Zeitangaben in ms (Unix). */

const id = z.string().min(1).max(64);
const ts = z.number().int().nonnegative();
const price = z.number().int().positive().max(2_147_483_647);
const qty = z.number().int().positive().max(2_147_483_647);
const gpAmount = z.number().int().min(0).max(1e13);

export const LotSchema = z.object({ id, date: ts, quantity: qty, price, fees: gpAmount.default(0) });
export type Lot = z.infer<typeof LotSchema>;

export const SaleSchema = z.object({
  id,
  date: ts,
  quantity: qty,
  price,
  /** Tatsächlich bezahlte Steuer (gesamt); null = nach Regeln berechnen */
  tax: gpAmount.nullable().default(null),
  fees: gpAmount.default(0),
});
export type Sale = z.infer<typeof SaleSchema>;

export const OfferSchema = z.object({ id, date: ts, quantity: qty, price });
export type Offer = z.infer<typeof OfferSchema>;

export const HistoryEntrySchema = z.object({ at: ts, action: z.string().max(40), detail: z.string().max(500) });
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export const TradeSchema = z.object({
  id,
  itemId: z.number().int().positive(),
  itemName: z.string().min(1).max(200),
  createdAt: ts,
  updatedAt: ts,
  lots: z.array(LotSchema).max(1000).default([]),
  sales: z.array(SaleSchema).max(1000).default([]),
  offers: z.array(OfferSchema).max(100).default([]),
  notes: z.string().max(2000).default(""),
  history: z.array(HistoryEntrySchema).max(500).default([]),
});
export type Trade = z.infer<typeof TradeSchema>;

export const CapitalEventSchema = z.object({
  id,
  date: ts,
  amount: z.number().int().min(-1e13).max(1e13),
  kind: z.enum(["deposit", "withdrawal", "adjustment"]),
  note: z.string().max(500).default(""),
});
export type CapitalEvent = z.infer<typeof CapitalEventSchema>;

export const WatchItemSchema = z.object({
  itemId: z.number().int().positive(),
  addedAt: ts,
  favorite: z.boolean().default(false),
  note: z.string().max(1000).default(""),
  targetBuy: price.nullable().default(null),
  targetSell: price.nullable().default(null),
  targetMargin: z.number().int().nullable().default(null),
  targetRoi: z.number().min(-1).max(100).nullable().default(null),
});
export type WatchItem = z.infer<typeof WatchItemSchema>;

export const ALERT_KINDS = ["price_below", "price_above", "margin_above", "quality_below"] as const;
export const AlertSchema = z.object({
  id,
  itemId: z.number().int().positive(),
  kind: z.enum(ALERT_KINDS),
  /** Preisseite für Preisalarme */
  side: z.enum(["high", "low"]).default("low"),
  threshold: z.number().finite(),
  enabled: z.boolean().default(true),
  createdAt: ts,
  lastTriggeredAt: ts.nullable().default(null),
  cooldownMinutes: z.number().int().min(1).max(10_080).default(60),
});
export type Alert = z.infer<typeof AlertSchema>;

import { z } from "zod";

/** Scanner-Filter (alle optional; null = kein Filter) */
export const ScannerFiltersSchema = z.object({
  minRoi: z.number().min(-1).max(100).nullable().default(null),
  minProfitPerItem: z.number().nullable().default(null),
  minProfitAtCapital: z.number().nullable().default(null),
  maxCapitalRequired: z.number().positive().nullable().default(null),
  minVolume24h: z.number().nonnegative().nullable().default(null),
  maxDataAgeMinutes: z.number().positive().nullable().default(null),
  category: z.string().max(40).nullable().default(null),
  minLimit: z.number().int().nonnegative().nullable().default(null),
  maxLimit: z.number().int().nonnegative().nullable().default(null),
  maxRisk: z.enum(["niedrig", "mittel", "hoch"]).nullable().default(null),
  minQuality: z.number().min(0).max(100).nullable().default(null),
  membersOnly: z.boolean().nullable().default(null),
  hideNoLimit: z.boolean().default(false),
  /** Nur Items, deren Marge auch mit Durchschnittspreisen (konservativ) positiv ist */
  plausibleOnly: z.boolean().default(true),
  search: z.string().max(100).default(""),
});
export type ScannerFilters = z.infer<typeof ScannerFiltersSchema>;

export const SORT_KEYS = ["score", "netProfit", "roi", "margin", "volume", "potentialLimit", "capital", "risk", "quality"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const PositionRulesSchema = z.object({
  maxCapitalPerItem: z.number().positive().nullable().default(null),
  maxPositionPct: z.number().positive().max(1).nullable().default(null),
  maxOpenPositions: z.number().int().positive().nullable().default(null),
  minReserve: z.number().nonnegative().nullable().default(null),
});
export type PositionRules = z.infer<typeof PositionRulesSchema>;

export const SettingsSchema = z.object({
  version: z.literal(1).default(1),
  theme: z.enum(["dark", "light"]).default("light"),
  defaultCapital: z.number().nonnegative().max(1e13).default(10_000_000),
  /** Über-/Unterbieten in gp gegenüber dem letzten beobachteten Preis */
  priceOffset: z.number().int().min(0).max(1_000_000).default(1),
  geSlots: z.number().int().min(1).max(8).default(8),
  freshness: z
    .object({
      freshMinutes: z.number().positive().max(1440).default(10),
      staleMinutes: z.number().positive().max(10_080).default(60),
    })
    .default({ freshMinutes: 10, staleMinutes: 60 }),
  rules: PositionRulesSchema.default({ maxCapitalPerItem: null, maxPositionPct: null, maxOpenPositions: null, minReserve: null }),
  savedFilters: z
    .array(z.object({ name: z.string().min(1).max(60), filters: ScannerFiltersSchema, sort: z.enum(SORT_KEYS).default("score") }))
    .max(50)
    .default([]),
  scannerSort: z.enum(SORT_KEYS).default("score"),
  /** Einstellungen der Seite „Top 10 Käufe“ */
  top: z
    .object({
      /** Mindest-Handelsvolumen der letzten 24 h auf der SCHWÄCHEREN Seite (Instant-Buy bzw. Instant-Sell), in Stück */
      minVolume24h: z.number().int().nonnegative().max(1e9).default(500),
      /** 24h-Volumen der schwächeren Seite muss mindestens dieses Vielfache der empfohlenen Menge sein */
      minCoverage: z.number().min(0).max(1000).default(10),
      /** Kapital pro Flip; null = Gesamtkapital ÷ GE-Slots */
      capitalPerFlip: z.number().positive().max(1e13).nullable().default(null),
      sort: z.enum(["score", "profit", "roi"]).default("score"),
      hideHeld: z.boolean().default(false),
    })
    .default({ minVolume24h: 500, minCoverage: 10, capitalPerFlip: null, sort: "score", hideHeld: false }),
  /** „Top 10 High Value“: teure Items mit hohem Gewinn pro Trade */
  highValue: z
    .object({
      /** Mindest-Gewinn pro Trade (konservativ, nach Steuer) */
      minProfit: z.number().nonnegative().max(1e12).default(2_000_000),
      /** Kapital pro Trade; null = gesamtes Kapital */
      capitalPerFlip: z.number().positive().max(1e13).nullable().default(null),
      minVolume24h: z.number().int().nonnegative().max(1e9).default(20),
      minCoverage: z.number().min(0).max(1000).default(3),
      sort: z.enum(["score", "profit", "roi"]).default("profit"),
      hideHeld: z.boolean().default(false),
    })
    .default({ minProfit: 2_000_000, capitalPerFlip: null, minVolume24h: 20, minCoverage: 3, sort: "profit", hideHeld: false }),
  /** Tab „Volatile“: Items, die der 30-Tage-Abgleich aus den Top 10 ausschliesst (manuell prüfen) */
  volatile: z
    .object({
      minVolume24h: z.number().int().nonnegative().max(1e9).default(500),
      minCoverage: z.number().min(0).max(1000).default(10),
      capitalPerFlip: z.number().positive().max(1e13).nullable().default(null),
      sort: z.enum(["score", "profit", "roi"]).default("profit"),
      hideHeld: z.boolean().default(false),
    })
    .default({ minVolume24h: 500, minCoverage: 10, capitalPerFlip: null, sort: "profit", hideHeld: false }),
  notificationsEnabled: z.boolean().default(false),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
export const DEFAULT_FILTERS: ScannerFilters = ScannerFiltersSchema.parse({});

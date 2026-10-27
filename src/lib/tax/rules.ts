/**
 * Zentrale, verifizierte GE-Steuerregeln ("Convenience fee").
 *
 * Quellen (geprüft am 2026-10-24):
 * - https://oldschool.runescape.wiki/w/Grand_Exchange (Abschnitt Convenience fee, Exemption list)
 * - https://oldschool.runescape.wiki/w/Update:Yama_CAs_%26_More! (Satz 1 % → 2 % ab 2025-05-29, Cap bleibt 5M)
 *
 * Regeln:
 * - Der Verkäufer zahlt 2 % des Verkaufspreises PRO STÜCK, auf ganze Coins abgerundet.
 *   Dadurch sind Preise < 50 gp faktisch steuerfrei (floor(49 × 0.02) = 0).
 * - Maximal 5'000'000 gp Steuer pro Stück (greift ab 250'000'000 gp Stückpreis).
 * - Items auf der Ausnahmeliste sind steuerfrei.
 *
 * Die Ausnahmeliste wurde am Stichtag gegen /mapping (API v2) auf Item-IDs aufgelöst.
 * Künftige Spiel-Updates können die Liste ändern → bei Änderungen hier anpassen und
 * TAX_RULES.verifiedAt aktualisieren.
 */

export interface TaxRules {
  /** Steuersatz als Anteil (0.02 = 2 %) */
  rate: number;
  /** Maximale Steuer pro Stück in gp */
  capPerItem: number;
  /** Datum, ab dem der Satz gilt */
  effectiveFrom: string;
  /** Datum der letzten Verifikation der Regeln */
  verifiedAt: string;
  sources: string[];
  /** Steuerbefreite Items: ID → Name (Name nur zur Dokumentation) */
  exemptItems: Readonly<Record<number, string>>;
}

export const TAX_EXEMPT_ITEMS: Readonly<Record<number, string>> = Object.freeze({
  13190: "Old school bond",
  // Energy potions (alle Dosen)
  3008: "Energy potion(4)",
  3010: "Energy potion(3)",
  3012: "Energy potion(2)",
  3014: "Energy potion(1)",
  // Low-level Kampfverbrauchsmaterial
  882: "Bronze arrow",
  884: "Iron arrow",
  886: "Steel arrow",
  806: "Bronze dart",
  807: "Iron dart",
  808: "Steel dart",
  558: "Mind rune",
  // Low-level Essen
  365: "Bass",
  2309: "Bread",
  1891: "Cake",
  2140: "Cooked chicken",
  2142: "Cooked meat",
  347: "Herring",
  379: "Lobster",
  355: "Mackerel",
  2327: "Meat pie",
  351: "Pike",
  329: "Salmon",
  315: "Shrimps",
  361: "Tuna",
  // Teleport-Items
  8011: "Ardougne teleport (tablet)",
  8010: "Camelot teleport (tablet)",
  28824: "Civitas illa fortis teleport",
  8009: "Falador teleport (tablet)",
  28790: "Kourend castle teleport (tablet)",
  8008: "Lumbridge teleport (tablet)",
  8007: "Varrock teleport (tablet)",
  8013: "Teleport to house (tablet)",
  3853: "Games necklace(8)",
  2552: "Ring of dueling(8)",
  // Werkzeuge
  1755: "Chisel",
  5325: "Gardening trowel",
  1785: "Glassblowing pipe",
  2347: "Hammer",
  1733: "Needle",
  233: "Pestle and mortar",
  5341: "Rake",
  8794: "Saw",
  5329: "Secateurs",
  5343: "Seed dibber",
  1735: "Shears",
  952: "Spade",
  5331: "Watering can",
});

export const TAX_RULES: TaxRules = Object.freeze({
  rate: 0.02,
  capPerItem: 5_000_000,
  effectiveFrom: "2025-05-29",
  verifiedAt: "2026-10-24",
  sources: [
    "https://oldschool.runescape.wiki/w/Grand_Exchange",
    "https://oldschool.runescape.wiki/w/Update:Yama_CAs_%26_More!",
  ],
  exemptItems: TAX_EXEMPT_ITEMS,
});

/**
 * Frühere Sätze – nur für historische Verkäufe (z. B. importierte Trades), geprüft am 2026-10-27:
 * - Einführung am 2021-12-09 mit 1 % („All transactions on the Grand Exchange are now subject to a 1% tax.“)
 * - 2025-05-29: 2 % (TAX_RULES); gleichzeitig wurden weitere Items befreit.
 * Für die 1-%-Periode wird die aktuelle Ausnahmeliste verwendet (sie war damals kürzer → für die
 * 2025 neu befreiten Items wird die Steuer leicht unterschätzt). Stichtage gelten ab 00:00 UTC.
 */
export const TAX_INTRODUCED = "2021-12-09";
export const TAX_RULES_1_PERCENT: TaxRules = Object.freeze({ ...TAX_RULES, rate: 0.01, effectiveFrom: TAX_INTRODUCED });
const NO_TAX: TaxRules = Object.freeze({ ...TAX_RULES, rate: 0, effectiveFrom: "" });

/** Steuerregeln, die zum Zeitpunkt eines Verkaufs galten. */
export function taxRulesAt(ms: number): TaxRules {
  if (ms >= Date.parse(TAX_RULES.effectiveFrom)) return TAX_RULES;
  if (ms >= Date.parse(TAX_INTRODUCED)) return TAX_RULES_1_PERCENT;
  return NO_TAX;
}

export function isTaxExempt(itemId: number | null | undefined, rules: TaxRules = TAX_RULES): boolean {
  if (itemId == null) return false;
  return Object.prototype.hasOwnProperty.call(rules.exemptItems, itemId);
}

/**
 * Heuristische Item-Kategorien.
 * Die OSRS Wiki API liefert KEINE Kategorien. Die Zuordnung erfolgt transparent anhand des
 * Item-Namens und wird in der UI als "heuristisch" gekennzeichnet. Fehlzuordnungen sind möglich.
 */

export const CATEGORIES = [
  "Runen",
  "Tränke",
  "Munition",
  "Erze & Barren",
  "Holz",
  "Kräuter",
  "Samen",
  "Essen & Fisch",
  "Rüstung & Waffen",
  "Teleport",
  "Sonstiges",
] as const;
export type Category = (typeof CATEGORIES)[number];

const rules: Array<[Category, RegExp]> = [
  ["Runen", /^(air|water|earth|fire|mind|body|cosmic|chaos|nature|law|death|astral|blood|soul|wrath|sunfire|aether|mist|dust|mud|smoke|steam|lava) rune$/i],
  ["Tränke", /\b(potion|brew|restore|antidote\+*|antifire|anti-venom\+?|antipoison|stamina|serum|mix)\b/i],
  ["Munition", /\b(arrows?|bolts?|darts?|javelins?|knives|knife|thrownaxe|cannonball|chinchompa)\b/i],
  ["Erze & Barren", /\b(ore|bar|coal)\b/i],
  ["Holz", /\blogs?\b|\bplank\b/i],
  ["Samen", /\bseed\b|\bsapling\b/i],
  ["Kräuter", /^grimy |\b(weed|leaf)\b|^(guam|marrentill|tarromin|harralander|ranarr|toadflax|irit|avantoe|kwuarm|snapdragon|cadantine|lantadyme|dwarf weed|torstol)\b/i],
  ["Essen & Fisch", /^(raw |cooked )|\b(shark|manta ray|anglerfish|karambwan|lobster|swordfish|monkfish|tuna|salmon|trout|shrimps|pie|cake|pizza|bread|bass|herring|mackerel|pike|sea turtle|dark crab)\b/i],
  ["Teleport", /teleport|\btablet\b|ring of dueling|games necklace/i],
  ["Rüstung & Waffen", /\b(helm|platebody|platelegs|plateskirt|chestplate|tassets|shield|defender|boots|gloves|cape|scimitar|sword|godsword|bow|crossbow|staff|whip|dagger|mace|axe|halberd|spear|hasta|body|legs|chaps|coif|ring|amulet|necklace|bracelet|claws|maul|blowpipe|wand)\b/i],
];

export function categorize(name: string): Category {
  for (const [cat, re] of rules) if (re.test(name)) return cat;
  return "Sonstiges";
}

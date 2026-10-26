import type { ItemMeta } from "../market/types";

/**
 * Clientseitige Item-Suche über die einmal geladenen Metadaten (keine Anfrage pro Tastendruck).
 * Relevanz: exakte ID > exakter Name > Namensanfang > Wortanfang > Teilstring; dann kürzere Namen, dann ID.
 */

export interface SearchIndexEntry {
  item: ItemMeta;
  norm: string;
}

export function normalize(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "").replace(/\s+/g, " ").trim();
}

export function buildIndex(items: ItemMeta[]): SearchIndexEntry[] {
  return items.map((item) => ({ item, norm: normalize(item.name) }));
}

export function searchItems(index: SearchIndexEntry[], query: string, limit = 20): ItemMeta[] {
  const q = normalize(query);
  if (!q) return [];
  const asId = /^\d+$/.test(q) ? Number(q) : null;
  const scored: Array<{ e: SearchIndexEntry; s: number }> = [];
  for (const e of index) {
    let s = 0;
    if (asId != null && e.item.id === asId) s = 1000;
    else if (e.norm === q) s = 900;
    else if (e.norm.startsWith(q)) s = 700;
    else if (e.norm.includes(` ${q}`) || e.norm.includes(`(${q}`)) s = 500;
    else if (e.norm.includes(q)) s = 300;
    else if (asId != null && String(e.item.id).startsWith(q)) s = 100;
    if (s > 0) scored.push({ e, s });
  }
  scored.sort((a, b) => b.s - a.s || a.e.norm.length - b.e.norm.length || a.e.item.id - b.e.item.id);
  return scored.slice(0, limit).map((x) => x.e.item);
}

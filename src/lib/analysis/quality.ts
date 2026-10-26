import type { MarketRow } from "../market/types";

/**
 * Datenqualitätsmodell (0–100 Punkte). Bewertet NUR die Datengrundlage, nicht die Attraktivität.
 *
 * | Komponente            | Punkte | Grundlage                                                                 |
 * |-----------------------|--------|---------------------------------------------------------------------------|
 * | Aktualität            | 30     | je Preisseite 15; voll bis "frisch", linear bis 0 bei "veraltet"          |
 * | Beide Preisseiten     | 10     | Instant-Buy UND Instant-Sell beobachtet                                   |
 * | Aktivität letzte 1 h  | 15     | Volumen auf beiden Seiten (15) / einer Seite (7)                          |
 * | Historische Tiefe 24 h| 25     | Anteil aktiver Stundenblöcke (15) + Anteil beidseitiger Blöcke (10)        |
 * | Plausibilität Marge   | 20     | aktueller Spread im Verhältnis zum 24h-Durchschnittsspread, keine Inversion|
 */

export interface QualityThresholds {
  freshMinutes: number;
  staleMinutes: number;
}

export type QualityLabel = "hoch" | "mittel" | "niedrig" | "unzureichend";

export interface QualityResult {
  score: number;
  label: QualityLabel;
  freshness: number; // 0..30
  components: { freshness: number; bothSides: number; activity: number; depth: number; plausibility: number };
  notes: string[];
  /** Alter der älteren Preisseite in Sekunden (null wenn keine Seite vorhanden) */
  ageSec: number | null;
}

function sideFreshness(ageSec: number | null, t: QualityThresholds): number {
  if (ageSec == null) return 0;
  const fresh = t.freshMinutes * 60;
  const stale = Math.max(t.staleMinutes * 60, fresh + 1);
  if (ageSec <= fresh) return 15;
  if (ageSec >= stale) return 0;
  return 15 * (1 - (ageSec - fresh) / (stale - fresh));
}

export function qualityLabel(score: number): QualityLabel {
  if (score >= 75) return "hoch";
  if (score >= 50) return "mittel";
  if (score >= 25) return "niedrig";
  return "unzureichend";
}

export function assessQuality(row: MarketRow, nowSec: number, t: QualityThresholds, dayBlocksLoaded = 24): QualityResult {
  const notes: string[] = [];
  const highAge = row.highTime != null ? Math.max(0, nowSec - row.highTime) : null;
  const lowAge = row.lowTime != null ? Math.max(0, nowSec - row.lowTime) : null;
  const ages = [highAge, lowAge].filter((a): a is number => a != null);
  const ageSec = ages.length ? Math.max(...ages) : null;

  const freshness = sideFreshness(highAge, t) + sideFreshness(lowAge, t);
  if (ageSec != null && ageSec > t.staleMinutes * 60) notes.push(`Preis zuletzt vor ${Math.round(ageSec / 60)} Minuten beobachtet (veraltet).`);

  const bothSides = row.high != null && row.low != null ? 10 : 0;
  if (row.high == null) notes.push("Kein Instant-Buy-Preis beobachtet.");
  if (row.low == null) notes.push("Kein Instant-Sell-Preis beobachtet.");

  let activity = 0;
  const h1 = row.h1;
  if (h1) {
    const sides = (h1.volHigh > 0 ? 1 : 0) + (h1.volLow > 0 ? 1 : 0);
    activity = sides === 2 ? 15 : sides === 1 ? 7 : 0;
  }
  if (activity === 0) notes.push("Keine Handelsaktivität in der letzten Stunde erfasst.");

  let depth = 0;
  const d1 = row.d1;
  const expected = Math.max(1, dayBlocksLoaded);
  if (d1) {
    depth = 15 * Math.min(1, d1.activeBlocks / expected) + 10 * Math.min(1, d1.bothSidedBlocks / expected);
    if (d1.activeBlocks < expected / 2) notes.push(`Nur ${d1.activeBlocks} von ${expected} Stunden mit Handel – dünn gehandelt.`);
  } else {
    notes.push("Keine historischen 24h-Daten verfügbar.");
  }
  if (dayBlocksLoaded < 24) notes.push(`Historie unvollständig: ${dayBlocksLoaded}/24 Stundenblöcke geladen.`);

  let plausibility = 0;
  if (row.high != null && row.low != null) {
    const spread = row.high - row.low;
    if (spread < 0) {
      notes.push("Instant-Sell liegt über Instant-Buy (zeitversetzte Beobachtungen) – Marge nicht belastbar.");
    } else if (d1?.avgSpread != null && d1.avgSpread > 0) {
      const ratio = spread / d1.avgSpread;
      if (ratio >= 1 / 3 && ratio <= 3) plausibility = 20;
      else if (ratio >= 1 / 6 && ratio <= 6) plausibility = 10;
      else plausibility = 3;
      if (ratio > 3) notes.push("Aktueller Spread deutlich grösser als im 24h-Durchschnitt – Marge evtl. nicht realisierbar.");
    } else {
      plausibility = 5;
      notes.push("Marge nicht gegen Historie prüfbar.");
    }
    const mid = (row.high + row.low) / 2;
    const ref = d1 ? (d1.avgHigh != null && d1.avgLow != null ? (d1.avgHigh + d1.avgLow) / 2 : (d1.avgHigh ?? d1.avgLow)) : null;
    if (ref != null && ref > 0 && Math.abs(mid / ref - 1) > 0.3) {
      plausibility = Math.min(plausibility, 5);
      notes.push("Letzte Preise weichen > 30 % vom 24h-Durchschnitt ab.");
    }
  }

  const score = Math.round(Math.max(0, Math.min(100, freshness + bothSides + activity + depth + plausibility)));
  return {
    score,
    label: qualityLabel(score),
    freshness,
    components: { freshness, bothSides, activity, depth, plausibility },
    notes,
    ageSec,
  };
}

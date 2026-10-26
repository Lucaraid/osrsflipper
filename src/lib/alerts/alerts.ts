import type { Alert } from "../portfolio/schemas";
import type { MarketRow } from "../market/types";
import { taxPerItem } from "../tax/tax";
import { assessQuality, type QualityThresholds } from "../analysis/quality";

/**
 * Lokal geprüfte Preisalarme. Sie werden NUR ausgewertet, solange die Webseite in einem
 * Browser-Tab geöffnet ist und neue Marktdaten lädt. Es gibt (noch) keine serverseitigen Alarme.
 */

export const ALERT_KIND_LABELS: Record<Alert["kind"], string> = {
  price_below: "Preis fällt unter",
  price_above: "Preis steigt über",
  margin_above: "Gesch. Nettomarge erreicht",
  quality_below: "Datenqualität fällt unter",
};

export interface AlertHit {
  alert: Alert;
  value: number;
  text: string;
}

export function alertValue(alert: Alert, row: MarketRow, nowSec: number, t: QualityThresholds): number | null {
  switch (alert.kind) {
    case "price_below":
    case "price_above":
      return alert.side === "high" ? row.high : row.low;
    case "margin_above": {
      if (row.high == null || row.low == null) return null;
      return row.high - taxPerItem(row.high, row.id) - row.low;
    }
    case "quality_below":
      return assessQuality(row, nowSec, t).score;
  }
}

export function evaluateAlerts(alerts: Alert[], rows: Map<number, MarketRow>, nowMs: number, t: QualityThresholds, names: Map<number, string>): AlertHit[] {
  const hits: AlertHit[] = [];
  const nowSec = nowMs / 1000;
  for (const a of alerts) {
    if (!a.enabled) continue;
    if (a.lastTriggeredAt != null && nowMs - a.lastTriggeredAt < a.cooldownMinutes * 60_000) continue;
    const row = rows.get(a.itemId);
    if (!row) continue;
    const v = alertValue(a, row, nowSec, t);
    if (v == null) continue;
    const hit =
      (a.kind === "price_below" && v < a.threshold) ||
      (a.kind === "price_above" && v > a.threshold) ||
      (a.kind === "margin_above" && v >= a.threshold) ||
      (a.kind === "quality_below" && v < a.threshold);
    if (hit) {
      const name = names.get(a.itemId) ?? `Item ${a.itemId}`;
      hits.push({ alert: a, value: v, text: `${name}: ${ALERT_KIND_LABELS[a.kind]} ${Math.round(a.threshold).toLocaleString("de-CH")} (aktuell ${Math.round(v).toLocaleString("de-CH")})` });
    }
  }
  return hits;
}

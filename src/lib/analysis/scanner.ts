import { isTaxExempt } from "../tax/rules";
import { taxPerItem } from "../tax/tax";
import type { ItemMeta, MarketRow } from "../market/types";
import type { ScannerFilters, SortKey } from "../storage/settings-schema";
import { categorize, type Category } from "./category";
import { assessQuality, type QualityResult, type QualityThresholds } from "./quality";
import { assessRisk, RISK_ORDER, type RiskResult } from "./risk";

/**
 * Flip-Scanner: berechnet pro Item geschätzte Flip-Kennzahlen aus den LETZTEN BEOBACHTETEN
 * Instant-Buy/Instant-Sell-Preisen. Alle "est*"-Werte sind Schätzungen; eine Ausführung zu
 * diesen Preisen ist nicht garantiert (es gibt kein öffentliches Orderbuch).
 *
 * Konvention: Kaufgebot = letzter Instant-Sell + Offset, Verkaufsangebot = letzter Instant-Buy − Offset.
 */

export interface ScannerContext {
  nowSec: number;
  capital: number;
  priceOffset: number;
  thresholds: QualityThresholds;
  dayBlocksLoaded: number;
}

export interface FlipCandidate {
  id: number;
  name: string;
  icon: string;
  members: boolean;
  category: Category;
  limit: number | null;
  latestHigh: number | null;
  latestLow: number | null;
  highTime: number | null;
  lowTime: number | null;
  ageSec: number | null;
  estBuy: number | null;
  estSell: number | null;
  taxPerItem: number | null;
  taxExempt: boolean;
  /** Geschätzte Nettomarge pro Stück nach Steuer */
  netMargin: number | null;
  /** Rohe Marge (estSell − estBuy) vor Steuer */
  margin: number | null;
  roi: number | null;
  /** Stückzahl durch Kapital / durch Limit / effektiv */
  qtyByCapital: number;
  qty: number;
  capitalRequired: number | null;
  capitalShare: number | null;
  profitAtCapital: number | null;
  /**
   * Konservative Nettomarge: Verkauf = min(letzter Instant-Buy, Ø Instant-Buy), Kauf = max(letzter Instant-Sell, Ø Instant-Sell)
   * mit Ø aus dem letzten 1h-Block (sonst 24 h). Schützt das Ranking vor einzelnen Ausreisser-Transaktionen.
   */
  netMarginConservative: number | null;
  roiConservative: number | null;
  profitConservative: number | null;
  potentialPerLimit: number | null;
  vol1h: number | null;
  vol24h: number | null;
  vol24hWeaker: number | null;
  /** Variationskoeffizient der Stundenpreise (24 h) */
  cv24h: number | null;
  quality: QualityResult;
  risk: RiskResult;
  score: number;
  reasons: Reason[];
}

export interface Reason {
  tone: "positive" | "negative" | "neutral";
  text: string;
}

export function buildCandidate(meta: ItemMeta, row: MarketRow, ctx: ScannerContext): FlipCandidate {
  const quality = assessQuality(row, ctx.nowSec, ctx.thresholds, ctx.dayBlocksLoaded);
  const exempt = isTaxExempt(meta.id);

  let estBuy: number | null = null;
  let estSell: number | null = null;
  if (row.high != null && row.low != null) {
    estBuy = row.low + ctx.priceOffset;
    estSell = Math.max(1, row.high - ctx.priceOffset);
  }
  const tax = estSell != null ? taxPerItem(estSell, meta.id) : null;
  const netMargin = estBuy != null && estSell != null && tax != null ? estSell - tax - estBuy : null;
  const margin = estBuy != null && estSell != null ? estSell - estBuy : null;
  const roi = netMargin != null && estBuy != null && estBuy > 0 ? netMargin / estBuy : null;

  const qtyByCapital = estBuy != null && estBuy > 0 ? Math.floor(Math.max(0, ctx.capital) / estBuy) : 0;
  const qty = meta.limit != null ? Math.min(qtyByCapital, meta.limit) : qtyByCapital;
  const capitalRequired = estBuy != null ? qty * estBuy : null;
  const profitAtCapital = netMargin != null ? netMargin * qty : null;
  const potentialPerLimit = netMargin != null && meta.limit != null ? netMargin * meta.limit : null;

  // Konservative Marge mit Durchschnittspreisen (1h, Fallback 24h)
  const refHigh = row.h1?.avgHigh ?? row.d1?.avgHigh ?? null;
  const refLow = row.h1?.avgLow ?? row.d1?.avgLow ?? null;
  let netMarginConservative: number | null = null;
  if (estBuy != null && estSell != null && refHigh != null && refLow != null) {
    const cSell = Math.min(estSell, Math.floor(refHigh) - ctx.priceOffset);
    const cBuy = Math.max(estBuy, Math.ceil(refLow) + ctx.priceOffset);
    netMarginConservative = cSell - taxPerItem(cSell, meta.id) - cBuy;
  }
  const roiConservative = netMarginConservative != null && estBuy != null && estBuy > 0 ? netMarginConservative / estBuy : null;
  const profitConservative = netMarginConservative != null ? netMarginConservative * qty : null;

  const vol1h = row.h1 ? row.h1.volHigh + row.h1.volLow : null;
  const vol24h = row.d1 ? row.d1.volHigh + row.d1.volLow : null;
  const vol24hWeaker = row.d1 ? Math.min(row.d1.volHigh, row.d1.volLow) : null;

  const plannedQty = qty > 0 ? qty : (meta.limit ?? 1);
  const risk = assessRisk(row, plannedQty, quality.score);

  const c: FlipCandidate = {
    id: meta.id,
    name: meta.name,
    icon: meta.icon,
    members: meta.members,
    category: categorize(meta.name),
    limit: meta.limit,
    latestHigh: row.high,
    latestLow: row.low,
    highTime: row.highTime,
    lowTime: row.lowTime,
    ageSec: quality.ageSec,
    estBuy,
    estSell,
    taxPerItem: tax,
    taxExempt: exempt,
    netMargin,
    margin,
    roi,
    qtyByCapital,
    qty,
    capitalRequired,
    capitalShare: capitalRequired != null && ctx.capital > 0 ? capitalRequired / ctx.capital : null,
    profitAtCapital,
    netMarginConservative,
    roiConservative,
    profitConservative,
    potentialPerLimit,
    vol1h,
    vol24h,
    vol24hWeaker,
    cv24h: row.d1?.cv ?? null,
    quality,
    risk,
    score: 0,
    reasons: [],
  };
  const ranked = rankCandidate(c);
  c.score = ranked.score;
  c.reasons = ranked.reasons;
  return c;
}

/**
 * Ranking (0–100). Gewichte – dokumentiert in docs/03-methodik.md und /methodik:
 *  Gewinnpotenzial beim gewählten Kapital 30 %, ROI 10 %, Liquidität 20 %,
 *  Stabilität (Volatilität & Spread) 15 %, Datenaktualität 10 %, Datenqualität 15 %.
 * Gewinn und ROI fliessen KONSERVATIV ein: jeweils der kleinere Wert aus letzter Beobachtung und
 * Durchschnittspreisen. Die Summe wird mit einem Plausibilitätsfaktor (0,5–1) multipliziert.
 * Items ohne positive geschätzte Nettomarge erhalten 0 Punkte.
 * Das Ranking ist eine Entscheidungshilfe, KEINE Gewinnwahrscheinlichkeit.
 */
export const RANK_WEIGHTS = { profit: 0.3, roi: 0.1, liquidity: 0.2, stability: 0.15, freshness: 0.1, quality: 0.15 } as const;

export function rankFactors(c: FlipCandidate) {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const p = c.profitConservative != null && c.profitAtCapital != null ? Math.min(c.profitConservative, c.profitAtCapital) : c.profitAtCapital;
  const r = c.roiConservative != null && c.roi != null ? Math.min(c.roiConservative, c.roi) : c.roi;
  const profit = p != null && p > 0 ? clamp(Math.log10(1 + p) / 7) : 0;
  const roi = r != null && r > 0 ? clamp(r / 0.1) : 0;
  const cov = c.risk.coverage;
  const liquidity = cov != null ? clamp(Math.log10(1 + cov) / Math.log10(11)) : 0;
  // Stabilität: Preisvolatilität (0–30) und Spread-Breite (0–20) aus der Risikobewertung; unbekannte Volatilität zählt halb
  const stability = clamp(1 - (c.risk.components.volatility + c.risk.components.spread) / 50);
  const freshness = clamp(c.quality.freshness / 30);
  const quality = clamp(c.quality.score / 100);
  /** Plausibilitätsfaktor 0,5 – 1 aus der Plausibilitätskomponente der Datenqualität (0–20) */
  const plausibility = 0.5 + 0.5 * clamp(c.quality.components.plausibility / 20);
  return { profit, roi, liquidity, stability, freshness, quality, plausibility };
}

export function rankCandidate(c: FlipCandidate): { score: number; reasons: Reason[] } {
  const reasons: Reason[] = [];
  if (c.netMargin == null) {
    reasons.push({ tone: "negative", text: "Marge nicht berechenbar – Preisseite fehlt." });
    return { score: 0, reasons };
  }
  if (c.netMargin <= 0) {
    reasons.push({ tone: "negative", text: "Keine positive Marge nach GE-Steuer." });
    return { score: 0, reasons };
  }
  const f = rankFactors(c);
  const w = RANK_WEIGHTS;
  const score = Math.round(100 * f.plausibility * (f.profit * w.profit + f.roi * w.roi + f.liquidity * w.liquidity + f.stability * w.stability + f.freshness * w.freshness + f.quality * w.quality));

  if (c.netMarginConservative != null && c.netMarginConservative < c.netMargin * 0.5)
    reasons.push({ tone: "negative", text: `Marge laut Durchschnittspreisen deutlich kleiner (${Math.round(c.netMarginConservative).toLocaleString("de-CH")} gp) – evtl. Ausreisser.` });
  if (c.netMarginConservative == null) reasons.push({ tone: "neutral", text: "Marge nicht gegen Durchschnittspreise prüfbar." });
  if (c.roi != null && c.roi >= 0.03) reasons.push({ tone: "positive", text: `Hoher geschätzter ROI (${(c.roi * 100).toFixed(1)} %).` });
  if (c.profitAtCapital != null && c.profitAtCapital >= 1_000_000) reasons.push({ tone: "positive", text: "Hohes Gewinnpotenzial beim gewählten Kapital." });
  if (c.risk.coverage != null && c.risk.coverage >= 5) reasons.push({ tone: "positive", text: "Hohe historische Liquidität (24h-Volumen ≥ 5× Menge)." });
  if (c.risk.coverage != null && c.risk.coverage < 1) reasons.push({ tone: "negative", text: "Geringe historische Liquidität – Menge evtl. nicht absetzbar." });
  if (c.risk.coverage == null) reasons.push({ tone: "negative", text: "Handelsvolumen nicht verfügbar." });
  if (c.quality.ageSec != null && c.quality.freshness < 15) reasons.push({ tone: "negative", text: "Veraltete Preisbeobachtungen." });
  if (c.risk.components.volatility >= 20) reasons.push({ tone: "negative", text: "Stark schwankender Preis (24 h)." });
  if (c.limit != null && c.qtyByCapital > c.limit) reasons.push({ tone: "neutral", text: `Begrenztes Handelslimit (${c.limit} / 4 h).` });
  if (c.limit == null) reasons.push({ tone: "neutral", text: "Handelslimit nicht verfügbar." });
  if (c.quality.score < 50) reasons.push({ tone: "negative", text: "Geringe Datenqualität." });
  if (c.taxExempt) reasons.push({ tone: "positive", text: "Steuerfreies Item." });
  if (c.qty === 0) reasons.push({ tone: "negative", text: "Kapital reicht nicht für 1 Stück." });
  return { score, reasons };
}

export function buildCandidates(items: ItemMeta[], rows: MarketRow[], ctx: ScannerContext): FlipCandidate[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: FlipCandidate[] = [];
  for (const meta of items) {
    const row = byId.get(meta.id);
    if (!row) continue;
    out.push(buildCandidate(meta, row, ctx));
  }
  return out;
}

export function applyFilters(cands: FlipCandidate[], f: ScannerFilters): FlipCandidate[] {
  const q = f.search.trim().toLowerCase();
  return cands.filter((c) => {
    if (q && !c.name.toLowerCase().includes(q) && String(c.id) !== q) return false;
    if (f.minRoi != null && (c.roi == null || c.roi < f.minRoi)) return false;
    if (f.minProfitPerItem != null && (c.netMargin == null || c.netMargin < f.minProfitPerItem)) return false;
    if (f.minProfitAtCapital != null && (c.profitAtCapital == null || c.profitAtCapital < f.minProfitAtCapital)) return false;
    if (f.maxCapitalRequired != null && (c.estBuy == null || c.estBuy > f.maxCapitalRequired)) return false;
    if (f.minVolume24h != null && (c.vol24h == null || c.vol24h < f.minVolume24h)) return false;
    if (f.maxDataAgeMinutes != null && (c.ageSec == null || c.ageSec > f.maxDataAgeMinutes * 60)) return false;
    if (f.category && c.category !== f.category) return false;
    if (f.hideNoLimit && c.limit == null) return false;
    if (f.plausibleOnly && (c.netMarginConservative == null || c.netMarginConservative <= 0)) return false;
    if (f.minLimit != null && (c.limit == null || c.limit < f.minLimit)) return false;
    if (f.maxLimit != null && (c.limit == null || c.limit > f.maxLimit)) return false;
    if (f.maxRisk && RISK_ORDER[c.risk.riskClass] > RISK_ORDER[f.maxRisk]) return false;
    if (f.minQuality != null && c.quality.score < f.minQuality) return false;
    if (f.membersOnly === true && !c.members) return false;
    if (f.membersOnly === false && c.members) return false;
    return true;
  });
}

/** Deterministische Sortierung: Primärschlüssel, dann Item-ID als Tiebreaker. null-Werte immer zuletzt. */
export function sortCandidates(cands: FlipCandidate[], key: SortKey): FlipCandidate[] {
  const get: Record<SortKey, (c: FlipCandidate) => number | null> = {
    score: (c) => c.score,
    netProfit: (c) => c.profitAtCapital,
    roi: (c) => c.roi,
    margin: (c) => c.netMargin,
    volume: (c) => c.vol24h,
    potentialLimit: (c) => c.potentialPerLimit,
    capital: (c) => (c.estBuy != null ? -c.estBuy : null), // niedrigster Kapitalbedarf (Stückpreis) zuerst
    risk: (c) => -c.risk.score, // niedrigstes Risiko zuerst
    quality: (c) => c.quality.score,
  };
  const fn = get[key];
  return [...cands].sort((a, b) => {
    const va = fn(a);
    const vb = fn(b);
    if (va == null && vb == null) return a.id - b.id;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (vb !== va) return vb - va;
    return a.id - b.id;
  });
}

export const SORT_LABELS: Record<SortKey, string> = {
  score: "Ranking",
  netProfit: "Höchster gesch. Nettogewinn",
  roi: "Höchster ROI",
  margin: "Höchste Marge",
  volume: "Höchstes Handelsvolumen",
  potentialLimit: "Höchstes Potenzial pro Limit",
  capital: "Niedrigster Kapitalbedarf",
  risk: "Niedrigstes Risiko",
  quality: "Höchste Datenqualität",
};

import { isTaxExempt } from "../tax/rules";
import { taxPerItem } from "../tax/tax";
import type { ItemMeta, MarketRow, MonthAgg } from "../market/types";
import type { ScannerFilters, SortKey } from "../storage/settings-schema";
import { categorize, type Category } from "./category";
import { checkHistory, historyExclusion, type HistoryCheck } from "./history-check";
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
  /** 30-Tage-Grundlinie je Item-ID; null/fehlend = (noch) nicht geladen → keine Historienprüfung */
  history?: Record<string, MonthAgg> | null;
}

/** Ab so vielen geladenen Tagen wird die 30-Tage-Grundlinie verwendet. */
export const MIN_HISTORY_DAYS_LOADED = 21;

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
   * Mit 30-Tage-Grundlinie zusätzlich: Bruttomarge ≤ 2 × typischer Tagesspread, abzüglich Trendkosten bei Abwärtstrend.
   */
  netMarginConservative: number | null;
  roiConservative: number | null;
  profitConservative: number | null;
  potentialPerLimit: number | null;
  vol1h: number | null;
  vol24h: number | null;
  vol24hWeaker: number | null;
  /** Volumen der schwächeren Seite für die Mengenplanung: min(24 h, normaler Tag der letzten 30 Tage) */
  volWeakerTypical: number | null;
  /** Variationskoeffizient der Stundenpreise (24 h) */
  cv24h: number | null;
  /** 30-Tage-Grundlinie und Abgleich (null = Grundlinie nicht geladen) */
  hist: MonthAgg | null;
  histCheck: HistoryCheck | null;
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

  const vol24hWeaker = row.d1 ? Math.min(row.d1.volHigh, row.d1.volLow) : null;

  // 30-Tage-Abgleich (nur wenn die Grundlinie geladen ist)
  const hist = ctx.history ? (ctx.history[meta.id] ?? null) : null;
  let histCheck: HistoryCheck | null = null;
  if (ctx.history) {
    const latestMid = row.high != null && row.low != null ? (row.high + row.low) / 2 : null;
    const h1Mid = row.h1?.avgHigh != null && row.h1.avgLow != null ? (row.h1.avgHigh + row.h1.avgLow) / 2 : null;
    const mids = [latestMid, h1Mid].filter((m): m is number => m != null);
    histCheck = checkHistory(hist, {
      mid: mids.length ? Math.max(...mids) : null,
      spread: row.high != null && row.low != null ? row.high - row.low : null,
      buy: estBuy,
      volWeaker24h: vol24hWeaker,
    });
  }

  // Konservative Marge mit Durchschnittspreisen (1h, Fallback 24h), begrenzt durch die 30-Tage-Grundlinie
  const refHigh = row.h1?.avgHigh ?? row.d1?.avgHigh ?? null;
  const refLow = row.h1?.avgLow ?? row.d1?.avgLow ?? null;
  let netMarginConservative: number | null = null;
  if (estBuy != null && estSell != null && refHigh != null && refLow != null) {
    const cBuy = Math.max(estBuy, Math.ceil(refLow) + ctx.priceOffset);
    let cSell = Math.min(estSell, Math.floor(refHigh) - ctx.priceOffset);
    if (histCheck?.marginCap != null) cSell = Math.min(cSell, cBuy + histCheck.marginCap);
    netMarginConservative = cSell - taxPerItem(cSell, meta.id) - cBuy - (histCheck?.driftCost ?? 0);
  }
  const roiConservative = netMarginConservative != null && estBuy != null && estBuy > 0 ? netMarginConservative / estBuy : null;
  const profitConservative = netMarginConservative != null ? netMarginConservative * qty : null;

  const vol1h = row.h1 ? row.h1.volHigh + row.h1.volLow : null;
  const vol24h = row.d1 ? row.d1.volHigh + row.d1.volLow : null;
  const volWeakerTypical = histCheck ? histCheck.volWeakerTypical : vol24hWeaker;

  const plannedQty = qty > 0 ? qty : (meta.limit ?? 1);
  const risk = assessRisk(row, plannedQty, quality.score, histCheck ? { volWeaker: volWeakerTypical, dailyVol: hist?.dailyVol ?? null, flagged: historyExclusion(histCheck) != null } : undefined);

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
    volWeakerTypical,
    cv24h: row.d1?.cv ?? null,
    hist,
    histCheck,
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
 * Ranking (0–100). Gewichte – dokumentiert in docs/03-methodik.md und /methodology:
 *  Gewinnpotenzial beim gewählten Kapital 30 %, ROI 10 %, Liquidität 20 %,
 *  Stabilität (Volatilität & Spread) 15 %, Datenaktualität 10 %, Datenqualität 15 %.
 * Gewinn und ROI fliessen KONSERVATIV ein: jeweils der kleinere Wert aus letzter Beobachtung und
 * Durchschnittspreisen. Die Summe wird mit einem Plausibilitätsfaktor (0,5–1) und, sofern die
 * 30-Tage-Grundlinie geladen ist, mit einem Historienfaktor (0,3–1) multipliziert.
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
  /** Historienfaktor 0,3 – 1: Preisspitze, wiederkehrende Spitzen, Abwärtstrend, Sprunghaftigkeit, wenig Historie */
  const history = c.histCheck?.factor ?? 1;
  return { profit, roi, liquidity, stability, freshness, quality, plausibility, history };
}

export function rankCandidate(c: FlipCandidate): { score: number; reasons: Reason[] } {
  const reasons: Reason[] = [];
  if (c.netMargin == null) {
    reasons.push({ tone: "negative", text: "Margin can’t be calculated – one price side is missing." });
    return { score: 0, reasons };
  }
  if (c.netMargin <= 0) {
    reasons.push({ tone: "negative", text: "No positive margin after GE tax." });
    return { score: 0, reasons };
  }
  const f = rankFactors(c);
  const w = RANK_WEIGHTS;
  const score = Math.round(100 * f.plausibility * f.history * (f.profit * w.profit + f.roi * w.roi + f.liquidity * w.liquidity + f.stability * w.stability + f.freshness * w.freshness + f.quality * w.quality));

  if (c.netMarginConservative != null && c.netMarginConservative < c.netMargin * 0.5)
    reasons.push({ tone: "negative", text: `Margin much smaller with average prices and 30-day history (${Math.round(c.netMarginConservative).toLocaleString("de-CH")} gp) – possibly an outlier.` });
  if (c.netMarginConservative == null) reasons.push({ tone: "neutral", text: "Margin can’t be checked against average prices." });
  if (c.roi != null && c.roi >= 0.03) reasons.push({ tone: "positive", text: `High estimated ROI (${(c.roi * 100).toFixed(1)}%).` });
  if (c.profitAtCapital != null && c.profitAtCapital >= 1_000_000) reasons.push({ tone: "positive", text: "High profit potential with your capital." });
  if (c.risk.coverage != null && c.risk.coverage >= 5) reasons.push({ tone: "positive", text: "High historical liquidity (24h volume ≥ 5× quantity)." });
  if (c.risk.coverage != null && c.risk.coverage < 1) reasons.push({ tone: "negative", text: "Low historical liquidity – quantity may not sell." });
  if (c.risk.coverage == null) reasons.push({ tone: "negative", text: "Trade volume not available." });
  if (c.quality.ageSec != null && c.quality.freshness < 15) reasons.push({ tone: "negative", text: "Stale price observations." });
  if (c.risk.components.volatility >= 20) reasons.push({ tone: "negative", text: "Strongly fluctuating price (24 h)." });
  if (c.limit != null && c.qtyByCapital > c.limit) reasons.push({ tone: "neutral", text: `Limited buy limit (${c.limit} / 4 h).` });
  if (c.limit == null) reasons.push({ tone: "neutral", text: "Buy limit not available." });
  if (c.quality.score < 50) reasons.push({ tone: "negative", text: "Low data quality." });
  reasons.push(...historyReasons(c));
  if (c.taxExempt) reasons.push({ tone: "positive", text: "Tax-free item." });
  if (c.qty === 0) reasons.push({ tone: "negative", text: "Not enough capital for 1 item." });
  return { score, reasons };
}

const signedPct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

/** Begründungen aus dem 30-Tage-Abgleich. */
export function historyReasons(c: FlipCandidate): Reason[] {
  const hc = c.histCheck;
  const h = c.hist;
  if (!hc) return [];
  const out: Reason[] = [];
  if (hc.thin) {
    out.push({ tone: "negative", text: `Little 30-day history (${h?.days ?? 0} of 30 days traded).` });
    return out;
  }
  if (hc.spike && hc.deviation != null) out.push({ tone: "negative", text: `Price spike: ${signedPct(hc.deviation)} vs. its 7-day level – likely to fall back.` });
  else if (hc.recurringSpikes && hc.elevated) out.push({ tone: "negative", text: `Spikes regularly (${h?.spikeDays} spike days in 30) and is above normal right now.` });
  else if (hc.recurringSpikes) out.push({ tone: "neutral", text: `Spikes regularly (${h?.spikeDays} spike days in 30) – check the chart before buying.` });
  if (hc.crash && h?.trend7 != null) out.push({ tone: "negative", text: `Price falling fast (${signedPct(h.trend7)} per day over 7 days).` });
  else if (hc.downtrend && h?.trend7 != null) out.push({ tone: "negative", text: `Downtrend (${signedPct(h.trend7)} per day) – margin reduced by ${hc.driftCost.toLocaleString("de-CH")} gp expected loss while holding.` });
  if (hc.erratic && h?.dailyVol != null) out.push({ tone: "negative", text: `Erratic price (±${(h.dailyVol * 100).toFixed(0)}% day to day).` });
  if (hc.wideSpread && h?.spread != null) out.push({ tone: "negative", text: `Spread unusually wide (normal ≈ ${Math.round(h.spread).toLocaleString("de-CH")} gp) – margin capped.` });
  if (hc.volumeBurst) out.push({ tone: "neutral", text: "Unusually busy trading day – quantity based on a normal day." });
  if (!hc.spike && !hc.recurringSpikes && !hc.downtrend && !hc.erratic && h?.dailyVol != null && h.dailyVol < 0.03 && h.days >= 25)
    out.push({ tone: "positive", text: "Stable over 30 days." });
  return out;
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
  score: "Score",
  netProfit: "Highest est. net profit",
  roi: "Highest ROI",
  margin: "Highest margin",
  volume: "Highest trade volume",
  potentialLimit: "Highest potential per limit",
  capital: "Lowest capital needed",
  risk: "Lowest risk",
  quality: "Highest data quality",
};

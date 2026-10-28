"use client";
import { InfoNote } from "@/components/common/indicators";
import { Tip } from "@/components/ui/tooltip";
import { useHistory } from "@/hooks/market";
import { MIN_HISTORY_DAYS_LOADED, historyReasons, type FlipCandidate } from "@/lib/analysis/scanner";
import { gpShort } from "@/lib/format";
import { cn } from "@/lib/utils";

const signedPct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

/** Hinweis, solange die 30-Tage-Grundlinie lädt oder nicht verfügbar ist. */
export function HistoryStatusNote() {
  const { data, error, isLoading } = useHistory();
  if (isLoading) return <InfoNote>Loading 30-day history… Spike, trend and normal-volume checks start once it’s ready.</InfoNote>;
  if (error && !data) return <InfoNote tone="warn">30-day history unavailable ({error.message}). Only the last-24h checks are applied – spikes and downtrends aren’t filtered.</InfoNote>;
  if (data && data.meta.daysLoaded < MIN_HISTORY_DAYS_LOADED)
    return <InfoNote tone="warn">30-day history is still loading ({data.meta.daysLoaded}/{data.meta.daysExpected} days). Spike, trend and normal-volume checks start at {MIN_HISTORY_DAYS_LOADED} days.</InfoNote>;
  return null;
}

/** Kompakte 30-Tage-Zeile für Karten: Veränderung, Trend, Schwankung, normales Volumen. */
export function HistorySummary({ c, className }: { c: FlipCandidate; className?: string }) {
  const h = c.hist;
  if (!c.histCheck) return null;
  if (!h) return <span className={cn("text-faint", className)}>30 d: no history</span>;
  const reasons = historyReasons(c).filter((r) => r.tone !== "positive");
  const parts = [
    h.change30 != null ? `${signedPct(h.change30)} in 30 d` : null,
    h.trend7 != null ? `trend ${signedPct(h.trend7)}/day` : null,
    h.dailyVol != null ? `±${(h.dailyVol * 100).toFixed(1)}%/day` : null,
    h.volWeaker != null ? `normal vol. ${gpShort(h.volWeaker)}/day` : null,
  ].filter(Boolean);
  return (
    <Tip
      content={
        <div className="space-y-1">
          <div>Median price 30 d: {gpShort(h.median30)} · 7 d: {gpShort(h.median7)} · range {gpShort(h.min)}–{gpShort(h.max)}</div>
          <div>{h.days}/30 days traded · {h.spikeDays} spike days · normal daily spread {gpShort(h.spread)}</div>
          {reasons.map((r) => <div key={r.text} className={r.tone === "negative" ? "text-neg" : "text-muted"}>{r.text}</div>)}
          <div className="text-muted">Daily averages from the OSRS Wiki API, not single trades.</div>
        </div>
      }
    >
      <span className={cn("cursor-help num", className)} data-testid="history-summary">30 d: {parts.join(" · ")}</span>
    </Tip>
  );
}

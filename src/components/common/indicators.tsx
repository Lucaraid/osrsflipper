"use client";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Tip } from "@/components/ui/tooltip";
import { ago, gp, gpCompact, gpShort, NA, pct } from "@/lib/format";
import type { QualityResult } from "@/lib/analysis/quality";
import type { RiskResult } from "@/lib/analysis/risk";
import { cn } from "@/lib/utils";
import { useSettings } from "@/state/settings";

/** Anzeige-Labels (interne Werte bleiben deutsch, damit gespeicherte Daten gültig bleiben) */
export const LEVEL_LABEL: Record<string, string> = { niedrig: "low", mittel: "medium", hoch: "high", unzureichend: "insufficient" };

/** Kennzeichnung für Schätzwerte */
export function Est({ className }: { className?: string }) {
  return (
    <Tip content="Estimate based on the last observed prices. Actual fills are not guaranteed.">
      <span className={cn("ml-0.5 cursor-help align-super text-[9px] font-semibold uppercase tracking-wide text-faint", className)}>est.</span>
    </Tip>
  );
}

export function Gp({ value, short, sign, colored, className }: { value: number | null | undefined; short?: boolean; sign?: boolean; colored?: boolean; className?: string }) {
  const text = short ? gpShort(value, { sign }) : gp(value, { sign, compact: false });
  const compact = short ? null : gpCompact(value);
  const tone = colored && value != null ? (value > 0 ? "text-pos" : value < 0 ? "text-neg" : "") : "";
  return (
    <span className={cn("num", value == null && "text-faint", tone, className)} title={value != null && short ? `${gp(value, { compact: false })} gp` : undefined}>
      {text}
      {compact && <span className="ml-1 text-[0.85em] font-normal text-muted">({compact})</span>}
    </span>
  );
}

export function Pct({ value, sign, colored = true, className }: { value: number | null | undefined; sign?: boolean; colored?: boolean; className?: string }) {
  const tone = colored && value != null ? (value > 0 ? "text-pos" : value < 0 ? "text-neg" : "") : "";
  return <span className={cn("num", value == null && "text-faint", tone, className)}>{pct(value, { sign })}</span>;
}

export function QualityBadge({ q, compact }: { q: QualityResult; compact?: boolean }) {
  const tone = q.label === "hoch" ? "pos" : q.label === "mittel" ? "info" : q.label === "niedrig" ? "warn" : "neg";
  return (
    <Tip
      content={
        <div className="space-y-1">
          <div className="font-medium">Data quality {q.score}/100</div>
          <div className="text-muted">
            Freshness {q.components.freshness.toFixed(0)}/30 · Both sides {q.components.bothSides}/10 · Activity 1h {q.components.activity}/15 · History {q.components.depth.toFixed(0)}/25 · Plausibility {q.components.plausibility}/20
          </div>
          {q.notes.length > 0 && (
            <ul className="list-disc pl-4">
              {q.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      }
    >
      <span className="cursor-help">
        <Badge tone={tone}>{compact ? q.score : `${LEVEL_LABEL[q.label] ?? q.label} · ${q.score}`}</Badge>
      </span>
    </Tip>
  );
}

export function RiskBadge({ r }: { r: RiskResult }) {
  const tone = r.riskClass === "niedrig" ? "pos" : r.riskClass === "mittel" ? "warn" : "neg";
  return (
    <Tip
      content={
        <div>
          <div className="font-medium">Risk {r.score}/100 (historical, rule-based)</div>
          <div className="text-muted">
            Volatility {r.components.volatility.toFixed(0)}/30 · Liquidity {r.components.liquidity.toFixed(0)}/30 · Spread {r.components.spread.toFixed(0)}/20 · Data {r.components.data.toFixed(0)}/20
          </div>
          {r.raisedByHistory && <div className="mt-1 text-neg">Raised to high: flagged by the 30-day check (spike, crash, erratic price or little history).</div>}
          <div className="mt-1 text-muted">Coverage (24h volume ÷ quantity): {r.coverage == null ? NA : `${r.coverage.toFixed(1)}×`}</div>
        </div>
      }
    >
      <span className="cursor-help">
        <Badge tone={tone}>{LEVEL_LABEL[r.riskClass] ?? r.riskClass}</Badge>
      </span>
    </Tip>
  );
}

/** Alter einer Beobachtung mit Farbcode nach konfigurierten Schwellen */
export function Age({ seconds }: { seconds: number | null }) {
  const s = useSettings();
  if (seconds == null) return <span className="text-faint">{NA}</span>;
  const tone = seconds <= s.freshness.freshMinutes * 60 ? "text-muted" : seconds <= s.freshness.staleMinutes * 60 ? "text-warn" : "text-neg";
  return <span className={cn("num", tone)}>{ago(seconds)}</span>;
}

export function Stat({ label, value, sub, hint, tone }: { label: string; value: ReactNode; sub?: ReactNode; hint?: string; tone?: "pos" | "neg" }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-card">
      <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted">
        {hint ? (
          <Tip content={hint}>
            <span className="cursor-help border-b border-dotted border-faint">{label}</span>
          </Tip>
        ) : (
          label
        )}
      </div>
      <div className={cn("mt-0.5 truncate text-xl font-bold num", tone === "pos" && "text-pos", tone === "neg" && "text-neg")}>{value}</div>
      {sub && <div className="truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <Sparkles className="size-6 text-gold" aria-hidden />
      <div className="text-sm font-semibold">{title}</div>
      {children && <div className="max-w-md text-xs text-muted">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-neg/40 bg-neg-soft px-3 py-2 text-xs text-neg">{children}</div>;
}

export function InfoNote({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warn" }) {
  return <div className={cn("rounded-lg border px-3 py-2 text-xs", tone === "warn" ? "border-warn/40 bg-warn-soft text-warn" : "border-info/30 bg-info-soft text-text")}>{children}</div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-surface-3", className)} />;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

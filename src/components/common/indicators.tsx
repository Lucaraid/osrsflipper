"use client";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Tip } from "@/components/ui/tooltip";
import { ago, gp, gpShort, NA, pct } from "@/lib/format";
import type { QualityResult } from "@/lib/analysis/quality";
import type { RiskResult } from "@/lib/analysis/risk";
import { cn } from "@/lib/utils";
import { useSettings } from "@/state/settings";

/** Kennzeichnung für Schätzwerte */
export function Est({ className }: { className?: string }) {
  return (
    <Tip content="Schätzung auf Basis zuletzt beobachteter Preise. Tatsächliche Ausführung nicht garantiert.">
      <span className={cn("ml-0.5 cursor-help align-super text-[9px] font-semibold uppercase tracking-wide text-faint", className)}>gesch.</span>
    </Tip>
  );
}

export function Gp({ value, short, sign, colored, className }: { value: number | null | undefined; short?: boolean; sign?: boolean; colored?: boolean; className?: string }) {
  const text = short ? gpShort(value, { sign }) : gp(value, { sign });
  const tone = colored && value != null ? (value > 0 ? "text-pos" : value < 0 ? "text-neg" : "") : "";
  return (
    <span className={cn("num", value == null && "text-faint", tone, className)} title={value != null && short ? `${gp(value)} gp` : undefined}>
      {text}
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
          <div className="font-medium">Datenqualität {q.score}/100</div>
          <div className="text-muted">
            Aktualität {q.components.freshness.toFixed(0)}/30 · Beide Seiten {q.components.bothSides}/10 · Aktivität 1h {q.components.activity}/15 · Historie {q.components.depth.toFixed(0)}/25 · Plausibilität {q.components.plausibility}/20
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
        <Badge tone={tone}>{compact ? q.score : `${q.label} · ${q.score}`}</Badge>
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
          <div className="font-medium">Risiko {r.score}/100 (historisch, regelbasiert)</div>
          <div className="text-muted">
            Volatilität {r.components.volatility.toFixed(0)}/30 · Liquidität {r.components.liquidity.toFixed(0)}/30 · Spread {r.components.spread.toFixed(0)}/20 · Daten {r.components.data.toFixed(0)}/20
          </div>
          <div className="mt-1 text-muted">Abdeckung (24h-Volumen ÷ Menge): {r.coverage == null ? NA : `${r.coverage.toFixed(1)}×`}</div>
        </div>
      }
    >
      <span className="cursor-help">
        <Badge tone={tone}>{r.riskClass}</Badge>
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
    <div className="min-w-0 rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted">
        {hint ? (
          <Tip content={hint}>
            <span className="cursor-help border-b border-dotted border-faint">{label}</span>
          </Tip>
        ) : (
          label
        )}
      </div>
      <div className={cn("mt-0.5 truncate text-lg font-semibold num", tone === "pos" && "text-pos", tone === "neg" && "text-neg")}>{value}</div>
      {sub && <div className="truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <div className="text-sm font-medium">{title}</div>
      {children && <div className="max-w-md text-xs text-muted">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-neg/40 bg-neg-soft px-3 py-2 text-xs text-neg">{children}</div>;
}

export function InfoNote({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warn" }) {
  return <div className={cn("rounded-md border px-3 py-2 text-xs", tone === "warn" ? "border-warn/40 bg-warn-soft text-warn" : "border-border bg-surface-2 text-muted")}>{children}</div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-surface-3", className)} />;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

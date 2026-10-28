"use client";
import { Calculator } from "lucide-react";
import Link from "next/link";
import { Age, Est, Gp, Pct, QualityBadge, RiskBadge } from "@/components/common/indicators";
import { ItemIcon } from "@/components/common/item-icon";
import { WatchButton } from "@/components/common/watch-button";
import { Badge } from "@/components/ui/badge";
import { Tip } from "@/components/ui/tooltip";
import type { FlipCandidate } from "@/lib/analysis/scanner";
import { gpShort, NA } from "@/lib/format";
import { cn } from "@/lib/utils";

function Reasons({ c }: { c: FlipCandidate }) {
  return (
    <div className="space-y-1">
      <div className="font-medium">Score {c.score}/100 – a decision aid, not a probability of profit</div>
      <ul className="space-y-0.5">
        {c.reasons.map((r) => (
          <li key={r.text} className={cn(r.tone === "positive" && "text-pos", r.tone === "negative" && "text-neg", r.tone === "neutral" && "text-muted")}>
            {r.tone === "positive" ? "+ " : r.tone === "negative" ? "− " : "· "}
            {r.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScoreCell({ c }: { c: FlipCandidate }) {
  return (
    <Tip content={<Reasons c={c} />}>
      <span className="inline-flex cursor-help items-center gap-1.5">
        <span className="h-1.5 w-10 overflow-hidden rounded bg-surface-3">
          <span className="block h-full bg-accent" style={{ width: `${c.score}%` }} />
        </span>
        <span className="num text-xs">{c.score}</span>
      </span>
    </Tip>
  );
}

function calcHref(c: FlipCandidate) {
  const p = new URLSearchParams({ id: String(c.id) });
  if (c.estBuy != null) p.set("buy", String(c.estBuy));
  if (c.estSell != null) p.set("sell", String(c.estSell));
  if (c.qty > 0) p.set("qty", String(c.qty));
  return `/calculator?${p}`;
}

export function ScannerTable({ rows, compact = false }: { rows: FlipCandidate[]; compact?: boolean }) {
  return (
    <>
      {/* Desktop/Tablet: Tabelle */}
      <div className="hidden overflow-x-auto md:block">
        <table className="data-table w-full text-sm" data-testid="scanner-table">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
            <tr className="border-b border-border">
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-2 py-2 text-right font-medium">
                <Tip content="Last observed instant-buy price (someone bought instantly)">
                  <span className="cursor-help">Inst. buy</span>
                </Tip>
              </th>
              <th className="px-2 py-2 text-right font-medium">
                <Tip content="Last observed instant-sell price (someone sold instantly)">
                  <span className="cursor-help">Inst. sell</span>
                </Tip>
              </th>
              {!compact && <th className="px-2 py-2 text-right font-medium">Buy<Est /></th>}
              {!compact && <th className="px-2 py-2 text-right font-medium">Sell<Est /></th>}
              <th className="px-2 py-2 text-right font-medium">
                <Tip content="Estimated net margin per item after 2% GE tax (rounded down, max 5M)">
                  <span className="cursor-help">Net margin<Est /></span>
                </Tip>
              </th>
              <th className="px-2 py-2 text-right font-medium">ROI<Est /></th>
              <th className="px-2 py-2 text-right font-medium">
                <Tip content="Quantity based on capital and GE buy limit (4 h)">
                  <span className="cursor-help">Qty / limit</span>
                </Tip>
              </th>
              {!compact && <th className="px-2 py-2 text-right font-medium">Capital</th>}
              <th className="px-2 py-2 text-right font-medium">Profit @ capital<Est /></th>
              {!compact && <th className="px-2 py-2 text-right font-medium">Pot. / limit<Est /></th>}
              <th className="px-2 py-2 text-right font-medium">
                <Tip content="Items traded (both sides): last hour / last 24 h">
                  <span className="cursor-help">Vol. 1h / 24h</span>
                </Tip>
              </th>
              <th className="px-2 py-2 text-right font-medium">Data age</th>
              <th className="px-2 py-2 font-medium">Risk</th>
              <th className="px-2 py-2 font-medium">Quality</th>
              <th className="px-2 py-2 font-medium">Score</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-border/60 hover:bg-surface-2/60" data-testid="scanner-row">
                <td className="max-w-[240px] px-3 py-1.5">
                  <Link href={`/items/${c.id}`} className="flex items-center gap-2 hover:text-accent">
                    <ItemIcon icon={c.icon} name={c.name} size={20} />
                    <span className="min-w-0">
                      <span className="block truncate">{c.name}</span>
                      <span className="block text-[10px] text-faint">
                        #{c.id}
                        {c.taxExempt && <span className="ml-1 text-pos">tax-free</span>}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-2 py-1.5 text-right"><Gp value={c.latestHigh} /></td>
                <td className="px-2 py-1.5 text-right"><Gp value={c.latestLow} /></td>
                {!compact && <td className="px-2 py-1.5 text-right text-muted"><Gp value={c.estBuy} /></td>}
                {!compact && <td className="px-2 py-1.5 text-right text-muted"><Gp value={c.estSell} /></td>}
                <td className="px-2 py-1.5 text-right">
                  <Tip
                    content={
                      c.taxPerItem != null ? (
                        <div>
                          <div>Tax per item: {c.taxPerItem.toLocaleString("de-CH")} gp</div>
                          <div className="text-muted">Conservative (with 1h average prices): {c.netMarginConservative != null ? `${Math.round(c.netMarginConservative).toLocaleString("de-CH")} gp` : NA}</div>
                        </div>
                      ) : (
                        NA
                      )
                    }
                  >
                    <span><Gp value={c.netMargin} colored /></span>
                  </Tip>
                </td>
                <td className="px-2 py-1.5 text-right"><Pct value={c.roi} /></td>
                <td className="px-2 py-1.5 text-right num">
                  {c.qty.toLocaleString("de-CH")}
                  <span className="text-faint"> / {c.limit != null ? c.limit.toLocaleString("de-CH") : "–"}</span>
                  {c.limitUsed > 0 && c.limitLeft != null && (
                    <span className={cn("block text-[10px]", c.limitLeft === 0 ? "text-neg" : "text-warn")}>{c.limitLeft.toLocaleString("de-CH")} left</span>
                  )}
                </td>
                {!compact && <td className="px-2 py-1.5 text-right"><Gp value={c.capitalRequired} short /></td>}
                <td className="px-2 py-1.5 text-right font-medium"><Gp value={c.profitAtCapital} short colored /></td>
                {!compact && <td className="px-2 py-1.5 text-right"><Gp value={c.potentialPerLimit} short colored /></td>}
                <td className="px-2 py-1.5 text-right num text-muted">
                  {c.vol1h != null ? gpShort(c.vol1h) : "–"} / {c.vol24h != null ? gpShort(c.vol24h) : "–"}
                </td>
                <td className="px-2 py-1.5 text-right text-xs"><Age seconds={c.ageSec} /></td>
                <td className="px-2 py-1.5"><RiskBadge r={c.risk} /></td>
                <td className="px-2 py-1.5"><QualityBadge q={c.quality} compact /></td>
                <td className="px-2 py-1.5"><ScoreCell c={c} /></td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center">
                    <WatchButton itemId={c.id} name={c.name} />
                    <Link href={calcHref(c)} className="rounded p-1 text-faint hover:text-text" aria-label={`Open ${c.name} in calculator`}>
                      <Calculator className="size-4" />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: Karten */}
      <ul className="divide-y divide-border md:hidden" data-testid="scanner-cards">
        {rows.map((c) => (
          <li key={c.id} className="px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Link href={`/items/${c.id}`} className="flex min-w-0 flex-1 items-center gap-2">
                <ItemIcon icon={c.icon} name={c.name} size={22} />
                <span className="truncate font-medium">{c.name}</span>
              </Link>
              <WatchButton itemId={c.id} name={c.name} />
              <ScoreCell c={c} />
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
              <div>
                <div className="text-faint">Net margin<Est /></div>
                <Gp value={c.netMargin} colored />
              </div>
              <div>
                <div className="text-faint">ROI</div>
                <Pct value={c.roi} />
              </div>
              <div>
                <div className="text-faint">Profit @ cap.</div>
                <Gp value={c.profitAtCapital} short colored />
              </div>
              <div>
                <div className="text-faint">Inst. buy / sell</div>
                <span className="num">{gpShort(c.latestHigh)} / {gpShort(c.latestLow)}</span>
              </div>
              <div>
                <div className="text-faint">Qty / limit</div>
                <span className="num">{c.qty.toLocaleString("de-CH")} / {c.limit != null ? c.limit.toLocaleString("de-CH") : "–"}</span>
              </div>
              <div>
                <div className="text-faint">Age</div>
                <Age seconds={c.ageSec} />
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <RiskBadge r={c.risk} />
              <QualityBadge q={c.quality} />
              {c.taxExempt && <Badge tone="pos">tax-free</Badge>}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

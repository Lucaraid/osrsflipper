"use client";
import { useEffect, useMemo, useState } from "react";
import { useCalcStore } from "@/state/calc";
import { Gp, InfoNote, Pct } from "@/components/common/indicators";
import { Button } from "@/components/ui/button";
import { AmountInput, Field } from "@/components/ui/input";
import { Tip } from "@/components/ui/tooltip";
import { calculateFlip, maxBuyPriceForProfit, maxQuantity } from "@/lib/calc/profit";
import { gp } from "@/lib/format";
import { isTaxExempt, TAX_RULES } from "@/lib/tax/rules";
import { cn } from "@/lib/utils";

export interface CalcPrefill {
  buy?: number | null;
  sell?: number | null;
  qty?: number | null;
}

function Row({ label, children, hint, strong }: { label: string; children: React.ReactNode; hint?: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-1", strong && "font-semibold")}>
      <span className="text-muted">
        {hint ? (
          <Tip content={hint}>
            <span className="cursor-help border-b border-dotted border-faint">{label}</span>
          </Tip>
        ) : (
          label
        )}
      </span>
      <span className="text-right">{children}</span>
    </div>
  );
}

/**
 * Profit-Rechner – nutzt ausschliesslich calculateFlip() (zentrale Berechnungsfunktion).
 * `prefill` wird nur beim Mounten übernommen (Eingaben des Nutzers werden nicht überschrieben);
 * für neue Vorbelegung den Parent mit neuem `key` rendern.
 */
export function ProfitCalculator({
  itemId,
  buyLimit,
  prefill,
  marketPrices,
  defaultCapital,
}: {
  itemId: number | null;
  buyLimit: number | null;
  prefill?: CalcPrefill;
  /** Letzte beobachtete Preise zum Übernehmen (Schätzung) */
  marketPrices?: { buy: number | null; sell: number | null };
  defaultCapital: number;
}) {
  const [buy, setBuy] = useState<number | null>(prefill?.buy ?? null);
  const [sell, setSell] = useState<number | null>(prefill?.sell ?? null);
  const [qty, setQty] = useState<number | null>(prefill?.qty ?? (buyLimit ?? 1));
  const [otherCosts, setOtherCosts] = useState<number | null>(null);
  const [actualTax, setActualTax] = useState<number | null>(null);
  const [capital, setCapital] = useState<number | null>(defaultCapital);
  const [target, setTarget] = useState<number | null>(null);

  // Aktuelle Eingaben für „Trade erfassen“ bereitstellen (externer Store, kein lokaler State)
  useEffect(() => {
    if (itemId != null) useCalcStore.getState().set(itemId, { buy, sell, qty });
  }, [itemId, buy, sell, qty]);

  const r = useMemo(
    () => calculateFlip({ itemId, buyPrice: buy, sellPrice: sell, quantity: qty, otherCosts, actualTax, capital, buyLimit }),
    [itemId, buy, sell, qty, otherCosts, actualTax, capital, buyLimit],
  );
  const maxQ = buy != null && capital != null ? maxQuantity(capital, buy, buyLimit) : null;
  const maxBuy = sell != null && target != null ? maxBuyPriceForProfit(sell, target, itemId) : null;
  const exempt = isTaxExempt(itemId);

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="profit-calculator">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Buy price each (gp)">
            <AmountInput value={buy} onChange={setBuy} aria-label="Buy price each" data-testid="calc-buy" />
          </Field>
          <Field label="Sell price each (gp)">
            <AmountInput value={sell} onChange={setSell} aria-label="Sell price each" data-testid="calc-sell" />
          </Field>
          <Field label="Quantity" hint={buyLimit != null ? `GE limit: ${gp(buyLimit)} / 4 h` : "GE limit not available"}>
            <AmountInput value={qty} onChange={setQty} aria-label="Quantity" data-testid="calc-qty" />
          </Field>
          <Field label="Available capital (gp)">
            <AmountInput value={capital} onChange={setCapital} aria-label="Capital" />
          </Field>
          <Field label="Other costs (gp, optional)">
            <AmountInput value={otherCosts} onChange={setOtherCosts} aria-label="Other costs" />
          </Field>
          <Field label="Actual tax (gp, optional)" hint="Overrides the calculated tax, e.g. from your own trades.">
            <AmountInput value={actualTax} onChange={setActualTax} aria-label="Actual tax" />
          </Field>
          <Field label="Target profit each (gp, optional)">
            <AmountInput value={target} onChange={setTarget} aria-label="Target profit each" />
          </Field>
        </div>
        {marketPrices && (marketPrices.buy != null || marketPrices.sell != null) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (marketPrices.buy != null) setBuy(marketPrices.buy);
              if (marketPrices.sell != null) setSell(marketPrices.sell);
            }}
          >
            Use estimated prices from latest observation
          </Button>
        )}
        <p className="text-[11px] text-faint">
          Inputs accept shorthand (e.g. 1.5m, 250k). Tax: {TAX_RULES.rate * 100}% per item, rounded down, max {gp(TAX_RULES.capPerItem)} gp/item
          {exempt ? " – this item is tax-free." : "."}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm" data-testid="calc-results">
        {!r.ok ? (
          <InfoNote>
            {r.issues
              .filter((i) => i.code === "missing" || i.code === "invalid")
              .map((i) => (i.code === "missing" ? `Please enter a ${i.field === "buyPrice" ? "buy price" : i.field === "sellPrice" ? "sell price" : "quantity"}.` : i.message))
              .join(" ")}
          </InfoNote>
        ) : (
          <>
            <Row label="Purchase cost">
              <Gp value={r.purchaseCost} />
            </Row>
            <Row label="Capital needed" hint="Purchase cost + other costs">
              <Gp value={r.capitalRequired} />
            </Row>
            <Row label="Sale revenue (gross)">
              <Gp value={r.revenueGross} />
            </Row>
            <Row label="Gross profit" hint="Revenue − purchase cost, before tax and costs">
              <Gp value={r.grossProfit} colored />
            </Row>
            <Row label={r.taxIsActual ? "GE tax (actual)" : "GE tax (calculated)"} hint={`${gp(r.taxPerItem)} gp per item`}>
              <Gp value={-r.taxTotal} colored />
            </Row>
            <div className="my-1 border-t border-border" />
            <Row label="Net profit" strong>
              <span data-testid="calc-net">
                <Gp value={r.netProfit} colored />
              </span>
            </Row>
            <Row label="Net profit each">
              <Gp value={r.netProfitPerItem} colored />
            </Row>
            <Row label="ROI on capital used">
              <span data-testid="calc-roi">
                <Pct value={r.roi} />
              </span>
            </Row>
            <div className="my-1 border-t border-border" />
            <Row label="Break-even sell price" hint="Lowest sell price without a loss (incl. tax)">
              <span data-testid="calc-breakeven">
                <Gp value={r.breakEvenSellPrice} />
              </span>
            </Row>
            <Row label="Max buy price for target profit">{target == null ? <span className="text-faint">Enter a target profit</span> : <Gp value={maxBuy} />}</Row>
            <Row label="Max quantity with capital" hint={maxQ?.byLimit != null ? `Capital: ${gp(maxQ.byCapital)} · Limit: ${gp(maxQ.byLimit)}` : undefined}>
              <Gp value={maxQ?.max ?? null} />
            </Row>
            {r.issues.some((i) => i.code === "insufficient_capital") && <p className="mt-2 text-xs text-neg">Not enough capital for this quantity.</p>}
            {r.issues.some((i) => i.code === "exceeds_limit") && <p className="mt-1 text-xs text-warn">Quantity exceeds the GE buy limit (4 h).</p>}
          </>
        )}
      </div>
    </div>
  );
}

"use client";
import { useMemo, useState } from "react";
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
          <Field label="Kaufpreis / Stück (gp)">
            <AmountInput value={buy} onChange={setBuy} aria-label="Kaufpreis pro Stück" data-testid="calc-buy" />
          </Field>
          <Field label="Verkaufspreis / Stück (gp)">
            <AmountInput value={sell} onChange={setSell} aria-label="Verkaufspreis pro Stück" data-testid="calc-sell" />
          </Field>
          <Field label="Stückzahl" hint={buyLimit != null ? `GE-Limit: ${gp(buyLimit)} / 4 h` : "GE-Limit nicht verfügbar"}>
            <AmountInput value={qty} onChange={setQty} aria-label="Stückzahl" data-testid="calc-qty" />
          </Field>
          <Field label="Verfügbares Kapital (gp)">
            <AmountInput value={capital} onChange={setCapital} aria-label="Kapital" />
          </Field>
          <Field label="Sonstige Kosten (gp, optional)">
            <AmountInput value={otherCosts} onChange={setOtherCosts} aria-label="Sonstige Kosten" />
          </Field>
          <Field label="Tatsächliche Steuer (gp, optional)" hint="Überschreibt die berechnete Steuer, z. B. aus eigenen Trades.">
            <AmountInput value={actualTax} onChange={setActualTax} aria-label="Tatsächliche Steuer" />
          </Field>
          <Field label="Zielgewinn / Stück (gp, optional)">
            <AmountInput value={target} onChange={setTarget} aria-label="Zielgewinn pro Stück" />
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
            Geschätzte Preise aus letzter Beobachtung übernehmen
          </Button>
        )}
        <p className="text-[11px] text-faint">
          Eingaben akzeptieren Kurzschreibweise (z. B. 1.5m, 250k). Steuer: {TAX_RULES.rate * 100} % pro Stück, abgerundet, max. {gp(TAX_RULES.capPerItem)} gp/Stück
          {exempt ? " – dieses Item ist steuerfrei." : "."}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm" data-testid="calc-results">
        {!r.ok ? (
          <InfoNote>
            {r.issues
              .filter((i) => i.code === "missing" || i.code === "invalid")
              .map((i) => (i.code === "missing" ? `Bitte ${i.field === "buyPrice" ? "Kaufpreis" : i.field === "sellPrice" ? "Verkaufspreis" : "Stückzahl"} eingeben.` : i.message))
              .join(" ")}
          </InfoNote>
        ) : (
          <>
            <Row label="Einkauf">
              <Gp value={r.purchaseCost} />
            </Row>
            <Row label="Kapitalbedarf" hint="Einkauf + sonstige Kosten">
              <Gp value={r.capitalRequired} />
            </Row>
            <Row label="Verkaufsumsatz (brutto)">
              <Gp value={r.revenueGross} />
            </Row>
            <Row label="Bruttogewinn" hint="Umsatz − Einkauf, vor Steuer und Kosten">
              <Gp value={r.grossProfit} colored />
            </Row>
            <Row label={r.taxIsActual ? "GE-Steuer (tatsächlich)" : "GE-Steuer (berechnet)"} hint={`${gp(r.taxPerItem)} gp pro Stück`}>
              <Gp value={-r.taxTotal} colored />
            </Row>
            <div className="my-1 border-t border-border" />
            <Row label="Nettogewinn" strong>
              <span data-testid="calc-net">
                <Gp value={r.netProfit} colored />
              </span>
            </Row>
            <Row label="Nettogewinn / Stück">
              <Gp value={r.netProfitPerItem} colored />
            </Row>
            <Row label="ROI auf eingesetztes Kapital">
              <span data-testid="calc-roi">
                <Pct value={r.roi} />
              </span>
            </Row>
            <div className="my-1 border-t border-border" />
            <Row label="Break-even-Verkaufspreis" hint="Kleinster Verkaufspreis ohne Verlust (inkl. Steuer)">
              <span data-testid="calc-breakeven">
                <Gp value={r.breakEvenSellPrice} />
              </span>
            </Row>
            <Row label="Max. Kaufpreis für Zielgewinn">{target == null ? <span className="text-faint">Zielgewinn eingeben</span> : <Gp value={maxBuy} />}</Row>
            <Row label="Max. Stückzahl mit Kapital" hint={maxQ?.byLimit != null ? `Kapital: ${gp(maxQ.byCapital)} · Limit: ${gp(maxQ.byLimit)}` : undefined}>
              <Gp value={maxQ?.max ?? null} />
            </Row>
            {r.issues.some((i) => i.code === "insufficient_capital") && <p className="mt-2 text-xs text-neg">Kapital reicht nicht für diese Stückzahl.</p>}
            {r.issues.some((i) => i.code === "exceeds_limit") && <p className="mt-1 text-xs text-warn">Stückzahl übersteigt das GE-Kauflimit (4 h).</p>}
          </>
        )}
      </div>
    </div>
  );
}

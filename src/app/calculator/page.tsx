"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { Age, PageHeader } from "@/components/common/indicators";
import { ItemPicker } from "@/components/items/item-picker";
import { ProfitCalculator } from "@/components/items/profit-calculator";
import { Card, CardBody } from "@/components/ui/card";
import { Field } from "@/components/ui/input";
import { useItemMap, useRowMap } from "@/hooks/market";
import { useNow } from "@/hooks/use-now";
import { gp } from "@/lib/format";
import { useSettings } from "@/state/settings";

function num(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function CalculatorInner() {
  const params = useSearchParams();
  const router = useRouter();
  const settings = useSettings();
  const items = useItemMap();
  const rows = useRowMap();
  const now = useNow();
  const itemId = num(params.get("id"));
  const meta = itemId != null ? items.get(itemId) : undefined;
  const row = itemId != null ? rows.get(itemId) : undefined;
  const prefill = useMemo(() => ({ buy: num(params.get("buy")), sell: num(params.get("sell")), qty: num(params.get("qty")) }), [params]);
  const market = row && row.high != null && row.low != null ? { buy: row.low + settings.priceOffset, sell: row.high - settings.priceOffset } : undefined;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Profit-Rechner" description="Präzise Flip-Berechnung inkl. GE-Steuer, Break-even und Kapitalbedarf." />
      <Card className="mb-3">
        <CardBody className="grid gap-3 sm:grid-cols-[minmax(0,320px)_1fr] sm:items-end">
          <Field label="Item (optional – für Steuerausnahmen und Limit)">
            <ItemPicker
              value={itemId}
              onChange={(it) => router.replace(it ? `/calculator?id=${it.id}` : "/calculator")}
              testId="calc-item"
            />
          </Field>
          {meta && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span>
                Limit: <span className="text-text">{meta.limit != null ? gp(meta.limit) : "Nicht verfügbar"}</span>
              </span>
              {row && (
                <>
                  <span>
                    Letzter Instant-Buy: <span className="num text-text">{gp(row.high)}</span> (<Age seconds={row.highTime != null ? now / 1000 - row.highTime : null} />)
                  </span>
                  <span>
                    Letzter Instant-Sell: <span className="num text-text">{gp(row.low)}</span> (<Age seconds={row.lowTime != null ? now / 1000 - row.lowTime : null} />)
                  </span>
                </>
              )}
              <Link href={`/items/${meta.id}`} className="text-accent underline">
                Item-Details
              </Link>
            </div>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <ProfitCalculator key={params.toString()} itemId={itemId} buyLimit={meta?.limit ?? null} prefill={prefill} marketPrices={market} defaultCapital={settings.defaultCapital} />
        </CardBody>
      </Card>
    </div>
  );
}

export default function CalculatorPage() {
  return (
    <Suspense fallback={null}>
      <CalculatorInner />
    </Suspense>
  );
}

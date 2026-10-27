"use client";
import { ChevronLeft, ChevronRight, Filter, Save, Trash2 } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { EmptyState, ErrorNote, InfoNote, PageHeader, Skeleton } from "@/components/common/indicators";
import { HistoryStatusNote } from "@/components/common/history-check";
import { ScannerFilterPanel } from "@/components/scanner/filters";
import { ScannerTable } from "@/components/scanner/scanner-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AmountInput, Field, Input, Select } from "@/components/ui/input";
import { useCandidates, useMarket } from "@/hooks/market";
import { applyFilters, SORT_LABELS, sortCandidates } from "@/lib/analysis/scanner";
import { gp } from "@/lib/format";
import { DEFAULT_FILTERS, SORT_KEYS, type ScannerFilters, type SortKey } from "@/lib/storage/settings-schema";
import { useSettings, useSettingsStore } from "@/state/settings";
import { toast } from "@/state/toasts";

const PAGE = 50;

export default function ScannerPage() {
  const settings = useSettings();
  const update = useSettingsStore((s) => s.update);
  const [capital, setCapital] = useState<number | null>(null);
  const [allocation, setAllocation] = useState(100);
  const [filters, setFilters] = useState<ScannerFilters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortKey>(settings.scannerSort);
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [presetName, setPresetName] = useState("");

  const effCapital = Math.floor(((capital ?? settings.defaultCapital) * Math.min(100, Math.max(1, allocation))) / 100);
  const { candidates, isLoading, error } = useCandidates(effCapital);
  const market = useMarket();
  const deferredFilters = useDeferredValue(filters);

  const result = useMemo(() => sortCandidates(applyFilters(candidates, deferredFilters), sort), [candidates, deferredFilters, sort]);
  const pages = Math.max(1, Math.ceil(result.length / PAGE));
  const current = Math.min(page, pages - 1);
  const visible = result.slice(current * PAGE, current * PAGE + PAGE);

  const changeFilters = (f: ScannerFilters) => {
    setFilters(f);
    setPage(0);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Flip Scanner"
        description="Rates every traded item by last observed prices, volume and data quality. All profits are estimates – fills are not guaranteed."
      />

      <Card className="mb-3 p-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <Field label="Available capital (gp)" hint={capital == null ? `Default from settings: ${gp(settings.defaultCapital)}` : undefined}>
            <AmountInput value={capital} onChange={setCapital} placeholder={gp(settings.defaultCapital)} aria-label="Available capital" data-testid="scanner-capital" />
          </Field>
          <Field label="Allocation per item (%)" hint={`= ${gp(effCapital)} gp per flip`}>
            <Input type="number" min={1} max={100} value={allocation} onChange={(e) => setAllocation(Number(e.target.value) || 100)} aria-label="Allocation in percent" />
          </Field>
          <Field label="Sort by">
            <Select
              value={sort}
              onChange={(e) => {
                const v = e.target.value as SortKey;
                setSort(v);
                update({ scannerSort: v });
              }}
              aria-label="Sort by"
              data-testid="scanner-sort"
            >
              {SORT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Saved filters">
            <Select
              value=""
              onChange={(e) => {
                const p = settings.savedFilters.find((s) => s.name === e.target.value);
                if (p) {
                  changeFilters(p.filters);
                  setSort(p.sort);
                  toast(`Filter “${p.name}” loaded.`);
                }
              }}
              aria-label="Load saved filter"
            >
              <option value="">{settings.savedFilters.length ? "Load…" : "None saved"}</option>
              {settings.savedFilters.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="col-span-2 flex items-end gap-2">
            <Button variant={showFilters ? "secondary" : "outline"} onClick={() => setShowFilters((s) => !s)} data-testid="toggle-filters">
              <Filter /> Filter{JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS) ? " (active)" : ""}
            </Button>
          </div>
        </div>
        {showFilters && (
          <div className="mt-3 border-t border-border pt-3">
            <ScannerFilterPanel value={filters} onChange={changeFilters} />
            <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <Field label="Save current filters as">
                <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="e.g. Low-risk 10M" className="w-56" />
              </Field>
              <Button
                variant="outline"
                disabled={!presetName.trim()}
                onClick={() => {
                  const name = presetName.trim().slice(0, 60);
                  update({ savedFilters: [...settings.savedFilters.filter((p) => p.name !== name), { name, filters, sort }] });
                  setPresetName("");
                  toast(`Filter “${name}” saved.`, "pos");
                }}
              >
                <Save /> Save
              </Button>
              {settings.savedFilters.length > 0 && (
                <Select
                  value=""
                  className="w-48"
                  onChange={(e) => {
                    if (!e.target.value) return;
                    update({ savedFilters: settings.savedFilters.filter((p) => p.name !== e.target.value) });
                    toast(`Filter “${e.target.value}” deleted.`);
                  }}
                  aria-label="Delete saved filter"
                >
                  <option value="">Delete saved filter…</option>
                  {settings.savedFilters.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              )}
              {settings.savedFilters.length > 0 && <Trash2 className="mb-2 size-4 text-faint" aria-hidden />}
            </div>
          </div>
        )}
      </Card>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span data-testid="scanner-count">
          {result.length.toLocaleString("de-CH")} of {candidates.length.toLocaleString("de-CH")} items
          {market.data && ` · 24h basis: ${market.data.meta.day.blocksLoaded}/24 hourly blocks`}
        </span>
        <span>Buy = instant-sell + {settings.priceOffset} gp, sell = instant-buy − {settings.priceOffset} gp · tax 2% (max 5M/item)</span>
      </div>

      <div className="mb-2 empty:hidden"><HistoryStatusNote /></div>

      {market.data && market.data.meta.day.blocksLoaded < 24 && (
        <div className="mb-2">
          <InfoNote tone="warn">The 24h history is still loading ({market.data.meta.day.blocksLoaded}/24 hours). Volume, risk and quality values are less reliable until then.</InfoNote>
        </div>
      )}

      <Card className="overflow-hidden">
        {error && !candidates.length ? (
          <div className="p-4">
            <ErrorNote>Market data could not be loaded: {error.message}. No substitute data is shown.</ErrorNote>
          </div>
        ) : isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState title="No items match the filters">Adjust the filters or reset them.</EmptyState>
        ) : (
          <ScannerTable rows={visible} />
        )}
        {result.length > PAGE && (
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted">
            <span>
              Page {current + 1} of {pages}
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page">
                <ChevronLeft />
              </Button>
              <Button size="sm" variant="outline" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Next page">
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </Card>
      <p className="mt-2 text-[11px] text-faint">
        Ranking method and weights: see <a className="underline" href="/methodology">Methodology</a>. A high score is not a probability of profit. Past liquidity doesn’t guarantee future fills.
      </p>
    </div>
  );
}

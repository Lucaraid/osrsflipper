"use client";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AmountInput, Field, Input, Select } from "@/components/ui/input";
import { CATEGORIES } from "@/lib/analysis/category";
import { DEFAULT_FILTERS, type ScannerFilters } from "@/lib/storage/settings-schema";

export function ScannerFilterPanel({ value, onChange }: { value: ScannerFilters; onChange: (f: ScannerFilters) => void }) {
  const set = <K extends keyof ScannerFilters>(k: K, v: ScannerFilters[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="scanner-filters">
      <Field label="Search">
        <Input value={value.search} onChange={(e) => set("search", e.target.value)} placeholder="Name or ID" aria-label="Search scanner" />
      </Field>
      <Field label="Min ROI (%)">
        <Input
          type="number"
          step="0.1"
          inputMode="decimal"
          value={value.minRoi == null ? "" : String(+(value.minRoi * 100).toFixed(4))}
          onChange={(e) => set("minRoi", e.target.value === "" ? null : Number(e.target.value) / 100)}
          aria-label="Min ROI in percent"
          data-testid="filter-min-roi"
        />
      </Field>
      <Field label="Min margin each (gp)">
        <AmountInput value={value.minProfitPerItem} onChange={(v) => set("minProfitPerItem", v)} placeholder="e.g. 100" />
      </Field>
      <Field label="Min profit @ capital">
        <AmountInput value={value.minProfitAtCapital} onChange={(v) => set("minProfitAtCapital", v)} placeholder="e.g. 100k" />
      </Field>
      <Field label="Max price each (gp)">
        <AmountInput value={value.maxCapitalRequired} onChange={(v) => set("maxCapitalRequired", v)} placeholder="e.g. 5m" />
      </Field>
      <Field label="Min volume 24h">
        <AmountInput value={value.minVolume24h} onChange={(v) => set("minVolume24h", v)} placeholder="e.g. 1000" />
      </Field>
      <Field label="Max data age (min)">
        <AmountInput value={value.maxDataAgeMinutes} onChange={(v) => set("maxDataAgeMinutes", v)} placeholder="e.g. 30" />
      </Field>
      <Field label="Category (heuristic)">
        <Select value={value.category ?? ""} onChange={(e) => set("category", e.target.value || null)} aria-label="Category">
          <option value="">All</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Buy limit min / max">
        <div className="flex gap-1">
          <AmountInput value={value.minLimit} onChange={(v) => set("minLimit", v)} placeholder="min" aria-label="Minimum buy limit" />
          <AmountInput value={value.maxLimit} onChange={(v) => set("maxLimit", v)} placeholder="max" aria-label="Maximum buy limit" />
        </div>
      </Field>
      <Field label="Max risk">
        <Select value={value.maxRisk ?? ""} onChange={(e) => set("maxRisk", (e.target.value || null) as ScannerFilters["maxRisk"])} aria-label="Maximum risk">
          <option value="">All</option>
          <option value="niedrig">low</option>
          <option value="mittel">up to medium</option>
          <option value="hoch">up to high</option>
        </Select>
      </Field>
      <Field label="Min data quality">
        <Select value={value.minQuality ?? ""} onChange={(e) => set("minQuality", e.target.value === "" ? null : Number(e.target.value))} aria-label="Minimum quality" data-testid="filter-min-quality">
          <option value="">All</option>
          <option value="25">≥ 25 (low)</option>
          <option value="50">≥ 50 (medium)</option>
          <option value="75">≥ 75 (high)</option>
        </Select>
      </Field>
      <Field label="Membership">
        <Select
          value={value.membersOnly == null ? "" : value.membersOnly ? "m" : "f"}
          onChange={(e) => set("membersOnly", e.target.value === "" ? null : e.target.value === "m")}
          aria-label="Membership"
        >
          <option value="">All</option>
          <option value="f">F2P only</option>
          <option value="m">Members only</option>
        </Select>
      </Field>
      <div className="col-span-2 flex flex-wrap items-end gap-x-4 gap-y-2 sm:col-span-3 lg:col-span-6">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={value.hideNoLimit} onChange={(e) => set("hideNoLimit", e.target.checked)} /> Hide items without a known limit
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted" title="Hides items whose margin only comes from single outlier trades">
          <input type="checkbox" checked={value.plausibleOnly} onChange={(e) => set("plausibleOnly", e.target.checked)} data-testid="filter-plausible" /> Plausible margins only (also positive with average prices)
        </label>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => onChange(DEFAULT_FILTERS)}>
          <RotateCcw /> Reset filters
        </Button>
      </div>
    </div>
  );
}

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
      <Field label="Suche">
        <Input value={value.search} onChange={(e) => set("search", e.target.value)} placeholder="Name oder ID" aria-label="Scanner durchsuchen" />
      </Field>
      <Field label="Mindest-ROI (%)">
        <Input
          type="number"
          step="0.1"
          inputMode="decimal"
          value={value.minRoi == null ? "" : String(+(value.minRoi * 100).toFixed(4))}
          onChange={(e) => set("minRoi", e.target.value === "" ? null : Number(e.target.value) / 100)}
          aria-label="Mindest-ROI in Prozent"
          data-testid="filter-min-roi"
        />
      </Field>
      <Field label="Mind. Marge/Stück (gp)">
        <AmountInput value={value.minProfitPerItem} onChange={(v) => set("minProfitPerItem", v)} placeholder="z. B. 100" />
      </Field>
      <Field label="Mind. Gewinn @ Kapital">
        <AmountInput value={value.minProfitAtCapital} onChange={(v) => set("minProfitAtCapital", v)} placeholder="z. B. 100k" />
      </Field>
      <Field label="Max. Stückpreis (gp)">
        <AmountInput value={value.maxCapitalRequired} onChange={(v) => set("maxCapitalRequired", v)} placeholder="z. B. 5m" />
      </Field>
      <Field label="Mind. Volumen 24h">
        <AmountInput value={value.minVolume24h} onChange={(v) => set("minVolume24h", v)} placeholder="z. B. 1000" />
      </Field>
      <Field label="Max. Datenalter (min)">
        <AmountInput value={value.maxDataAgeMinutes} onChange={(v) => set("maxDataAgeMinutes", v)} placeholder="z. B. 30" />
      </Field>
      <Field label="Kategorie (heuristisch)">
        <Select value={value.category ?? ""} onChange={(e) => set("category", e.target.value || null)} aria-label="Kategorie">
          <option value="">Alle</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Handelslimit min / max">
        <div className="flex gap-1">
          <AmountInput value={value.minLimit} onChange={(v) => set("minLimit", v)} placeholder="min" aria-label="Minimales Handelslimit" />
          <AmountInput value={value.maxLimit} onChange={(v) => set("maxLimit", v)} placeholder="max" aria-label="Maximales Handelslimit" />
        </div>
      </Field>
      <Field label="Max. Risikoklasse">
        <Select value={value.maxRisk ?? ""} onChange={(e) => set("maxRisk", (e.target.value || null) as ScannerFilters["maxRisk"])} aria-label="Maximale Risikoklasse">
          <option value="">Alle</option>
          <option value="niedrig">niedrig</option>
          <option value="mittel">bis mittel</option>
          <option value="hoch">bis hoch</option>
        </Select>
      </Field>
      <Field label="Mind. Datenqualität">
        <Select value={value.minQuality ?? ""} onChange={(e) => set("minQuality", e.target.value === "" ? null : Number(e.target.value))} aria-label="Mindestqualität" data-testid="filter-min-quality">
          <option value="">Alle</option>
          <option value="25">≥ 25 (niedrig)</option>
          <option value="50">≥ 50 (mittel)</option>
          <option value="75">≥ 75 (hoch)</option>
        </Select>
      </Field>
      <Field label="Mitgliedschaft">
        <Select
          value={value.membersOnly == null ? "" : value.membersOnly ? "m" : "f"}
          onChange={(e) => set("membersOnly", e.target.value === "" ? null : e.target.value === "m")}
          aria-label="Mitgliedschaft"
        >
          <option value="">Alle</option>
          <option value="f">Nur F2P</option>
          <option value="m">Nur Members</option>
        </Select>
      </Field>
      <div className="col-span-2 flex flex-wrap items-end gap-x-4 gap-y-2 sm:col-span-3 lg:col-span-6">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={value.hideNoLimit} onChange={(e) => set("hideNoLimit", e.target.checked)} /> Items ohne bekanntes Limit ausblenden
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted" title="Blendet Items aus, deren Marge nur durch einzelne Ausreisser-Trades entsteht">
          <input type="checkbox" checked={value.plausibleOnly} onChange={(e) => set("plausibleOnly", e.target.checked)} data-testid="filter-plausible" /> Nur plausible Margen (auch mit Ø-Preisen positiv)
        </label>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => onChange(DEFAULT_FILTERS)}>
          <RotateCcw /> Filter zurücksetzen
        </Button>
      </div>
    </div>
  );
}

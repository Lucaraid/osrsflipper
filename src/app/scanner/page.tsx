"use client";
import { ChevronLeft, ChevronRight, Filter, Save, Trash2 } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { EmptyState, ErrorNote, InfoNote, PageHeader, Skeleton } from "@/components/common/indicators";
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
        description="Bewertet alle gehandelten Items anhand zuletzt beobachteter Preise, Volumen und Datenqualität. Alle Gewinne sind Schätzungen – eine Ausführung ist nicht garantiert."
      />

      <Card className="mb-3 p-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <Field label="Verfügbares Kapital (gp)" hint={capital == null ? `Standard aus Einstellungen: ${gp(settings.defaultCapital)}` : undefined}>
            <AmountInput value={capital} onChange={setCapital} placeholder={gp(settings.defaultCapital)} aria-label="Verfügbares Kapital" data-testid="scanner-capital" />
          </Field>
          <Field label="Allokation pro Item (%)" hint={`= ${gp(effCapital)} gp pro Flip`}>
            <Input type="number" min={1} max={100} value={allocation} onChange={(e) => setAllocation(Number(e.target.value) || 100)} aria-label="Allokation in Prozent" />
          </Field>
          <Field label="Sortierung">
            <Select
              value={sort}
              onChange={(e) => {
                const v = e.target.value as SortKey;
                setSort(v);
                update({ scannerSort: v });
              }}
              aria-label="Sortierung"
              data-testid="scanner-sort"
            >
              {SORT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Gespeicherte Filter">
            <Select
              value=""
              onChange={(e) => {
                const p = settings.savedFilters.find((s) => s.name === e.target.value);
                if (p) {
                  changeFilters(p.filters);
                  setSort(p.sort);
                  toast(`Filter „${p.name}“ geladen.`);
                }
              }}
              aria-label="Gespeicherte Filter laden"
            >
              <option value="">{settings.savedFilters.length ? "Laden…" : "Keine gespeichert"}</option>
              {settings.savedFilters.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="col-span-2 flex items-end gap-2">
            <Button variant={showFilters ? "secondary" : "outline"} onClick={() => setShowFilters((s) => !s)} data-testid="toggle-filters">
              <Filter /> Filter{JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS) ? " (aktiv)" : ""}
            </Button>
          </div>
        </div>
        {showFilters && (
          <div className="mt-3 border-t border-border pt-3">
            <ScannerFilterPanel value={filters} onChange={changeFilters} />
            <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <Field label="Aktuelle Filter speichern als">
                <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="z. B. Low-Risk 10M" className="w-56" />
              </Field>
              <Button
                variant="outline"
                disabled={!presetName.trim()}
                onClick={() => {
                  const name = presetName.trim().slice(0, 60);
                  update({ savedFilters: [...settings.savedFilters.filter((p) => p.name !== name), { name, filters, sort }] });
                  setPresetName("");
                  toast(`Filter „${name}“ gespeichert.`, "pos");
                }}
              >
                <Save /> Speichern
              </Button>
              {settings.savedFilters.length > 0 && (
                <Select
                  value=""
                  className="w-48"
                  onChange={(e) => {
                    if (!e.target.value) return;
                    update({ savedFilters: settings.savedFilters.filter((p) => p.name !== e.target.value) });
                    toast(`Filter „${e.target.value}“ gelöscht.`);
                  }}
                  aria-label="Gespeicherten Filter löschen"
                >
                  <option value="">Gespeicherten Filter löschen…</option>
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
          {result.length.toLocaleString("de-CH")} von {candidates.length.toLocaleString("de-CH")} Items
          {market.data && ` · 24h-Basis: ${market.data.meta.day.blocksLoaded}/24 Stundenblöcke`}
        </span>
        <span>Kauf = Instant-Sell + {settings.priceOffset} gp, Verkauf = Instant-Buy − {settings.priceOffset} gp · Steuer 2 % (max. 5M/Stk)</span>
      </div>

      {market.data && market.data.meta.day.blocksLoaded < 24 && (
        <div className="mb-2">
          <InfoNote tone="warn">Die 24h-Historie wird noch geladen ({market.data.meta.day.blocksLoaded}/24 Stunden). Volumen-, Risiko- und Qualitätswerte sind bis dahin weniger aussagekräftig.</InfoNote>
        </div>
      )}

      <Card className="overflow-hidden">
        {error && !candidates.length ? (
          <div className="p-4">
            <ErrorNote>Marktdaten konnten nicht geladen werden: {error.message}. Es werden keine Ersatzdaten angezeigt.</ErrorNote>
          </div>
        ) : isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState title="Keine Items entsprechen den Filtern">Passe die Filter an oder setze sie zurück.</EmptyState>
        ) : (
          <ScannerTable rows={visible} />
        )}
        {result.length > PAGE && (
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted">
            <span>
              Seite {current + 1} von {pages}
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Vorherige Seite">
                <ChevronLeft />
              </Button>
              <Button size="sm" variant="outline" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Nächste Seite">
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </Card>
      <p className="mt-2 text-[11px] text-faint">
        Ranking-Methodik und Gewichtung: siehe <a className="underline" href="/methodik">Methodik</a>. Hohe Werte bedeuten keine Gewinnwahrscheinlichkeit. Historische Liquidität garantiert keine künftige Ausführung.
      </p>
    </div>
  );
}

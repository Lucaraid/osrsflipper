"use client";
import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Confirm } from "@/components/common/confirm";
import { ErrorNote, InfoNote, PageHeader } from "@/components/common/indicators";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AmountInput, Field, Select } from "@/components/ui/input";
import { createBackup, parseBackup } from "@/lib/storage/backup";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/storage/settings-schema";
import { TAX_RULES } from "@/lib/tax/rules";
import { gp } from "@/lib/format";
import { useDataStore } from "@/state/data";
import { useSettings, useSettingsStore } from "@/state/settings";
import { useLimiterStore } from "@/state/limiter";
import { FolderSettingsCard } from "@/components/layout/folder-settings";
import { toast } from "@/state/toasts";

const LIMITER_STEPS = [10, 20, 30, 50, 100, 200];

export default function SettingsPage() {
  const s = useSettings();
  const limiterCount = useLimiterStore((x) => x.count);
  const limiterPaused = useLimiterStore((x) => x.challenge != null);
  const resetLimiter = useLimiterStore((x) => x.reset);
  const update = useSettingsStore((x) => x.update);
  const replace = useSettingsStore((x) => x.replace);
  const data = useDataStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const doExport = () => {
    const backup = createBackup({ settings: s, trades: data.trades, capital: data.capital, watchlist: data.watchlist, alerts: data.alerts, alertEvents: data.alertEvents });
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `osrs-ge-flipper-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Export created.", "pos");
  };

  const doImport = async (file: File) => {
    setImportErrors([]);
    const text = await file.text();
    const r = parseBackup(text);
    if (!r.ok) {
      setImportErrors(r.errors);
      toast("Import rejected – invalid file.", "neg");
      return;
    }
    await data.importBackup(r.backup);
    replace(r.backup.settings);
    toast(`Import successful: ${r.backup.trades.length} trades, ${r.backup.watchlist.length} watchlist entries.`, "pos");
  };

  return (
    <div className="animate-fade-in space-y-3">
      <PageHeader title="Settings" description="Settings and data stay on your device – in the browser or in a folder of your choice." />

      <div className="grid gap-3 lg:grid-cols-2">
        <FolderSettingsCard />
        <Card>
          <CardHeader title="Appearance & trading" />
          <CardBody className="grid grid-cols-2 gap-3">
            <Field label="Theme">
              <Select value={s.theme} onChange={(e) => update({ theme: e.target.value as Settings["theme"] })} aria-label="Theme" data-testid="theme-select">
                <option value="light">Light (parchment)</option>
                <option value="dark">Dark (wood)</option>
              </Select>
            </Field>
            <Field label="Default capital (gp)">
              <AmountInput value={s.defaultCapital} onChange={(v) => v != null && v >= 0 && update({ defaultCapital: v })} aria-label="Default capital" data-testid="settings-capital" />
            </Field>
            <Field label="Overbid / undercut (gp)" hint="Est. buy = instant-sell + x, est. sell = instant-buy − x">
              <AmountInput value={s.priceOffset} onChange={(v) => v != null && v >= 0 && update({ priceOffset: Math.min(1_000_000, v) })} aria-label="Price offset" />
            </Field>
            <Field label="GE slots" hint="8 for members, 3 for F2P">
              <Select value={s.geSlots} onChange={(e) => update({ geSlots: Number(e.target.value) })} aria-label="GE slots">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Request limiter (Wordle)" />
          <CardBody className="space-y-3">
            <p className="text-xs text-muted">
              After a number of requests to the market API, live data pauses until you solve a Wordle: 6 tries to find the 5-letter word. Green = right letter in the right spot, yellow = letter is in the word, red = not in the word. Fail and you get a new word.
            </p>
            {s.requestLimiter.enabled && limiterPaused && (
              <div data-testid="limiter-paused">
                <InfoNote tone="warn">Live data is paused – a Wordle is waiting. Turn the limiter off below, or open any other page to solve it.</InfoNote>
              </div>
            )}
            <div className="grid grid-cols-2 items-end gap-3">
              <label className="flex h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={s.requestLimiter.enabled}
                  onChange={(e) => {
                    // Abschalten verwirft auch ein offenes Rätsel, sonst taucht es beim Wiedereinschalten sofort auf
                    if (!e.target.checked) resetLimiter();
                    update({ requestLimiter: { ...s.requestLimiter, enabled: e.target.checked } });
                  }}
                  data-testid="limiter-enabled"
                />{" "}
                Enable request limiter
              </label>
              <Field label="Requests per puzzle">
                <Select
                  value={s.requestLimiter.requestsPerPuzzle}
                  onChange={(e) => update({ requestLimiter: { ...s.requestLimiter, requestsPerPuzzle: Number(e.target.value) } })}
                  disabled={!s.requestLimiter.enabled}
                  aria-label="Requests per puzzle"
                  data-testid="limiter-threshold"
                >
                  {[...new Set([...LIMITER_STEPS, s.requestLimiter.requestsPerPuzzle])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </Field>
            </div>
            {s.requestLimiter.enabled && (
              <p className="text-xs text-faint" data-testid="limiter-status">
                {Math.min(limiterCount, s.requestLimiter.requestsPerPuzzle)} of {s.requestLimiter.requestsPerPuzzle} requests used until the next puzzle.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Back up & restore data" />
          <CardBody className="space-y-3">
            <InfoNote tone="warn">
              Without a connected folder all personal data lives only in this browser (IndexedDB/LocalStorage) and is lost if you clear browser data. The app has no cloud sync – connect a folder (above) or export regularly.
            </InfoNote>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={doExport} data-testid="export-button"><Download /> Export JSON</Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload /> Import JSON</Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                data-testid="import-input"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void doImport(f);
                  e.target.value = "";
                }}
              />
              <Confirm
                title="Delete all local data?"
                text="Trades, capital entries and watchlist will be deleted from this browser – and, if a folder is connected, from the data file in that folder too. Settings will be reset. This can’t be undone."
                confirmLabel="Delete everything"
                onConfirm={async () => {
                  await data.clearAll();
                  replace(DEFAULT_SETTINGS);
                  toast("All local data deleted.");
                }}
                trigger={(o) => <Button variant="ghost" onClick={o} className="text-neg">Delete all data</Button>}
              />
            </div>
            <p className="text-xs text-muted">Currently saved: {data.trades.length} trades · {data.capital.length} capital entries · {data.watchlist.length} watchlist entries. Importing replaces all existing data.</p>
            {importErrors.length > 0 && (
              <ErrorNote>
                <div className="font-medium">Import rejected:</div>
                <ul className="list-disc pl-4">{importErrors.map((e) => <li key={e}>{e}</li>)}</ul>
              </ErrorNote>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="GE tax rules (verified)" />
          <CardBody className="text-xs text-muted">
            Rate {TAX_RULES.rate * 100}% per item (rounded down), max {gp(TAX_RULES.capPerItem)} gp per item, effective from {TAX_RULES.effectiveFrom}. {Object.keys(TAX_RULES.exemptItems).length} tax-free items. Last checked on {TAX_RULES.verifiedAt}. Sources:{" "}
            {TAX_RULES.sources.map((u) => <a key={u} href={u} className="mr-2 underline" target="_blank" rel="noreferrer">{decodeURIComponent(u.split("/w/")[1] ?? u)}</a>)}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

"use client";
import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Confirm } from "@/components/common/confirm";
import { ErrorNote, InfoNote, PageHeader } from "@/components/common/indicators";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AmountInput, Field, Input, Select } from "@/components/ui/input";
import { createBackup, parseBackup } from "@/lib/storage/backup";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/storage/settings-schema";
import { TAX_RULES } from "@/lib/tax/rules";
import { gp } from "@/lib/format";
import { useDataStore } from "@/state/data";
import { useSettings, useSettingsStore } from "@/state/settings";
import { FolderSettingsCard } from "@/components/layout/folder-settings";
import { toast } from "@/state/toasts";

export default function SettingsPage() {
  const s = useSettings();
  const update = useSettingsStore((x) => x.update);
  const replace = useSettingsStore((x) => x.replace);
  const data = useDataStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const rules = s.rules;
  const setRule = <K extends keyof Settings["rules"]>(k: K, v: Settings["rules"][K]) => update({ rules: { ...rules, [k]: v } });

  const doExport = () => {
    const backup = createBackup({ settings: s, trades: data.trades, capital: data.capital, watchlist: data.watchlist, alerts: data.alerts, alertEvents: data.alertEvents });
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `osrs-ge-flipper-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Export erstellt.", "pos");
  };

  const doImport = async (file: File) => {
    setImportErrors([]);
    const text = await file.text();
    const r = parseBackup(text);
    if (!r.ok) {
      setImportErrors(r.errors);
      toast("Import abgelehnt – Datei ungültig.", "neg");
      return;
    }
    await data.importBackup(r.backup);
    replace(r.backup.settings);
    toast(`Import erfolgreich: ${r.backup.trades.length} Trades, ${r.backup.watchlist.length} Watchlist-Einträge.`, "pos");
  };

  return (
    <div className="animate-fade-in space-y-3">
      <PageHeader title="Einstellungen" description="Einstellungen und Daten bleiben auf deinem Gerät – im Browser oder in einem Ordner deiner Wahl." />

      <div className="grid gap-3 lg:grid-cols-2">
        <FolderSettingsCard />
        <Card>
          <CardHeader title="Darstellung & Trading" />
          <CardBody className="grid grid-cols-2 gap-3">
            <Field label="Design">
              <Select value={s.theme} onChange={(e) => update({ theme: e.target.value as Settings["theme"] })} aria-label="Design" data-testid="theme-select">
                <option value="dark">Dunkel</option>
                <option value="light">Hell</option>
              </Select>
            </Field>
            <Field label="Standardkapital (gp)">
              <AmountInput value={s.defaultCapital} onChange={(v) => v != null && v >= 0 && update({ defaultCapital: v })} aria-label="Standardkapital" data-testid="settings-capital" />
            </Field>
            <Field label="Über-/Unterbieten (gp)" hint="Gesch. Kauf = Instant-Sell + x, gesch. Verkauf = Instant-Buy − x">
              <AmountInput value={s.priceOffset} onChange={(v) => v != null && v >= 0 && update({ priceOffset: Math.min(1_000_000, v) })} aria-label="Preis-Offset" />
            </Field>
            <Field label="GE-Slots" hint="8 für Members, 3 für F2P">
              <Select value={s.geSlots} onChange={(e) => update({ geSlots: Number(e.target.value) })} aria-label="GE-Slots">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Datenaktualität" description="Grenzen für die Bewertung von Preisbeobachtungen" />
          <CardBody className="grid grid-cols-2 gap-3">
            <Field label="„Frisch“ bis (Minuten)">
              <AmountInput value={s.freshness.freshMinutes} onChange={(v) => v && v > 0 && v < s.freshness.staleMinutes && update({ freshness: { ...s.freshness, freshMinutes: v } })} aria-label="Frisch bis Minuten" />
            </Field>
            <Field label="„Veraltet“ ab (Minuten)">
              <AmountInput value={s.freshness.staleMinutes} onChange={(v) => v && v > s.freshness.freshMinutes && update({ freshness: { ...s.freshness, staleMinutes: v } })} aria-label="Veraltet ab Minuten" />
            </Field>
            <p className="col-span-2 text-[11px] text-faint">Dazwischen sinkt der Aktualitäts-Anteil der Datenqualität linear. Wirkt auf Scanner, Qualitätsbewertung und Warnungen.</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Persönliche Positionsregeln" description="Erzeugen Warnungen im Portfolio und Dashboard" />
          <CardBody className="grid grid-cols-2 gap-3">
            <Field label="Max. Kapital pro Item (gp)"><AmountInput value={rules.maxCapitalPerItem} onChange={(v) => setRule("maxCapitalPerItem", v && v > 0 ? v : null)} /></Field>
            <Field label="Max. Anteil pro Position (%)">
              <Input type="number" min={1} max={100} value={rules.maxPositionPct == null ? "" : Math.round(rules.maxPositionPct * 100)} onChange={(e) => setRule("maxPositionPct", e.target.value === "" ? null : Math.min(1, Math.max(0.01, Number(e.target.value) / 100)))} />
            </Field>
            <Field label="Max. offene Positionen"><AmountInput value={rules.maxOpenPositions} onChange={(v) => setRule("maxOpenPositions", v && v > 0 ? v : null)} /></Field>
            <Field label="Mindestreserve freies Kapital (gp)"><AmountInput value={rules.minReserve} onChange={(v) => setRule("minReserve", v != null && v >= 0 ? v : null)} /></Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Daten sichern & wiederherstellen" />
          <CardBody className="space-y-3">
            <InfoNote tone="warn">
              Ohne verbundenen Ordner liegen alle persönlichen Daten nur in diesem Browser (IndexedDB/LocalStorage) und gehen beim Löschen der Browserdaten verloren. Es gibt keine Cloud-Synchronisierung durch die App – verbinde einen Ordner (oben) oder exportiere regelmässig.
            </InfoNote>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={doExport} data-testid="export-button"><Download /> JSON exportieren</Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload /> JSON importieren</Button>
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
                title="Alle lokalen Daten löschen?"
                text="Trades, Kapitalbuchungen, Watchlist und Alarme werden aus diesem Browser gelöscht – und, falls ein Ordner verbunden ist, auch in der Datendatei im Ordner. Einstellungen werden zurückgesetzt. Dies kann nicht rückgängig gemacht werden."
                confirmLabel="Alles löschen"
                onConfirm={async () => {
                  await data.clearAll();
                  replace(DEFAULT_SETTINGS);
                  toast("Alle lokalen Daten gelöscht.");
                }}
                trigger={(o) => <Button variant="ghost" onClick={o} className="text-neg">Alle Daten löschen</Button>}
              />
            </div>
            <p className="text-xs text-muted">Aktuell gespeichert: {data.trades.length} Trades · {data.capital.length} Kapitalbuchungen · {data.watchlist.length} Watchlist-Einträge · {data.alerts.length} Alarme. Import ersetzt alle vorhandenen Daten.</p>
            {importErrors.length > 0 && (
              <ErrorNote>
                <div className="font-medium">Import abgelehnt:</div>
                <ul className="list-disc pl-4">{importErrors.map((e) => <li key={e}>{e}</li>)}</ul>
              </ErrorNote>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="GE-Steuerregeln (verifiziert)" />
          <CardBody className="text-xs text-muted">
            Satz {TAX_RULES.rate * 100} % pro Stück (abgerundet), max. {gp(TAX_RULES.capPerItem)} gp pro Stück, gültig ab {TAX_RULES.effectiveFrom}. {Object.keys(TAX_RULES.exemptItems).length} steuerfreie Items. Zuletzt geprüft am {TAX_RULES.verifiedAt}. Quellen:{" "}
            {TAX_RULES.sources.map((u) => <a key={u} href={u} className="mr-2 underline" target="_blank" rel="noreferrer">{decodeURIComponent(u.split("/w/")[1] ?? u)}</a>)}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

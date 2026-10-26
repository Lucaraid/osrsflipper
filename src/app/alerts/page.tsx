"use client";
import { BellRing, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { EmptyState, InfoNote, PageHeader } from "@/components/common/indicators";
import { ItemIcon } from "@/components/common/item-icon";
import { ItemPicker } from "@/components/items/item-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AmountInput, Field, Select } from "@/components/ui/input";
import { useItemMap, useRowMap } from "@/hooks/market";
import { useNow } from "@/hooks/use-now";
import { ALERT_KIND_LABELS, alertValue } from "@/lib/alerts/alerts";
import type { Alert } from "@/lib/portfolio/schemas";
import { newId } from "@/lib/storage/db";
import { dateTime, gp } from "@/lib/format";
import { useDataStore } from "@/state/data";
import { useSettings, useSettingsStore } from "@/state/settings";
import { toast } from "@/state/toasts";

export default function AlertsPage() {
  const { alerts, alertEvents, saveAlert, deleteAlert } = useDataStore();
  const settings = useSettings();
  const update = useSettingsStore((s) => s.update);
  const items = useItemMap();
  const rows = useRowMap();
  const [itemId, setItemId] = useState<number | null>(null);
  const [kind, setKind] = useState<Alert["kind"]>("price_below");
  const [side, setSide] = useState<Alert["side"]>("low");
  const [threshold, setThreshold] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState(60);
  const [requested, setPerm] = useState<NotificationPermission | null>(null);
  const livePerm = useSyncExternalStore<NotificationPermission | "unsupported">(
    () => () => {},
    () => (typeof Notification !== "undefined" ? Notification.permission : "unsupported"),
    () => "unsupported",
  );
  const perm = requested ?? livePerm;
  const now = useNow();

  const add = async () => {
    if (itemId == null || threshold == null) return;
    await saveAlert({ id: newId(), itemId, kind, side, threshold, enabled: true, createdAt: Date.now(), lastTriggeredAt: null, cooldownMinutes: cooldown });
    setThreshold(null);
    toast("Alarm angelegt.", "pos");
  };

  return (
    <div className="animate-fade-in space-y-3">
      <PageHeader title="Preisalarme" description="Lokal im Browser geprüfte Alarme." />
      <InfoNote tone="warn">
        Alarme werden <b>nur geprüft, solange diese Webseite in einem Browser-Tab geöffnet ist</b> (Prüfung bei jeder Marktdaten-Aktualisierung, ca. alle 60 s). Ist die Seite geschlossen, wird nichts ausgelöst – serverseitige Alarme sind derzeit nicht implementiert.
      </InfoNote>

      <Card>
        <CardHeader title="Browser-Benachrichtigungen" />
        <CardBody className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted">Status: {perm === "unsupported" ? "vom Browser nicht unterstützt" : perm === "granted" ? "erlaubt" : perm === "denied" ? "blockiert (in den Browser-Einstellungen änderbar)" : "nicht angefragt"}</span>
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={settings.notificationsEnabled} onChange={(e) => update({ notificationsEnabled: e.target.checked })} disabled={perm !== "granted"} />
            System-Benachrichtigungen verwenden
          </label>
          {perm === "default" && (
            <Button size="sm" variant="outline" onClick={async () => { const r = await Notification.requestPermission(); setPerm(r); if (r === "granted") update({ notificationsEnabled: true }); }}>
              <BellRing /> Erlaubnis anfragen
            </Button>
          )}
          <span className="text-xs text-faint">Ohne Erlaubnis erscheinen Alarme als Hinweis innerhalb der Seite.</span>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Neuer Alarm" />
        <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-6 sm:items-end">
          <div className="col-span-2"><Field label="Item"><ItemPicker value={itemId} onChange={(it) => setItemId(it?.id ?? null)} testId="alert-item" /></Field></div>
          <Field label="Bedingung">
            <Select value={kind} onChange={(e) => setKind(e.target.value as Alert["kind"])} aria-label="Bedingung">
              {Object.entries(ALERT_KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          {(kind === "price_below" || kind === "price_above") && (
            <Field label="Preisseite">
              <Select value={side} onChange={(e) => setSide(e.target.value as Alert["side"])} aria-label="Preisseite">
                <option value="low">Instant-Sell</option>
                <option value="high">Instant-Buy</option>
              </Select>
            </Field>
          )}
          <Field label={kind === "quality_below" ? "Schwelle (0–100)" : "Schwelle (gp)"}>
            <AmountInput value={threshold} onChange={setThreshold} aria-label="Schwelle" />
          </Field>
          <Field label="Pause nach Auslösung (min)">
            <AmountInput value={cooldown} onChange={(v) => setCooldown(Math.max(1, Math.min(10_080, v ?? 60)))} aria-label="Pause in Minuten" />
          </Field>
          <Button variant="primary" onClick={add} disabled={itemId == null || threshold == null}>Anlegen</Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Aktive Alarme" />
        {alerts.length === 0 ? (
          <EmptyState title="Keine Alarme" />
        ) : (
          <ul className="divide-y divide-border text-sm">
            {alerts.map((a) => {
              const m = items.get(a.itemId);
              const r = rows.get(a.itemId);
              const v = r ? alertValue(a, r, now / 1000, settings.freshness) : null;
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-1.5">
                  <ItemIcon icon={m?.icon} name={m?.name ?? ""} size={18} />
                  <Link href={`/items/${a.itemId}`} className="w-44 truncate hover:text-accent">{m?.name ?? a.itemId}</Link>
                  <span className="text-xs">{ALERT_KIND_LABELS[a.kind]} {gp(a.threshold)}{a.kind.startsWith("price") ? ` (${a.side === "low" ? "Instant-Sell" : "Instant-Buy"})` : ""}</span>
                  <span className="text-xs text-muted">aktuell {v == null ? "nicht verfügbar" : gp(v)}</span>
                  {a.lastTriggeredAt && <Badge tone="warn">zuletzt {dateTime(a.lastTriggeredAt)}</Badge>}
                  <span className="flex-1" />
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={a.enabled} onChange={(e) => saveAlert({ ...a, enabled: e.target.checked })} /> aktiv</label>
                  <Button size="icon" variant="ghost" onClick={() => deleteAlert(a.id)} aria-label="Alarm löschen"><Trash2 /></Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Ausgelöste Alarme" description="Letzte 200 Ereignisse" />
        {alertEvents.length === 0 ? <EmptyState title="Noch keine Auslösungen" /> : (
          <ul className="divide-y divide-border text-xs">
            {alertEvents.slice(0, 50).map((e) => (
              <li key={e.id} className="flex gap-3 px-4 py-1.5"><span className="w-32 text-muted">{dateTime(e.at)}</span><span>{e.text}</span></li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

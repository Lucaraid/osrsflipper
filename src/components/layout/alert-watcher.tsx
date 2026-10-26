"use client";
import { useEffect, useRef } from "react";
import { evaluateAlerts } from "@/lib/alerts/alerts";
import { newId } from "@/lib/storage/db";
import { useItemMap, useMarket } from "@/hooks/market";
import { useDataStore } from "@/state/data";
import { useSettings } from "@/state/settings";
import { toast } from "@/state/toasts";

/**
 * Prüft lokale Preisalarme bei jedem neuen Marktdaten-Snapshot.
 * Funktioniert nur, solange ein Tab mit der Webseite geöffnet ist.
 */
export function AlertWatcher() {
  const { data } = useMarket();
  const items = useItemMap();
  const settings = useSettings();
  const alerts = useDataStore((s) => s.alerts);
  const loaded = useDataStore((s) => s.loaded);
  const lastGen = useRef<number | null>(null);

  useEffect(() => {
    if (!data || !loaded || alerts.length === 0) return;
    if (lastGen.current === data.meta.generatedAt) return;
    lastGen.current = data.meta.generatedAt;
    const rows = new Map(data.rows.map((r) => [r.id, r]));
    const names = new Map([...items.values()].map((i) => [i.id, i.name]));
    const hits = evaluateAlerts(alerts, rows, Date.now(), settings.freshness, names);
    if (hits.length === 0) return;
    const store = useDataStore.getState();
    const now = Date.now();
    void (async () => {
      for (const h of hits) await store.saveAlert({ ...h.alert, lastTriggeredAt: now });
      await store.addAlertEvents(hits.map((h) => ({ id: newId(), alertId: h.alert.id, itemId: h.alert.itemId, at: now, text: h.text })));
    })();
    for (const h of hits) {
      toast(`🔔 ${h.text}`, "warn");
      if (settings.notificationsEnabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification("OSRS GE Flipper – Preisalarm", { body: h.text, tag: h.alert.id });
        } catch {
          /* einige Browser erlauben Notification nur über Service Worker */
        }
      }
    }
  }, [data, loaded, alerts, items, settings.freshness, settings.notificationsEnabled]);

  return null;
}

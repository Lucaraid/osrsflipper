"use client";
import { AlertTriangle, FlaskConical, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Tip } from "@/components/ui/tooltip";
import { useMarket } from "@/hooks/market";
import { useNow } from "@/hooks/use-now";
import { ago, dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSettings } from "@/state/settings";

export function DataStatus() {
  const { data, error, isFetching } = useMarket();
  const qc = useQueryClient();
  const now = useNow(10_000);
  const s = useSettings();
  const fetchedAt = data?.meta.latest.fetchedAt ?? null;
  const age = fetchedAt ? (now - fetchedAt) / 1000 : null;
  const stale = data?.meta.latest.stale || (age != null && age > s.freshness.staleMinutes * 60);
  const tone = error && !data ? "text-neg" : stale ? "text-warn" : "text-pos";

  return (
    <Tip
      content={
        <div className="space-y-1">
          <div>Quelle: OSRS Wiki Real-time Prices API (v2)</div>
          <div>Letzter erfolgreicher Abruf: {dateTime(fetchedAt)}</div>
          {data && (
            <div className="text-muted">
              24h-Historie: {data.meta.day.blocksLoaded}/{data.meta.day.blocksExpected} Stundenblöcke · 5-min-Block: {dateTime((data.meta.fiveMin.blockTimestamp ?? 0) * 1000)}
            </div>
          )}
          {data?.meta.latest.error && <div className="text-warn">Fehler beim letzten Abruf: {data.meta.latest.error}</div>}
          {error && <div className="text-neg">{error.message}</div>}
          <div className="text-muted">Automatische Aktualisierung alle 60 s.</div>
        </div>
      }
    >
      <button
        type="button"
        onClick={() => qc.invalidateQueries({ queryKey: ["market"] })}
        className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted hover:bg-surface-2"
        data-testid="data-status"
      >
        {data?.meta.source === "fixtures" && <FlaskConical className="size-3.5 text-warn" />}
        {stale || (error && !data) ? <AlertTriangle className={cn("size-3.5", tone)} /> : <span className={cn("size-2 rounded-full bg-current", tone)} />}
        <span className="hidden sm:inline">{error && !data ? "Keine Marktdaten" : fetchedAt ? `Aktualisiert ${ago(age)}` : "Lade…"}</span>
        <RefreshCw className={cn("size-3", isFetching && "animate-spin")} />
      </button>
    </Tip>
  );
}

export function FixtureBanner() {
  const { data } = useMarket();
  if (data?.meta.source !== "fixtures") return null;
  return (
    <div className="bg-warn px-3 py-1 text-center text-xs font-semibold text-black" role="alert" data-testid="fixture-banner">
      TESTDATEN-MODUS – synthetische Preise, keine echten Marktdaten
    </div>
  );
}

export function StaleBanner() {
  const { data, error } = useMarket();
  const now = useNow(30_000);
  const s = useSettings();
  if (error && !data) {
    return (
      <div className="border-b border-neg/40 bg-neg-soft px-4 py-1.5 text-xs text-neg" role="alert">
        Marktdaten sind derzeit nicht verfügbar ({error.message}). Persönliche Daten und der Rechner funktionieren weiterhin.
      </div>
    );
  }
  const fetchedAt = data?.meta.latest.fetchedAt;
  if (!data || !fetchedAt) return null;
  const ageMin = (now - fetchedAt) / 60_000;
  if (!data.meta.latest.stale && ageMin <= s.freshness.staleMinutes) return null;
  return (
    <div className="border-b border-warn/40 bg-warn-soft px-4 py-1.5 text-xs text-warn" role="alert">
      Achtung: Es werden zwischengespeicherte Marktdaten angezeigt (Stand {dateTime(fetchedAt)}, {ago(ageMin * 60)}). Die OSRS Wiki API ist evtl. nicht erreichbar.
    </div>
  );
}

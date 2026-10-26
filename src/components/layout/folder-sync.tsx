"use client";
import { FolderOpen, FolderSync as FolderSyncIcon, HardDrive } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tip } from "@/components/ui/tooltip";
import { useNow } from "@/hooks/use-now";
import { ago, dateTime } from "@/lib/format";
import { DATA_FILE } from "@/lib/storage/folder";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/state/data";
import { useFolderStore } from "@/state/folder";
import { useSettingsStore } from "@/state/settings";

/** Initialisiert die Ordner-Verbindung und speichert Änderungen automatisch. */
export function FolderSync() {
  const loaded = useDataStore((s) => s.loaded);
  const conflict = useFolderStore((s) => s.conflict);
  const resolve = useFolderStore((s) => s.resolveConflict);
  const folderName = useFolderStore((s) => s.folderName);

  useEffect(() => {
    if (!loaded) return;
    void useFolderStore.getState().init();
  }, [loaded]);

  useEffect(() => {
    const unsubData = useDataStore.subscribe((s, p) => {
      if (s.trades !== p.trades || s.capital !== p.capital || s.watchlist !== p.watchlist || s.alerts !== p.alerts || s.alertEvents !== p.alertEvents) {
        useFolderStore.getState().scheduleSave();
      }
    });
    const unsubSettings = useSettingsStore.subscribe((s, p) => {
      if (s.settings !== p.settings && p.hydrated) useFolderStore.getState().scheduleSave();
    });
    const onFocus = () => void useFolderStore.getState().checkExternalChange();
    window.addEventListener("focus", onFocus);
    return () => {
      unsubData();
      unsubSettings();
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (!conflict) return null;
  const local = useDataStore.getState();
  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent title="Welche Daten sollen gelten?" description={`Der Ordner „${folderName}“ enthält bereits Daten, die sich von den Daten in diesem Browser unterscheiden.`}>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-md border border-border p-3">
            <div className="font-medium">Im Ordner</div>
            <div className="text-xs text-muted">
              {conflict.backup.trades.length} Trades · {conflict.backup.capital.length} Kapitalbuchungen · {conflict.backup.watchlist.length} Watchlist
              <br />
              Stand {dateTime(conflict.backup.exportedAt)}
            </div>
            <Button className="mt-2 w-full" variant="primary" onClick={() => resolve("folder")} data-testid="conflict-folder">
              Ordner-Daten laden
            </Button>
          </div>
          <div className="rounded-md border border-border p-3">
            <div className="font-medium">In diesem Browser</div>
            <div className="text-xs text-muted">
              {local.trades.length} Trades · {local.capital.length} Kapitalbuchungen · {local.watchlist.length} Watchlist
            </div>
            <Button className="mt-2 w-full" variant="outline" onClick={() => resolve("local")} data-testid="conflict-local">
              Browser-Daten in Ordner speichern
            </Button>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-faint">Die jeweils andere Version wird überschrieben. Tipp: Vorher unter Einstellungen eine JSON-Sicherung exportieren.</p>
      </DialogContent>
    </Dialog>
  );
}

/** Kompakte Statusanzeige im Header */
export function FolderStatusChip() {
  const { status, folderName, lastSavedAt, saving, lastError } = useFolderStore();
  const now = useNow(10_000);
  if (status === "unknown") return null;
  const tone = status === "connected" ? "text-pos" : status === "needs-permission" || status === "none" ? "text-warn" : status === "error" ? "text-neg" : "text-muted";
  const label =
    status === "connected" ? folderName : status === "needs-permission" ? "Zugriff erneuern" : status === "none" ? "Nur Browser" : status === "unsupported" ? "Nur Browser" : "Speicherfehler";
  return (
    <Tip
      content={
        <div className="space-y-1">
          {status === "connected" && (
            <>
              <div>Daten werden im Ordner „{folderName}“ gespeichert ({DATA_FILE} + trades.csv).</div>
              <div className="text-muted">Zuletzt gespeichert: {lastSavedAt ? ago((now - lastSavedAt) / 1000) : "–"}</div>
            </>
          )}
          {status === "needs-permission" && <div>Der Browser braucht deine Bestätigung, um wieder in „{folderName}“ zu schreiben. Klicken zum Erlauben.</div>}
          {status === "none" && <div>Daten liegen nur im Browser-Speicher. Unter Einstellungen einen Ordner auf deinem Computer wählen.</div>}
          {status === "unsupported" && <div>Dieser Browser unterstützt keine Ordner-Speicherung (nur Chrome/Edge). Daten liegen im Browser – regelmässig exportieren.</div>}
          {lastError && <div className="text-neg">{lastError}</div>}
        </div>
      }
    >
      {status === "needs-permission" ? (
        <button type="button" onClick={() => void useFolderStore.getState().reconnect()} className={cn("flex items-center gap-1.5 rounded-md border border-warn/50 px-2 py-1 text-xs", tone)} data-testid="folder-status">
          <FolderSyncIcon className="size-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ) : (
        <Link href="/settings#speicherort" className={cn("flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs", tone)} data-testid="folder-status">
          {status === "connected" ? <FolderOpen className={cn("size-3.5", saving && "animate-pulse")} /> : <HardDrive className="size-3.5" />}
          <span className="hidden max-w-32 truncate sm:inline">{label}</span>
        </Link>
      )}
    </Tip>
  );
}

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
      <DialogContent title="Which data should win?" description={`The folder “${folderName}” already contains data that differs from the data in this browser.`}>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-md border border-border p-3">
            <div className="font-medium">In the folder</div>
            <div className="text-xs text-muted">
              {conflict.backup.trades.length} trades · {conflict.backup.capital.length} capital entries · {conflict.backup.watchlist.length} watchlist
              <br />
              As of {dateTime(conflict.backup.exportedAt)}
            </div>
            <Button className="mt-2 w-full" variant="primary" onClick={() => resolve("folder")} data-testid="conflict-folder">
              Load folder data
            </Button>
          </div>
          <div className="rounded-md border border-border p-3">
            <div className="font-medium">In this browser</div>
            <div className="text-xs text-muted">
              {local.trades.length} trades · {local.capital.length} capital entries · {local.watchlist.length} watchlist
            </div>
            <Button className="mt-2 w-full" variant="outline" onClick={() => resolve("local")} data-testid="conflict-local">
              Save browser data to folder
            </Button>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-faint">The other version will be overwritten. Tip: export a JSON backup in Settings first.</p>
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
    status === "connected" ? folderName : status === "needs-permission" ? "Renew access" : status === "none" ? "Browser only" : status === "unsupported" ? "Browser only" : "Save error";
  return (
    <Tip
      content={
        <div className="space-y-1">
          {status === "connected" && (
            <>
              <div>Data is saved in the folder “{folderName}” ({DATA_FILE} + trades.csv).</div>
              <div className="text-muted">Last saved: {lastSavedAt ? ago((now - lastSavedAt) / 1000) : "–"}</div>
            </>
          )}
          {status === "needs-permission" && <div>The browser needs your permission to write to “{folderName}” again. Click to allow.</div>}
          {status === "none" && <div>Data is only stored in the browser. Pick a folder on your computer in Settings.</div>}
          {status === "unsupported" && <div>This browser can’t save to a folder (Chrome/Edge only). Data stays in the browser – export regularly.</div>}
          {lastError && <div className="text-neg">{lastError}</div>}
        </div>
      }
    >
      {status === "needs-permission" ? (
        <button type="button" onClick={() => void useFolderStore.getState().reconnect()} className={cn("flex items-center gap-1.5 rounded-full border border-warn/50 bg-surface px-2.5 py-1 text-xs", tone)} data-testid="folder-status">
          <FolderSyncIcon className="size-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ) : (
        <Link href="/settings#storage" className={cn("flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs", tone)} data-testid="folder-status">
          {status === "connected" ? <FolderOpen className={cn("size-3.5", saving && "animate-pulse")} /> : <HardDrive className="size-3.5" />}
          <span className="hidden max-w-32 truncate sm:inline">{label}</span>
        </Link>
      )}
    </Tip>
  );
}

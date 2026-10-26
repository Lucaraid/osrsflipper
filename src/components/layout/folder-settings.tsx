"use client";
import { FolderOpen, FolderSync, Save, Unplug } from "lucide-react";
import { ErrorNote, InfoNote } from "@/components/common/indicators";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { useNow } from "@/hooks/use-now";
import { ago } from "@/lib/format";
import { CSV_FILE, DATA_FILE } from "@/lib/storage/folder";
import { useFolderStore } from "@/state/folder";

export function FolderSettingsCard() {
  const { status, folderName, lastSavedAt, lastError, saving, connect, reconnect, disconnect, saveNow } = useFolderStore();
  const now = useNow(10_000);
  return (
    <Card id="storage" className="lg:col-span-2">
      <CardHeader title="Where your trades are saved" description="Save your trades in a folder of your choice on your computer (e.g. D:\OSRS\Trades or a OneDrive/Dropbox folder)." />
      <CardBody className="space-y-3 text-sm">
        {status === "unsupported" && (
          <InfoNote tone="warn">
            This browser can’t save to a folder of your choice. Please use <b>Google Chrome</b> or <b>Microsoft Edge</b>. Until then your data stays in browser storage (export/import below).
          </InfoNote>
        )}
        {status === "none" && <p className="text-muted">Your data is currently only stored in this browser.</p>}
        {status === "connected" && (
          <div className="flex flex-wrap items-center gap-2" data-testid="folder-connected">
            <FolderOpen className="size-4 text-pos" />
            <span>
              Connected to folder <b>“{folderName}”</b> · last saved {lastSavedAt ? ago((now - lastSavedAt) / 1000) : "–"}
              {saving ? " · saving…" : ""}
            </span>
          </div>
        )}
        {status === "needs-permission" && (
          <InfoNote tone="warn">
            Folder “{folderName}” is selected, but after a restart the browser needs your permission to access it again. Until then nothing is saved to the folder.
          </InfoNote>
        )}
        {lastError && <ErrorNote>{lastError}</ErrorNote>}

        <div className="flex flex-wrap gap-2">
          {status !== "unsupported" && (
            <Button variant={status === "connected" ? "outline" : "primary"} onClick={() => void connect()} data-testid="folder-pick">
              <FolderOpen /> {status === "connected" ? "Choose another folder" : "Choose folder"}
            </Button>
          )}
          {status === "needs-permission" && (
            <Button variant="primary" onClick={() => void reconnect()}>
              <FolderSync /> Allow access
            </Button>
          )}
          {status === "error" && folderName && (
            <Button variant="outline" onClick={() => void reconnect()}>
              <FolderSync /> Try again
            </Button>
          )}
          {status === "connected" && (
            <Button variant="outline" onClick={() => void saveNow()}>
              <Save /> Save now
            </Button>
          )}
          {(status === "connected" || status === "needs-permission" || status === "error") && folderName && (
            <Button variant="ghost" onClick={() => void disconnect()}>
              <Unplug /> Disconnect folder
            </Button>
          )}
        </div>
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted">
          <li>
            <code>{DATA_FILE}</code> – all trades, capital entries, watchlist and settings. Updated automatically on every change and loaded on start.
          </li>
          <li>
            <code>{CSV_FILE}</code> – readable list of all buys/sells with tax and realised profit (for Excel). Output only – edits in it are not read back.
          </li>
          <li>If the folder is in OneDrive/Dropbox you can use the same data on several PCs (don’t edit at the same time).</li>
          <li>Works in Chrome and Edge. After a restart Chrome may ask for access again – choose “Allow on every visit” to skip that.</li>
        </ul>
      </CardBody>
    </Card>
  );
}

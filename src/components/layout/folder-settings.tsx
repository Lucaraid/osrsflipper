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
    <Card id="speicherort" className="lg:col-span-2">
      <CardHeader title="Speicherort für Trades & Daten" description="Speichere deine Trades in einem Ordner deiner Wahl auf deinem Computer (z. B. D:\OSRS\Trades oder ein OneDrive-/Dropbox-Ordner)." />
      <CardBody className="space-y-3 text-sm">
        {status === "unsupported" && (
          <InfoNote tone="warn">
            Dieser Browser unterstützt das Speichern in einem eigenen Ordner nicht. Bitte <b>Google Chrome</b> oder <b>Microsoft Edge</b> verwenden. Bis dahin liegen die Daten im Browser-Speicher (Export/Import unten).
          </InfoNote>
        )}
        {status === "none" && <p className="text-muted">Aktuell werden die Daten nur im Speicher dieses Browsers abgelegt.</p>}
        {status === "connected" && (
          <div className="flex flex-wrap items-center gap-2" data-testid="folder-connected">
            <FolderOpen className="size-4 text-pos" />
            <span>
              Verbunden mit Ordner <b>„{folderName}“</b> · zuletzt gespeichert {lastSavedAt ? ago((now - lastSavedAt) / 1000) : "–"}
              {saving ? " · speichert…" : ""}
            </span>
          </div>
        )}
        {status === "needs-permission" && (
          <InfoNote tone="warn">
            Ordner „{folderName}“ ist gewählt, aber der Browser braucht nach einem Neustart deine Bestätigung, um wieder darauf zuzugreifen. Bis dahin wird nicht im Ordner gespeichert.
          </InfoNote>
        )}
        {lastError && <ErrorNote>{lastError}</ErrorNote>}

        <div className="flex flex-wrap gap-2">
          {status !== "unsupported" && (
            <Button variant={status === "connected" ? "outline" : "primary"} onClick={() => void connect()} data-testid="folder-pick">
              <FolderOpen /> {status === "connected" ? "Anderen Ordner wählen" : "Ordner wählen"}
            </Button>
          )}
          {status === "needs-permission" && (
            <Button variant="primary" onClick={() => void reconnect()}>
              <FolderSync /> Zugriff erlauben
            </Button>
          )}
          {status === "error" && folderName && (
            <Button variant="outline" onClick={() => void reconnect()}>
              <FolderSync /> Erneut versuchen
            </Button>
          )}
          {status === "connected" && (
            <Button variant="outline" onClick={() => void saveNow()}>
              <Save /> Jetzt speichern
            </Button>
          )}
          {(status === "connected" || status === "needs-permission" || status === "error") && folderName && (
            <Button variant="ghost" onClick={() => void disconnect()}>
              <Unplug /> Ordner trennen
            </Button>
          )}
        </div>
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted">
          <li>
            <code>{DATA_FILE}</code> – alle Trades, Kapitalbuchungen, Watchlist, Alarme und Einstellungen. Wird bei jeder Änderung automatisch aktualisiert und beim Start geladen.
          </li>
          <li>
            <code>{CSV_FILE}</code> – lesbare Liste aller Käufe/Verkäufe mit Steuer und realisiertem Gewinn (für Excel). Nur Ausgabe – Änderungen darin werden nicht eingelesen.
          </li>
          <li>Liegt der Ordner in OneDrive/Dropbox, kannst du dieselben Daten auf mehreren PCs nutzen (nicht gleichzeitig bearbeiten).</li>
          <li>Funktioniert in Chrome und Edge. Chrome fragt nach einem Neustart evtl. erneut nach Zugriff – „Bei jedem Besuch erlauben“ wählen, dann entfällt das.</li>
        </ul>
      </CardBody>
    </Card>
  );
}

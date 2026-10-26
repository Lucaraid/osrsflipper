"use client";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="py-16 text-center">
      <h1 className="text-lg font-semibold">Unerwarteter Fehler</h1>
      <p className="mt-1 text-sm text-muted">Die Seite konnte nicht angezeigt werden. Deine lokal gespeicherten Daten sind davon nicht betroffen.</p>
      <Button className="mt-3" onClick={reset}>Erneut versuchen</Button>
    </div>
  );
}

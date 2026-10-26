"use client";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/** Bestätigungsdialog (statt Browser-confirm) */
export function Confirm({ trigger, title, text, confirmLabel = "Löschen", onConfirm }: { trigger: (open: () => void) => ReactNode; title: string; text: ReactNode; confirmLabel?: string; onConfirm: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {trigger(() => setOpen(true))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={title}>
          <div className="text-sm text-muted">{text}</div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="danger"
              data-testid="confirm-button"
              onClick={async () => {
                await onConfirm();
                setOpen(false);
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";
import { Delete, Lightbulb } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { gameStatus, keyboardStates, MAX_GUESSES, MAX_HINTS, scoreGuess, WORD_LENGTH, type LetterState } from "@/lib/wordle/game";
import { cn } from "@/lib/utils";
import { useLimiterStore } from "@/state/limiter";
import { useSettings } from "@/state/settings";

const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

const STATE_CLASS: Record<LetterState, string> = {
  hit: "border-tile-hit bg-tile-hit text-tile-fg",
  present: "border-tile-present bg-tile-present text-tile-fg",
  miss: "border-tile-miss bg-tile-miss text-tile-fg",
};

/** Wordle-Rätsel, das angehaltene API-Anfragen wieder freigibt (siehe state/limiter.ts). */
export function WordleGate() {
  const cfg = useSettings().requestLimiter;
  const challenge = useLimiterStore((s) => s.challenge);
  const hydrate = useLimiterStore((s) => s.hydrate);
  const guess = useLimiterStore((s) => s.guess);
  const hint = useLimiterStore((s) => s.hint);
  const next = useLimiterStore((s) => s.next);
  const release = useLimiterStore((s) => s.release);
  const pathname = usePathname();
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => hydrate(), [hydrate]);

  // Auf der Einstellungsseite nicht anzeigen, damit man den Limiter dort jederzeit abschalten kann
  // (Anfragen bleiben trotzdem angehalten, bis das Rätsel gelöst oder der Limiter aus ist).
  const open = cfg.enabled && challenge != null && pathname !== "/settings";
  const status = challenge ? gameStatus(challenge.guesses, challenge.answer) : "playing";

  const press = useCallback(
    (key: string) => {
      setMsg(null);
      if (status === "won") {
        if (key === "ENTER") release();
        return;
      }
      if (status === "lost") {
        if (key === "ENTER") {
          next();
          setDraft("");
        }
        return;
      }
      if (key === "BACKSPACE") setDraft((d) => d.slice(0, -1));
      else if (key === "ENTER") {
        if (draft.length < WORD_LENGTH) setMsg("Not enough letters");
        else if (guess(draft)) setDraft("");
      } else if (/^[A-Z]$/.test(key)) setDraft((d) => (d.length < WORD_LENGTH ? d + key : d));
    },
    [status, draft, guess, next, release],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toUpperCase();
      if (key === "ENTER" || key === "BACKSPACE" || /^[A-Z]$/.test(key)) {
        // verhindert, dass Enter zusätzlich den fokussierten Button auslöst
        e.preventDefault();
        press(key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, press]);

  if (!challenge) return null;
  const keys = keyboardStates(challenge.guesses, challenge.answer);

  return (
    <Dialog open={open}>
      <DialogContent
        dismissible={false}
        title="Time for a Wordle!"
        description={`Live data is paused after ${cfg.requestsPerPuzzle} requests to the market API. Guess the 5-letter word in ${MAX_GUESSES} tries to resume.`}
        className="max-w-sm"
        data-testid="wordle-gate"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex gap-1" aria-label="Revealed letters" data-testid="wordle-hints">
            {Array.from({ length: WORD_LENGTH }, (_, i) => {
              const revealed = challenge.hints.includes(i);
              return (
                <span
                  key={i}
                  data-testid={`wordle-hint-${i}`}
                  className={cn(
                    "flex size-6 items-center justify-center rounded border text-xs font-bold",
                    revealed ? STATE_CLASS.hit : "border-dashed border-border text-faint",
                  )}
                >
                  {revealed ? challenge.answer[i] : "?"}
                </span>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setMsg(null);
              if (!hint()) setMsg("No more hints for this word");
            }}
            disabled={status !== "playing" || challenge.hints.length >= MAX_HINTS}
            data-testid="wordle-hint"
          >
            <Lightbulb /> Hint ({MAX_HINTS - challenge.hints.length} left)
          </Button>
        </div>
        <div className="mx-auto grid w-fit gap-1.5" role="grid" aria-label="Wordle board">
          {Array.from({ length: MAX_GUESSES }, (_, r) => {
            const word = challenge.guesses[r];
            const scored = word ? scoreGuess(word, challenge.answer) : null;
            const letters = word ?? (r === challenge.guesses.length && status === "playing" ? draft : "");
            return (
              <div key={r} className="grid grid-cols-5 gap-1.5" role="row">
                {Array.from({ length: WORD_LENGTH }, (_, c) => {
                  const state = scored?.[c];
                  const ch = letters[c] ?? "";
                  return (
                    <div
                      key={c}
                      role="gridcell"
                      data-testid={`wordle-tile-${r}-${c}`}
                      data-state={state ?? (ch ? "draft" : "empty")}
                      aria-label={ch ? `${ch}${state ? ` ${state}` : ""}` : "empty"}
                      className={cn(
                        "flex size-11 items-center justify-center rounded-md border-2 text-xl font-extrabold uppercase",
                        state ? STATE_CLASS[state] : ch ? "border-border-strong bg-surface-2" : "border-border bg-surface-2/50",
                      )}
                    >
                      {ch}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="mt-3 min-h-6 text-center text-sm font-semibold" aria-live="polite" data-testid="wordle-message">
          {status === "won" && <span className="text-pos">Solved in {challenge.guesses.length}/{MAX_GUESSES}! Requests can resume.</span>}
          {status === "lost" && (
            <span className="text-neg">
              Out of tries – the word was <span data-testid="wordle-answer">{challenge.answer}</span>.
            </span>
          )}
          {status === "playing" && msg && <span className="text-warn">{msg}</span>}
        </div>

        {status === "playing" ? (
          <div className="mt-2 space-y-1.5" aria-label="Keyboard">
            {KEY_ROWS.map((row, i) => (
              <div key={row} className="flex justify-center gap-1">
                {i === 2 && (
                  <button type="button" onClick={() => press("ENTER")} className="h-11 rounded-md bg-surface-3 px-2 text-xs font-bold hover:bg-border" data-testid="wordle-enter">
                    ENTER
                  </button>
                )}
                {[...row].map((k) => {
                  const s = keys.get(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => press(k)}
                      data-testid={`wordle-key-${k}`}
                      data-state={s ?? "unused"}
                      className={cn("h-11 w-7 rounded-md text-sm font-bold sm:w-8", s ? STATE_CLASS[s] : "bg-surface-3 hover:bg-border")}
                    >
                      {k}
                    </button>
                  );
                })}
                {i === 2 && (
                  <button type="button" onClick={() => press("BACKSPACE")} className="flex h-11 items-center rounded-md bg-surface-3 px-2 hover:bg-border" aria-label="Backspace" data-testid="wordle-backspace">
                    <Delete className="size-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 flex justify-center">
            {status === "won" ? (
              <Button variant="primary" onClick={release} data-testid="wordle-continue">Continue</Button>
            ) : (
              <Button variant="primary" onClick={() => press("ENTER")} data-testid="wordle-new">New puzzle</Button>
            )}
          </div>
        )}

        <p className="mt-3 border-t border-border pt-2 text-center text-[11px] text-faint">
          Not in the mood?{" "}
          <Link href="/settings" className="underline hover:text-muted" data-testid="wordle-settings-link">
            Turn the limiter off in Settings
          </Link>{" "}
          – live data stays paused until you do.
        </p>
      </DialogContent>
    </Dialog>
  );
}

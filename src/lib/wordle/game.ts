import { ANSWERS } from "./words";

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

/** hit = richtiger Buchstabe am richtigen Platz (grün), present = kommt vor (gelb), miss = kommt nicht (mehr) vor (rot) */
export type LetterState = "hit" | "present" | "miss";
export type GameStatus = "playing" | "won" | "lost";

/** Eingabe normalisieren; null, wenn es keine 5 Buchstaben A–Z sind. */
export function normalizeGuess(input: string): string | null {
  const w = input.trim().toUpperCase();
  return new RegExp(`^[A-Z]{${WORD_LENGTH}}$`).test(w) ? w : null;
}

/**
 * Bewertet einen Versuch wie das Original: zuerst Treffer am richtigen Platz,
 * danach „kommt vor“ nur so oft, wie der Buchstabe in der Lösung noch übrig ist
 * (doppelte Buchstaben werden nicht mehrfach gelb).
 */
export function scoreGuess(guess: string, answer: string): LetterState[] {
  const result: LetterState[] = Array.from({ length: guess.length }, () => "miss");
  const remaining = new Map<string, number>();
  for (let i = 0; i < answer.length; i++) {
    const a = answer[i]!;
    if (guess[i] === a) result[i] = "hit";
    else remaining.set(a, (remaining.get(a) ?? 0) + 1);
  }
  for (let i = 0; i < guess.length; i++) {
    if (result[i] === "hit") continue;
    const g = guess[i]!;
    const left = remaining.get(g) ?? 0;
    if (left > 0) {
      result[i] = "present";
      remaining.set(g, left - 1);
    }
  }
  return result;
}

export function gameStatus(guesses: readonly string[], answer: string): GameStatus {
  if (guesses.includes(answer)) return "won";
  return guesses.length >= MAX_GUESSES ? "lost" : "playing";
}

const RANK: Record<LetterState, number> = { miss: 0, present: 1, hit: 2 };

/** Bester bekannter Zustand je Buchstabe für die Bildschirmtastatur. */
export function keyboardStates(guesses: readonly string[], answer: string): Map<string, LetterState> {
  const map = new Map<string, LetterState>();
  for (const g of guesses) {
    scoreGuess(g, answer).forEach((s, i) => {
      const ch = g[i]!;
      const prev = map.get(ch);
      if (!prev || RANK[s] > RANK[prev]) map.set(ch, s);
    });
  }
  return map;
}

export const MAX_HINTS = 2;

/**
 * Tipp: zufällige Position, deren Buchstabe noch nicht bekannt ist (weder grün geraten noch schon verraten).
 * null, wenn alle Tipps verbraucht sind oder nichts mehr zu verraten ist.
 */
export function pickHint(guesses: readonly string[], answer: string, hints: readonly number[], random: () => number = Math.random): number | null {
  if (hints.length >= MAX_HINTS) return null;
  const known = new Set(hints);
  for (const g of guesses) scoreGuess(g, answer).forEach((s, i) => s === "hit" && known.add(i));
  const open = Array.from({ length: answer.length }, (_, i) => i).filter((i) => !known.has(i));
  if (open.length === 0) return null;
  return open[Math.floor(random() * open.length) % open.length]!;
}

/** Zufälliges Lösungswort; `exclude` verhindert, dass nach einer Niederlage dasselbe Wort kommt. */
export function pickAnswer(random: () => number = Math.random, exclude?: string): string {
  const pool = exclude ? ANSWERS.filter((w) => w !== exclude) : ANSWERS;
  return pool[Math.floor(random() * pool.length) % pool.length]!;
}

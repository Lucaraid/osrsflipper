"use client";
import { z } from "zod";
import { create } from "zustand";
import { gameStatus, MAX_GUESSES, MAX_HINTS, normalizeGuess, pickAnswer, pickHint } from "@/lib/wordle/game";
import { useSettingsStore } from "./settings";

/**
 * Anfrage-Limiter: Nach `requestsPerPuzzle` Anfragen an die eigenen API-Routen werden weitere
 * Anfragen angehalten, bis ein Wordle gelöst ist. Zähler und laufendes Rätsel liegen in localStorage,
 * damit ein Neuladen der Seite das Rätsel nicht überspringt.
 */
export const LIMITER_KEY = "osrs-ge-flipper:limiter:v1";

const WordSchema = z.string().regex(/^[A-Z]{5}$/);
const ChallengeSchema = z.object({
  answer: WordSchema,
  guesses: z.array(WordSchema).max(MAX_GUESSES),
  /** Verratene Positionen (Tipps) */
  hints: z.array(z.number().int().min(0).max(4)).max(MAX_HINTS).default([]),
});
const PersistedSchema = z.object({
  count: z.number().int().nonnegative().default(0),
  challenge: ChallengeSchema.nullable().default(null),
});
export type Challenge = z.infer<typeof ChallengeSchema>;

interface LimiterState {
  /** Anfragen seit dem letzten gelösten Rätsel */
  count: number;
  /** Aktives Rätsel; solange gesetzt, sind Anfragen angehalten */
  challenge: Challenge | null;
  hydrated: boolean;
  hydrate: () => void;
  increment: () => void;
  start: () => void;
  /** Gibt false zurück, wenn der Versuch ungültig ist oder das Spiel schon vorbei ist. */
  guess: (input: string) => boolean;
  /** Verrät einen weiteren Buchstaben; false, wenn keine Tipps mehr übrig sind. */
  hint: () => boolean;
  /** Nach einer Niederlage: neues Rätsel mit anderem Wort */
  next: () => void;
  /** Nach einem Sieg: Zähler zurücksetzen und Anfragen freigeben */
  release: () => void;
  /** Limiter abgeschaltet: Zähler und Rätsel verwerfen */
  reset: () => void;
}

const storage = () => (typeof localStorage !== "undefined" ? localStorage : null);

function load(): z.infer<typeof PersistedSchema> {
  try {
    const raw = storage()?.getItem(LIMITER_KEY);
    const r = raw ? PersistedSchema.safeParse(JSON.parse(raw)) : null;
    if (r?.success) return r.data;
  } catch {
    /* defekt → neu beginnen */
  }
  return { count: 0, challenge: null };
}

function save(s: Pick<LimiterState, "count" | "challenge">) {
  try {
    storage()?.setItem(LIMITER_KEY, JSON.stringify({ count: s.count, challenge: s.challenge }));
  } catch {
    /* Speicher gesperrt – Zustand bleibt für diese Sitzung im Speicher */
  }
}

export const useLimiterStore = create<LimiterState>((set, get) => {
  const commit = (patch: Partial<Pick<LimiterState, "count" | "challenge">>) => {
    set(patch);
    save(get());
  };
  return {
    count: 0,
    challenge: null,
    hydrated: false,
    hydrate: () => {
      if (get().hydrated) return;
      set({ ...load(), hydrated: true });
    },
    increment: () => commit({ count: get().count + 1 }),
    start: () => {
      if (!get().challenge) commit({ challenge: { answer: pickAnswer(), guesses: [], hints: [] } });
    },
    hint: () => {
      const c = get().challenge;
      if (!c || gameStatus(c.guesses, c.answer) !== "playing") return false;
      const pos = pickHint(c.guesses, c.answer, c.hints);
      if (pos == null) return false;
      commit({ challenge: { ...c, hints: [...c.hints, pos] } });
      return true;
    },
    guess: (input) => {
      const c = get().challenge;
      const word = normalizeGuess(input);
      if (!c || !word || gameStatus(c.guesses, c.answer) !== "playing") return false;
      commit({ challenge: { ...c, guesses: [...c.guesses, word] } });
      return true;
    },
    next: () => {
      const c = get().challenge;
      if (c && gameStatus(c.guesses, c.answer) === "lost") commit({ challenge: { answer: pickAnswer(Math.random, c.answer), guesses: [], hints: [] } });
    },
    release: () => {
      const c = get().challenge;
      if (c && gameStatus(c.guesses, c.answer) === "won") commit({ count: 0, challenge: null });
    },
    reset: () => commit({ count: 0, challenge: null }),
  };
});

function limiterConfig() {
  return useSettingsStore.getState().settings.requestLimiter;
}

function waitForRelease(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const unsubs: (() => void)[] = [];
    const cleanup = () => {
      unsubs.forEach((u) => u());
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(signal?.reason);
    };
    const check = () => {
      if (!limiterConfig().enabled || !useLimiterStore.getState().challenge) {
        cleanup();
        resolve();
      }
    };
    unsubs.push(useLimiterStore.subscribe(check), useSettingsStore.subscribe(check));
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Vor jeder Anfrage an die eigenen API-Routen aufrufen. Löst sofort auf, solange das Kontingent reicht;
 * sonst wird ein Rätsel gestartet und gewartet, bis es gelöst (oder der Limiter abgeschaltet) ist.
 */
export async function acquireRequest(signal?: AbortSignal): Promise<void> {
  useSettingsStore.getState().hydrate();
  useLimiterStore.getState().hydrate();
  const store = useLimiterStore.getState();
  const cfg = limiterConfig();
  if (!cfg.enabled) return;
  if (!store.challenge && store.count < cfg.requestsPerPuzzle) {
    store.increment();
    return;
  }
  store.start();
  await waitForRelease(signal);
  if (limiterConfig().enabled) useLimiterStore.getState().increment();
}

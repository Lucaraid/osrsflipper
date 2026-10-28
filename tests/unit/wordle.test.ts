import { beforeEach, describe, expect, it } from "vitest";
import { gameStatus, keyboardStates, MAX_GUESSES, MAX_HINTS, normalizeGuess, pickAnswer, pickHint, scoreGuess } from "@/lib/wordle/game";
import { ANSWERS } from "@/lib/wordle/words";
import { acquireRequest, useLimiterStore } from "@/state/limiter";
import { useSettingsStore } from "@/state/settings";

describe("Wordle – Wortliste", () => {
  it("enthält nur eindeutige Wörter mit 5 Grossbuchstaben", () => {
    expect(ANSWERS.length).toBeGreaterThan(100);
    for (const w of ANSWERS) expect(w).toMatch(/^[A-Z]{5}$/);
    expect(new Set(ANSWERS).size).toBe(ANSWERS.length);
  });

  it("pickAnswer liefert Wörter aus der Liste und schliesst das alte Wort aus", () => {
    expect(ANSWERS).toContain(pickAnswer(() => 0.5));
    const first = ANSWERS[0]!;
    expect(pickAnswer(() => 0, first)).not.toBe(first);
    expect(ANSWERS).toContain(pickAnswer(() => 0.999999));
  });
});

describe("Wordle – Bewertung", () => {
  it("normalisiert Eingaben und lehnt Ungültiges ab", () => {
    expect(normalizeGuess(" crane ")).toBe("CRANE");
    expect(normalizeGuess("cran")).toBeNull();
    expect(normalizeGuess("cran3")).toBeNull();
    expect(normalizeGuess("cranes")).toBeNull();
  });

  it("grün / gelb / rot", () => {
    expect(scoreGuess("CRANE", "CRANE")).toEqual(["hit", "hit", "hit", "hit", "hit"]);
    expect(scoreGuess("NACRE", "CRANE")).toEqual(["present", "present", "present", "present", "hit"]);
    expect(scoreGuess("BUILT", "CRANE")).toEqual(["miss", "miss", "miss", "miss", "miss"]);
  });

  it("doppelte Buchstaben werden nur so oft markiert, wie sie in der Lösung vorkommen", () => {
    // Lösung hat ein E: das E am richtigen Platz ist grün, das zweite rot
    expect(scoreGuess("EERIE", "CRANE")).toEqual(["miss", "miss", "present", "miss", "hit"]);
    // Lösung hat ein L, das schon grün ist: das andere L bleibt rot
    expect(scoreGuess("LLAMA", "PLANT")).toEqual(["miss", "hit", "hit", "miss", "miss"]);
    // Lösung hat zwei L: beide werden gelb
    expect(scoreGuess("LLAMA", "HELLO")).toEqual(["present", "present", "miss", "miss", "miss"]);
    expect(scoreGuess("SPEED", "ABIDE")).toEqual(["miss", "miss", "present", "miss", "present"]);
  });

  it("Spielstatus: gewonnen, verloren nach 6 Versuchen, sonst laufend", () => {
    expect(gameStatus([], "CRANE")).toBe("playing");
    expect(gameStatus(["BUILT", "CRANE"], "CRANE")).toBe("won");
    expect(gameStatus(Array(MAX_GUESSES).fill("BUILT"), "CRANE")).toBe("lost");
    expect(gameStatus(Array(MAX_GUESSES - 1).fill("BUILT"), "CRANE")).toBe("playing");
  });

  it("Tastatur zeigt den besten bekannten Zustand je Buchstabe", () => {
    const k = keyboardStates(["NACRE", "CRANE"], "CRANE");
    expect(k.get("C")).toBe("hit");
    expect(k.get("N")).toBe("hit");
    expect(keyboardStates(["BUILT"], "CRANE").get("B")).toBe("miss");
  });
});

describe("Wordle – Tipps", () => {
  it("verrät nur unbekannte Positionen und höchstens MAX_HINTS", () => {
    // C, R, A schon grün geraten → nur Position 3 oder 4 möglich
    for (const r of [0, 0.5, 0.99]) expect([3, 4]).toContain(pickHint(["CRABS"], "CRANE", [], () => r));
    expect(pickHint(["CRABS"], "CRANE", [3])).toBe(4);
    expect(pickHint([], "CRANE", Array.from({ length: MAX_HINTS }, (_, i) => i))).toBeNull();
    expect(pickHint(["CRANE"], "CRANE", [])).toBeNull();
  });
});

describe("Anfrage-Limiter", () => {
  const settings = useSettingsStore.getState();
  beforeEach(() => {
    settings.hydrate();
    settings.update({ requestLimiter: { enabled: true, requestsPerPuzzle: 5 } });
    useLimiterStore.setState({ count: 0, challenge: null, hydrated: true });
  });

  const solve = () => {
    const { challenge, guess, release } = useLimiterStore.getState();
    guess(challenge!.answer);
    release();
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it("lässt Anfragen bis zum Kontingent durch und hält danach an, bis das Rätsel gelöst ist", async () => {
    for (let i = 0; i < 5; i++) await acquireRequest();
    expect(useLimiterStore.getState().count).toBe(5);
    expect(useLimiterStore.getState().challenge).toBeNull();

    let done = false;
    const pending = acquireRequest().then(() => (done = true));
    await tick();
    expect(done).toBe(false);
    expect(useLimiterStore.getState().challenge).not.toBeNull();

    solve();
    await pending;
    expect(done).toBe(true);
    expect(useLimiterStore.getState().challenge).toBeNull();
    expect(useLimiterStore.getState().count).toBe(1);
  });

  it("nach einer Niederlage gibt es ein neues Rätsel, Anfragen bleiben angehalten", async () => {
    useLimiterStore.setState({ count: 5 });
    let done = false;
    const pending = acquireRequest().then(() => (done = true));
    const { answer } = useLimiterStore.getState().challenge!;
    const wrong = answer === "BUILT" ? "CRANE" : "BUILT";
    for (let i = 0; i < MAX_GUESSES; i++) expect(useLimiterStore.getState().guess(wrong)).toBe(true);
    expect(useLimiterStore.getState().guess(wrong)).toBe(false);
    useLimiterStore.getState().release(); // verloren → keine Freigabe
    useLimiterStore.getState().next();
    const c = useLimiterStore.getState().challenge!;
    expect(c.guesses).toEqual([]);
    expect(c.answer).not.toBe(answer);
    await tick();
    expect(done).toBe(false);
    solve();
    await pending;
    expect(done).toBe(true);
  });

  it("Tipps werden gespeichert und sind begrenzt", () => {
    useLimiterStore.setState({ challenge: { answer: "CRANE", guesses: [], hints: [] } });
    for (let i = 0; i < MAX_HINTS; i++) expect(useLimiterStore.getState().hint()).toBe(true);
    expect(useLimiterStore.getState().hint()).toBe(false);
    const { hints } = useLimiterStore.getState().challenge!;
    expect(hints).toHaveLength(MAX_HINTS);
    expect(new Set(hints).size).toBe(MAX_HINTS);
  });

  it("reset verwirft Zähler und Rätsel und gibt wartende Anfragen frei", async () => {
    useLimiterStore.setState({ count: 5 });
    const pending = acquireRequest();
    expect(useLimiterStore.getState().challenge).not.toBeNull();
    useLimiterStore.getState().reset();
    await pending;
    expect(useLimiterStore.getState().challenge).toBeNull();
    expect(useLimiterStore.getState().count).toBe(1);
  });

  it("ungültige Versuche zählen nicht", () => {
    useLimiterStore.setState({ challenge: { answer: "CRANE", guesses: [], hints: [] } });
    expect(useLimiterStore.getState().guess("abc")).toBe(false);
    expect(useLimiterStore.getState().guess("cr4ne")).toBe(false);
    expect(useLimiterStore.getState().challenge!.guesses).toEqual([]);
  });

  it("abgeschaltet: keine Zählung, wartende Anfragen werden freigegeben", async () => {
    useLimiterStore.setState({ count: 5 });
    const pending = acquireRequest();
    await tick();
    settings.update({ requestLimiter: { enabled: false, requestsPerPuzzle: 5 } });
    await pending;
    await acquireRequest();
    expect(useLimiterStore.getState().count).toBe(5);
  });

  it("Abbruch während des Wartens weist die Anfrage zurück", async () => {
    useLimiterStore.setState({ count: 5 });
    const ctrl = new AbortController();
    const pending = acquireRequest(ctrl.signal);
    ctrl.abort(new Error("aborted"));
    await expect(pending).rejects.toThrow("aborted");
  });
});

import { describe, expect, it } from "vitest";
import { getVersionInfo, gitCandidates, isLoopbackHost, isSameOrigin, pullLatest, updateDisabledReason, type GitRunner } from "@/lib/update/git";

/** Simulierter Git-Aufruf: Antworten je Befehl, HEAD wechselt nach `pull`. */
function fakeGit(opts: { before: string; after: string; files?: string[]; log?: string[] }) {
  const calls: string[][] = [];
  let head = opts.before;
  const run: GitRunner = async (args) => {
    calls.push(args);
    switch (args[0]) {
      case "rev-parse":
        return head;
      case "pull":
        head = opts.after;
        return opts.before === opts.after ? "Already up to date." : "Fast-forward";
      case "diff":
        return (opts.files ?? []).join("\n");
      case "log":
        return (opts.log ?? []).join("\n");
      default:
        throw new Error(`unexpected git ${args.join(" ")}`);
    }
  };
  return { run, calls };
}

describe("App-Update: Freigabe", () => {
  it("nur localhost / 127.x / ::1", () => {
    expect(isLoopbackHost("localhost:3000")).toBe(true);
    expect(isLoopbackHost("127.0.0.1:3100")).toBe(true);
    expect(isLoopbackHost("[::1]:3000")).toBe(true);
    expect(isLoopbackHost("192.168.1.20:3000")).toBe(false);
    expect(isLoopbackHost("localhost.evil.com")).toBe(false);
    expect(isLoopbackHost("127.0.0.1.nip.io")).toBe(false);
    expect(isLoopbackHost(null)).toBe(false);
  });

  it("POST nur mit passendem Origin", () => {
    expect(isSameOrigin(new Headers({ host: "localhost:3000", origin: "http://localhost:3000" }))).toBe(true);
    expect(isSameOrigin(new Headers({ host: "localhost:3000", origin: "http://evil.example" }))).toBe(false);
    expect(isSameOrigin(new Headers({ host: "localhost:3000" }))).toBe(false);
    expect(isSameOrigin(new Headers({ host: "localhost:3000", origin: "null" }))).toBe(false);
  });

  it("abschaltbar per SELF_UPDATE und auf Vercel aus", () => {
    expect(updateDisabledReason({})).toBeNull();
    expect(updateDisabledReason({ SELF_UPDATE: "1" })).toBeNull();
    expect(updateDisabledReason({ SELF_UPDATE: "0" })).toMatch(/SELF_UPDATE/);
    expect(updateDisabledReason({ SELF_UPDATE: "off" })).toMatch(/SELF_UPDATE/);
    expect(updateDisabledReason({ VERCEL: "1" })).toMatch(/hosted/);
  });

  it("Git-Programm: GIT_PATH zuerst, unter Windows Standardpfad als Fallback", () => {
    expect(gitCandidates({}, "linux")).toEqual(["git"]);
    expect(gitCandidates({ GIT_PATH: "/opt/git" }, "linux")).toEqual(["/opt/git", "git"]);
    expect(gitCandidates({ ProgramFiles: "C:\\Program Files" }, "win32")).toEqual(["git", "C:\\Program Files\\Git\\cmd\\git.exe"]);
  });
});

describe("App-Update: git pull", () => {
  it("bereits aktuell → keine weiteren Befehle", async () => {
    const g = fakeGit({ before: "aaa", after: "aaa" });
    const r = await pullLatest(g.run, false);
    expect(r).toMatchObject({ updated: false, output: "Already up to date.", needsInstall: false, needsRestart: false });
    expect(g.calls.map((c) => c[0])).toEqual(["rev-parse", "pull", "rev-parse"]);
    expect(g.calls[1]).toEqual(["pull", "--ff-only"]);
  });

  it("neue Commits ohne Abhängigkeiten → Hot Reload reicht im Dev-Modus", async () => {
    const g = fakeGit({ before: "aaa", after: "bbb", files: ["src/app/page.tsx"], log: ["bbb1234 Neue Funktion"] });
    const r = await pullLatest(g.run, false);
    expect(r).toMatchObject({ updated: true, from: "aaa", to: "bbb", commits: ["bbb1234 Neue Funktion"], needsInstall: false, needsRestart: false });
  });

  it("package-lock.json geändert → npm install + Neustart", async () => {
    const g = fakeGit({ before: "aaa", after: "bbb", files: ["package-lock.json", "src/x.ts"] });
    const r = await pullLatest(g.run, false);
    expect(r.needsInstall).toBe(true);
    expect(r.needsRestart).toBe(true);
  });

  it("Produktionsserver braucht immer Build + Neustart", async () => {
    const g = fakeGit({ before: "aaa", after: "bbb", files: ["src/x.ts"] });
    expect((await pullLatest(g.run, true)).needsRestart).toBe(true);
  });

  it("Versionsinfo aus git log", async () => {
    const run: GitRunner = async (args) => (args[0] === "log" ? "dacd847\n2026-10-26T10:00:00+01:00\nGrosse Beträge" : "main");
    expect(await getVersionInfo(run)).toEqual({ branch: "main", commit: "dacd847", commitDate: "2026-10-26T10:00:00+01:00", subject: "Grosse Beträge" });
  });
});

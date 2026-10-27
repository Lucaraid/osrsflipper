import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkForUpdates, gitCandidates, GitError, nodeGitRunner, pullLatest } from "@/lib/update/git";

/** Echte Git-Repos im Temp-Ordner: „upstream“ (bare), „dev“ (pusht Commits) und „app“ (lokale Installation). */
let root = "";
const GIT =
  gitCandidates().find((bin) => {
    try {
      execFileSync(bin, ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }) ?? "git";
const git = (cwd: string, ...args: string[]) => execFileSync(GIT, args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
const ident = ["-c", "user.name=Test", "-c", "user.email=test@example.com"];

function commit(file: string, content: string, msg: string) {
  const dev = path.join(root, "dev");
  fs.writeFileSync(path.join(dev, file), content);
  git(dev, "add", ".");
  git(dev, ...ident, "commit", "-q", "-m", msg);
  git(dev, "push", "-q", "origin", "HEAD:main");
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ge-update-"));
  git(root, "init", "-q", "--bare", "-b", "main", "upstream.git");
  git(root, "clone", "-q", "upstream.git", "dev");
  git(path.join(root, "dev"), "symbolic-ref", "HEAD", "refs/heads/main");
  commit("README.md", "v1", "Erste Version");
  git(root, "clone", "-q", "-b", "main", "upstream.git", "app");
});

afterAll(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

describe("App-Update mit echtem git", () => {
  it("erkennt neue Commits und holt sie per Fast-Forward", async () => {
    const run = nodeGitRunner(path.join(root, "app"));
    expect(await checkForUpdates(run)).toEqual({ behind: 0, upstream: "origin/main" });

    commit("package.json", "{}", "Abhängigkeiten");
    expect((await checkForUpdates(run)).behind).toBe(1);

    const r = await pullLatest(run, false);
    expect(r.updated).toBe(true);
    expect(r.commits).toHaveLength(1);
    expect(r.commits[0]).toMatch(/Abhängigkeiten$/);
    expect(r.needsInstall).toBe(true);
    expect(fs.existsSync(path.join(root, "app", "package.json"))).toBe(true);

    const again = await pullLatest(run, false);
    expect(again.updated).toBe(false);
  });

  it("bricht bei abweichender lokaler Historie ab statt zu mergen", async () => {
    const app = path.join(root, "app");
    fs.writeFileSync(path.join(app, "local.txt"), "lokal");
    git(app, "add", ".");
    git(app, ...ident, "commit", "-q", "-m", "Lokale Änderung");
    commit("README.md", "v2", "Upstream-Änderung");

    const before = git(app, "rev-parse", "HEAD");
    await expect(pullLatest(nodeGitRunner(app), false)).rejects.toBeInstanceOf(GitError);
    expect(git(app, "rev-parse", "HEAD")).toBe(before);
  });

  it("überspringt fehlende Git-Programme (Fallback-Pfade)", async () => {
    const run = nodeGitRunner(path.join(root, "app"), ["git-gibt-es-nicht", GIT]);
    expect(await run(["rev-parse", "--abbrev-ref", "HEAD"])).toBe("main");
    await expect(nodeGitRunner(root, ["git-gibt-es-nicht"])(["--version"])).rejects.toMatchObject({ notInstalled: true });
  });

  it("kein Git-Klon → verständlicher Fehler", async () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), "ge-nogit-"));
    try {
      const err = await nodeGitRunner(plain)(["rev-parse", "HEAD"]).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(GitError);
      expect((err as GitError).output).toMatch(/not a git repository/i);
    } finally {
      fs.rmSync(plain, { recursive: true, force: true });
    }
  });
});

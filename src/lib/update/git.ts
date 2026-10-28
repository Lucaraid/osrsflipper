import { execFile } from "node:child_process";

/**
 * App-Update per `git pull` für lokale Installationen (Klon des Repositories).
 *
 * Sicherheit: Es werden nur fest definierte Git-Befehle ausgeführt (keine Nutzereingaben),
 * nur für Anfragen an localhost und nie auf gehosteten Deployments (Vercel) oder mit SELF_UPDATE=0.
 */

export type GitRunner = (args: string[]) => Promise<string>;

export class GitError extends Error {
  constructor(
    message: string,
    readonly output: string,
    readonly notInstalled = false,
  ) {
    super(message);
  }
}

const GIT_TIMEOUT_MS = 60_000;

/** Kandidaten für das Git-Programm: GIT_PATH, PATH, unter Windows zusätzlich der Standard-Installationsort von Git for Windows. */
export function gitCandidates(env: Record<string, string | undefined> = process.env, platform = process.platform): string[] {
  const list = [env.GIT_PATH, "git"];
  if (platform === "win32") {
    for (const base of [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA && `${env.LOCALAPPDATA}\\Programs`]) {
      if (base) list.push(`${base}\\Git\\cmd\\git.exe`);
    }
  }
  return [...new Set(list.filter((x): x is string => !!x))];
}

/** Führt `git` im Projektordner aus. Keine interaktiven Abfragen (Passwort-Prompts würden hängen). */
export function nodeGitRunner(cwd = process.cwd(), candidates = gitCandidates()): GitRunner {
  let resolved: string | null = null;
  const run: GitRunner = async (args) => {
    if (resolved) return exec(resolved, args, cwd);
    for (const bin of candidates) {
      try {
        const out = await exec(bin, args, cwd);
        resolved = bin;
        return out;
      } catch (err) {
        if (!(err instanceof GitError && err.notInstalled)) {
          resolved = bin;
          throw err;
        }
      }
    }
    throw new GitError("Git is not installed or not on PATH.", "", true);
  };
  return run;
}

function exec(bin: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      {
        cwd,
        timeout: GIT_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never", LC_ALL: "C" },
      },
      (err, stdout, stderr) => {
        const output = `${stdout}${stderr}`.trim();
        if (!err) return resolve(stdout.trim());
        const notInstalled = (err as NodeJS.ErrnoException).code === "ENOENT";
        reject(new GitError(notInstalled ? "Git is not installed or not on PATH." : `git ${args[0]} failed.`, output, notInstalled));
      },
    );
  });
}

/** Grund, warum das Update abgeschaltet ist – oder null, wenn es erlaubt ist. */
export function updateDisabledReason(env: Record<string, string | undefined> = process.env): string | null {
  if (/^(0|false|off|no)$/i.test(env.SELF_UPDATE ?? "")) return "Disabled via SELF_UPDATE.";
  if (env.VERCEL) return "Not available on hosted deployments.";
  return null;
}

function hostname(host: string | null): string | null {
  if (!host) return null;
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return null;
  }
}

/** Nur Aufrufe über localhost / 127.x / ::1 dürfen das Update auslösen. */
export function isLoopbackHost(host: string | null): boolean {
  const h = hostname(host);
  return h === "localhost" || h === "[::1]" || (h != null && /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h));
}

/** Schutz gegen CSRF: POST nur, wenn der Origin-Header zum Host passt. */
export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  const host = headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export interface VersionInfo {
  branch: string;
  commit: string;
  commitDate: string;
  subject: string;
}

export async function getVersionInfo(run: GitRunner): Promise<VersionInfo> {
  const [branch, log] = await Promise.all([run(["rev-parse", "--abbrev-ref", "HEAD"]), run(["log", "-1", "--format=%h%n%cI%n%s"])]);
  const [commit = "", commitDate = "", subject = ""] = log.split("\n");
  return { branch, commit, commitDate, subject };
}

/** Holt den Stand des Remote (git fetch) und zählt die neuen Commits. null = kein Upstream-Branch. */
export async function checkForUpdates(run: GitRunner): Promise<{ behind: number | null; upstream: string | null }> {
  let upstream: string;
  try {
    upstream = await run(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  } catch {
    return { behind: null, upstream: null };
  }
  await run(["fetch", "--quiet"]);
  const behind = Number(await run(["rev-list", "--count", "HEAD..@{u}"]));
  return { behind: Number.isFinite(behind) ? behind : null, upstream };
}

export interface PullResult {
  updated: boolean;
  from: string;
  to: string;
  output: string;
  commits: string[];
  /** package.json / package-lock.json geändert → `npm install` nötig */
  needsInstall: boolean;
  /** Änderungen, die ein Dev-Server nicht per Hot Reload übernimmt */
  needsRestart: boolean;
}

const RESTART_FILES = /^(package(-lock)?\.json|next\.config\.[jt]s|tsconfig\.json|postcss\.config\.mjs)$/;

/** `git pull --ff-only`: bricht ab statt zu mergen, falls lokale Commits oder Konflikte vorliegen. */
export async function pullLatest(run: GitRunner, production = process.env.NODE_ENV === "production"): Promise<PullResult> {
  const from = await run(["rev-parse", "HEAD"]);
  const output = await run(["pull", "--ff-only"]);
  const to = await run(["rev-parse", "HEAD"]);
  if (from === to) return { updated: false, from, to, output, commits: [], needsInstall: false, needsRestart: false };
  const [files, log] = await Promise.all([run(["diff", "--name-only", from, to]), run(["log", "--format=%h %s", `${from}..${to}`])]);
  const changed = files.split("\n").filter(Boolean);
  return {
    updated: true,
    from,
    to,
    output,
    commits: log.split("\n").filter(Boolean),
    needsInstall: changed.some((f) => /^package(-lock)?\.json$/.test(f)),
    needsRestart: production || changed.some((f) => RESTART_FILES.test(f)),
  };
}

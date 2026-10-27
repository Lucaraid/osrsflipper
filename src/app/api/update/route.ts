import { NextResponse } from "next/server";
import { checkForUpdates, getVersionInfo, GitError, isLoopbackHost, isSameOrigin, nodeGitRunner, pullLatest, updateDisabledReason } from "@/lib/update/git";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

/** Nur ein Pull gleichzeitig pro Server-Prozess */
let pulling: Promise<unknown> | null = null;

function disabled(req: Request): string | null {
  return updateDisabledReason() ?? (isLoopbackHost(req.headers.get("host")) ? null : "Only available when the app is opened via localhost.");
}

function gitFailure(err: unknown) {
  const e = err instanceof GitError ? err : new GitError("Git command failed.", "");
  if (!(err instanceof GitError)) console.error("[api] update", err instanceof Error ? err.message : err);
  return NextResponse.json({ ok: false, error: e.message, output: e.output }, { status: 500, headers: NO_STORE });
}

/** Installierte Version; mit ?check=1 zusätzlich `git fetch` und Anzahl neuer Commits. */
export async function GET(req: Request) {
  const reason = disabled(req);
  if (reason) return NextResponse.json({ enabled: false, reason }, { headers: NO_STORE });
  const run = nodeGitRunner();
  try {
    const version = await getVersionInfo(run);
    const check = new URL(req.url).searchParams.get("check") === "1" ? await checkForUpdates(run) : null;
    return NextResponse.json({ enabled: true, version, ...check }, { headers: NO_STORE });
  } catch (err) {
    // Kein Git-Klon (z. B. ZIP-Download) oder Git fehlt → Link ausblenden
    if (err instanceof GitError && isUnavailable(err)) return NextResponse.json({ enabled: false, reason: err.message }, { headers: NO_STORE });
    return gitFailure(err);
  }
}

function isUnavailable(err: GitError) {
  return err.notInstalled || /not a git repository/i.test(err.output);
}

/** Führt `git pull --ff-only` im Projektordner aus. */
export async function POST(req: Request) {
  const reason = disabled(req);
  if (reason) return NextResponse.json({ ok: false, error: reason }, { status: 403, headers: NO_STORE });
  if (!isSameOrigin(req.headers)) return NextResponse.json({ ok: false, error: "Cross-origin request rejected." }, { status: 403, headers: NO_STORE });
  if (pulling) return NextResponse.json({ ok: false, error: "An update is already running." }, { status: 409, headers: NO_STORE });
  const job = pullLatest(nodeGitRunner());
  pulling = job;
  try {
    return NextResponse.json({ ok: true, ...(await job) }, { headers: NO_STORE });
  } catch (err) {
    return gitFailure(err);
  } finally {
    pulling = null;
  }
}

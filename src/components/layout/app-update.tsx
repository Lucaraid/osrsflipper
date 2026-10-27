"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, RefreshCw } from "lucide-react";
import { useState } from "react";
import { ErrorNote, InfoNote } from "@/components/common/indicators";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { dateTime } from "@/lib/format";
import type { PullResult, VersionInfo } from "@/lib/update/git";

type StatusResponse =
  | { enabled: false; reason: string }
  | { enabled: true; version: VersionInfo; behind?: number | null; upstream?: string | null };

type PullResponse = ({ ok: true } & PullResult) | { ok: false; error: string; output?: string };

async function fetchStatus(check: boolean): Promise<StatusResponse> {
  const res = await fetch(check ? "/api/update?check=1" : "/api/update", { cache: "no-store" });
  const body = (await res.json()) as StatusResponse & { error?: string; output?: string };
  if (!res.ok) throw new Error([body.error ?? `HTTP ${res.status}`, body.output].filter(Boolean).join("\n"));
  return body;
}

async function postPull(): Promise<PullResponse> {
  const res = await fetch("/api/update", { method: "POST" });
  return (await res.json()) as PullResponse;
}

/** Link „Update app“ – nur sichtbar, wenn die App lokal aus einem Git-Klon läuft. */
export function AppUpdateLink({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const status = useQuery({ queryKey: ["app-update"], queryFn: () => fetchStatus(false), staleTime: Infinity, retry: false });
  if (!status.data?.enabled) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? "inline-flex items-center gap-1 underline hover:text-muted"} data-testid="app-update-link">
        <Download className="size-3" /> Update app
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open && <UpdateDialog version={status.data.version} />}
      </Dialog>
    </>
  );
}

function UpdateDialog({ version }: { version: VersionInfo }) {
  const qc = useQueryClient();
  const check = useQuery({ queryKey: ["app-update", "check"], queryFn: () => fetchStatus(true), staleTime: 0, gcTime: 0, retry: false });
  const pull = useMutation({
    mutationFn: postPull,
    onSuccess: (r) => {
      if (r.ok) void qc.invalidateQueries({ queryKey: ["app-update"] });
    },
  });
  const info = check.data?.enabled ? check.data : null;
  const result = pull.data;

  return (
    <DialogContent title="Update app" description="Loads the newest version from the Git repository (git pull).">
      <div className="space-y-3 text-sm" data-testid="app-update-dialog">
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs">
          <div>
            Installed: <span className="num font-semibold">{version.commit}</span> on <span className="font-semibold">{version.branch}</span> · {dateTime(Date.parse(version.commitDate))}
          </div>
          <div className="truncate text-muted" title={version.subject}>{version.subject}</div>
        </div>

        {!result && (
          <div data-testid="app-update-check">
            {check.isFetching ? (
              <p className="flex items-center gap-1.5 text-muted"><RefreshCw className="size-3.5 animate-spin" /> Checking for updates…</p>
            ) : check.error ? (
              <ErrorNote>Could not check for updates: <span className="whitespace-pre-wrap">{check.error.message}</span></ErrorNote>
            ) : info?.behind == null ? (
              <p className="text-muted">No upstream branch configured – you can still try to pull.</p>
            ) : info.behind > 0 ? (
              <p className="font-semibold text-pos">{info.behind} new {info.behind === 1 ? "commit" : "commits"} available on {info.upstream}.</p>
            ) : (
              <p className="flex items-center gap-1.5 text-pos"><CheckCircle2 className="size-4" /> You are on the newest version.</p>
            )}
          </div>
        )}

        {result?.ok === true && (
          <div className="space-y-2" data-testid="app-update-result">
            {result.updated ? (
              <>
                <p className="font-semibold text-pos">Updated to {result.to.slice(0, 7)} ({result.commits.length} {result.commits.length === 1 ? "commit" : "commits"}).</p>
                {result.commits.length > 0 && (
                  <ul className="max-h-32 list-disc overflow-y-auto pl-4 text-xs text-muted">
                    {result.commits.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                )}
                {result.needsInstall && <InfoNote tone="warn">Dependencies changed: run <code>npm install</code> in the project folder.</InfoNote>}
                {result.needsRestart ? (
                  <InfoNote tone="warn">Restart the app to use the new version (<code>npm run dev</code>, or <code>npm run build</code> + <code>npm start</code>).</InfoNote>
                ) : (
                  <InfoNote>The dev server picks up the changes automatically – reload the page.</InfoNote>
                )}
              </>
            ) : (
              <p className="flex items-center gap-1.5 text-pos"><CheckCircle2 className="size-4" /> Already up to date.</p>
            )}
          </div>
        )}
        {result?.ok === false && <ErrorNote>{result.error}</ErrorNote>}
        {pull.error && <ErrorNote>{pull.error.message}</ErrorNote>}
        {result?.output && <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-3 p-2 text-[11px]" data-testid="app-update-output">{result.output}</pre>}

        <div className="flex justify-end gap-2">
          {result?.ok && result.updated && !result.needsRestart && (
            <Button variant="outline" onClick={() => window.location.reload()}><RefreshCw /> Reload page</Button>
          )}
          <Button variant="primary" onClick={() => pull.mutate()} disabled={pull.isPending} data-testid="app-update-pull">
            <Download className={pull.isPending ? "animate-pulse" : undefined} /> {pull.isPending ? "Pulling…" : "Pull latest version"}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

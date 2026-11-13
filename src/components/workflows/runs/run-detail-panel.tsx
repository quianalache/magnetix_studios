"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  MinusCircle,
  User,
  Workflow,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { RunDetail, RunTimelineItem } from "@/types/workflow-runs";
import { formatRunTime, initials, RunStatusPill, RunTestBadge } from "./run-badges";

/**
 * One run, from the existing record: who, which workflow, how it started,
 * each executed step (never unexecuted ones as done), what it's waiting on,
 * the stored error in plain language, and links to the contact, the
 * workflow and the failed step. Read-only — no retry / replay.
 */
export function RunDetailPanel({
  saId,
  runId,
  workflowId,
  onClose,
  className,
}: {
  saId: string;
  runId: string;
  /** Set on a workflow's Runs page (the run must belong to it). */
  workflowId: string | null;
  onClose: () => void;
  className?: string;
}) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    const base = workflowId ? `/api/sub-accounts/${saId}/workflows/${workflowId}/runs` : `/api/sub-accounts/${saId}/workflows/runs`;
    fetch(`${base}?runId=${encodeURIComponent(runId)}`, { cache: "no-store" })
      .then(async (r) => {
        const b = (await r.json().catch(() => ({}))) as RunDetail & { error?: string };
        if (!r.ok) throw new Error(b.error ?? "Couldn't load this run.");
        if (!cancelled) setDetail(b);
      })
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [saId, runId, workflowId]);

  const failure = detail?.timeline.filter((t) => t.status === "failed").pop() ?? null;

  return (
    <section aria-label="Run details" className={cn("flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-section font-semibold">Run details</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Close run details" onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </div>

      {error ? (
        <Alert tone="danger" title="Couldn't open this run.">
          {error}
        </Alert>
      ) : !detail ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          {/* Contact */}
          <div className="flex items-center gap-3 border-b pb-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-tag-violet-bg text-sm font-semibold text-tag-violet-fg">
              {detail.contact ? initials(detail.contact.name) : <User className="size-5" aria-hidden="true" />}
            </span>
            <div className="min-w-0">
              {detail.contact ? (
                <>
                  <Link href={`/sa/${saId}/contacts/${detail.contact.id}`} className="inline-flex max-w-full items-center gap-1 font-semibold hover:underline">
                    <span className="truncate">{detail.contact.name}</span>
                    <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                  <p className="truncate text-caption text-muted-foreground">
                    {[detail.contact.email, detail.contact.phone].filter(Boolean).join(" · ") || "No email or phone"}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold">Contact unavailable</p>
                  <p className="text-caption text-muted-foreground">This contact was deleted or you can&apos;t see it. The run history is kept.</p>
                </>
              )}
            </div>
          </div>

          {/* Run information */}
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Workflow</dt>
            <dd className="min-w-0">
              {detail.workflowExists ? (
                <Link href={`/sa/${saId}/workflows/${detail.workflowId}`} className="inline-flex max-w-full items-center gap-1 hover:underline">
                  <span className="truncate">{detail.workflowName}</span>
                  <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              ) : (
                <span className="text-muted-foreground">Workflow deleted</span>
              )}
            </dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="flex flex-wrap items-center gap-1.5">
              <RunStatusPill status={detail.status} />
              <RunTestBadge test={detail.test} testRelated={detail.testRelated} />
            </dd>
            <dt className="text-muted-foreground">Run type</dt>
            <dd>
              {detail.test
                ? `Test run${detail.startedBy ? ` · started by ${detail.startedBy}` : ""} — real actions ran`
                : detail.testOrigin
                  ? "Started by a test run — real actions ran"
                  : "Real run"}
            </dd>
            <dt className="text-muted-foreground">Trigger</dt>
            <dd>{detail.trigger}</dd>
            {detail.triggerDetails.map((d) => (
              <div key={d.label} className="contents">
                <dt className="text-muted-foreground">{d.label}</dt>
                <dd className="break-words">{d.value}</dd>
              </div>
            ))}
            <dt className="text-muted-foreground">Started</dt>
            <dd>{formatRunTime(detail.enrolledAtMs)}</dd>
            <dt className="text-muted-foreground">Last updated</dt>
            <dd>{formatRunTime(detail.updatedAtMs)}</dd>
            {detail.currentStep && (detail.status === "waiting" || detail.status === "running") ? (
              <>
                <dt className="text-muted-foreground">Current step</dt>
                <dd>{detail.currentStep.label}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Run ID</dt>
            <dd className="truncate font-mono text-caption">{detail.id}</dd>
          </dl>

          {detail.testOrigin ? (
            <p className="rounded-lg bg-tint-violet px-3 py-2 text-caption text-muted-foreground">
              This run was started by a test of{" "}
              {detail.testOrigin.rootWorkflowName ? (
                <Link
                  className="font-medium text-link hover:underline"
                  href={`/sa/${saId}/workflows/${detail.testOrigin.rootWorkflowId}/runs?run=${encodeURIComponent(detail.testOrigin.rootRunId)}`}
                >
                  “{detail.testOrigin.rootWorkflowName}”
                </Link>
              ) : (
                "another workflow"
              )}
              .
            </p>
          ) : null}

          {/* Timeline */}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Run timeline</h3>
            {detail.timeline.length === 0 && !detail.pending ? (
              <p className="text-caption text-muted-foreground">No steps ran.</p>
            ) : (
              <ol className="flex flex-col">
                {detail.timeline.map((t, i) => (
                  <TimelineRow key={`${t.nodeId}-${i}`} saId={saId} workflowId={detail.workflowExists ? detail.workflowId : null} item={t} />
                ))}
                {detail.pending ? (
                  <li className="flex gap-3 py-2">
                    <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{detail.pending.label}</p>
                      <p className="text-caption text-muted-foreground">
                        {detail.pending.kind === "reply"
                          ? "Waiting for the contact to reply"
                          : detail.pending.kind === "waiting"
                            ? detail.pending.resumesAtMs
                              ? `Waiting · continues around ${formatRunTime(detail.pending.resumesAtMs)}`
                              : "Waiting · not started yet"
                            : "In progress"}
                      </p>
                    </div>
                  </li>
                ) : null}
              </ol>
            )}
          </div>

          {/* Error */}
          {detail.status === "failed" && detail.errorSummary ? (
            <div className="rounded-xl border border-destructive/40 bg-status-danger-bg p-3 text-sm" role="alert">
              <p className="flex items-center gap-1.5 font-semibold text-status-danger-fg">
                <AlertTriangle className="size-4" aria-hidden="true" /> Error
              </p>
              <p className="mt-1">{failure?.error?.message ?? detail.errorSummary}</p>
              {failure?.error?.code ? <p className="mt-1 font-mono text-caption text-muted-foreground">Code: {failure.error.code}</p> : null}
            </div>
          ) : null}

          {/* Related */}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Related</h3>
            {detail.workflowExists ? (
              <Link
                href={failure?.stepExists ? `/sa/${saId}/workflows/${detail.workflowId}?step=${encodeURIComponent(failure.nodeId)}` : `/sa/${saId}/workflows/${detail.workflowId}`}
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted/40"
              >
                <Workflow className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{failure?.stepExists ? "Open the failed step" : "View workflow"}</span>
                  <span className="block truncate text-caption text-muted-foreground">{detail.workflowName}</span>
                </span>
                <ExternalLink className="size-4 text-muted-foreground" aria-hidden="true" />
              </Link>
            ) : null}
            {detail.contact ? (
              <Link href={`/sa/${saId}/contacts/${detail.contact.id}`} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted/40">
                <User className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">View contact</span>
                  <span className="block truncate text-caption text-muted-foreground">{detail.contact.name}</span>
                </span>
                <ExternalLink className="size-4 text-muted-foreground" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function TimelineRow({ saId, workflowId, item }: { saId: string; workflowId: string | null; item: RunTimelineItem }) {
  const Icon = item.status === "failed" ? XCircle : item.status === "skipped" ? MinusCircle : CheckCircle2;
  return (
    <li className={cn("flex gap-3 rounded-lg py-2", item.status === "failed" && "-mx-2 bg-status-danger-bg px-2")}>
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          item.status === "failed" ? "text-status-danger-fg" : item.status === "skipped" ? "text-muted-foreground" : "text-status-success-fg",
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {item.label}
          <span className="sr-only"> — {item.status === "failed" ? "failed" : item.status === "skipped" ? "skipped" : "done"}</span>
        </p>
        <p className={cn("text-caption", item.status === "failed" ? "text-status-danger-fg" : "text-muted-foreground")}>
          {item.text} · {formatRunTime(item.atMs)}
        </p>
        {item.status === "failed" && workflowId && item.stepExists ? (
          <Link href={`/sa/${saId}/workflows/${workflowId}?step=${encodeURIComponent(item.nodeId)}`} className="text-caption font-medium text-link hover:underline">
            Open this step
          </Link>
        ) : null}
      </div>
    </li>
  );
}

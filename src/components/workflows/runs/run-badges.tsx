"use client";

import { StatusPill, type StatusTone } from "@/components/system/status-pill";
import type { WorkflowRunStatus } from "@/types/workflows";

/** Engine statuses shown as stored — no invented mapping. */
const TONE: Record<WorkflowRunStatus, StatusTone> = {
  running: "info",
  waiting: "warning",
  completed: "success",
  failed: "danger",
  exited: "neutral",
};

const LABEL: Record<WorkflowRunStatus, string> = {
  running: "Running",
  waiting: "Waiting",
  completed: "Completed",
  failed: "Failed",
  exited: "Exited",
};

export const RUN_STATUS_HELP: Record<WorkflowRunStatus, string> = {
  running: "The run is working on a step.",
  waiting: "The run is paused on a wait or waiting for a reply.",
  completed: "The run reached the end of the workflow.",
  failed: "A step failed and the run stopped.",
  exited: "The run stopped early — the workflow was paused or unpublished, automations were paused, or another workflow stopped it.",
};

export function RunStatusPill({ status }: { status: WorkflowRunStatus }) {
  return (
    <StatusPill tone={TONE[status] ?? "neutral"}>
      <span title={RUN_STATUS_HELP[status]}>{LABEL[status] ?? status}</span>
    </StatusPill>
  );
}

/** “Test” (started from Test) or “From a test” (started by a test run). Never replaces the status. */
export function RunTestBadge({ test, testRelated }: { test: boolean; testRelated: boolean }) {
  if (!test && !testRelated) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full bg-tag-violet-bg px-2 py-0.5 text-micro font-semibold text-tag-violet-fg"
      title={test ? "Started from the Test button — real actions ran." : "Started by a test run — real actions ran."}
    >
      {test ? "Test" : "From a test"}
    </span>
  );
}

export function formatRunTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export const STATUS_FILTER_OPTIONS: { value: "all" | WorkflowRunStatus; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "failed", label: "Failed" },
  { value: "waiting", label: "Waiting" },
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "exited", label: "Exited" },
];

export const RANGE_OPTIONS: { value: "7d" | "30d" | "90d" | "all"; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

export function initials(name: string | null | undefined): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

import type { WorkflowRunStatus } from "@/types/workflows";

/** Workflow Runs views (CRM Foundations Batch B, 2026-11). */

export const RUN_PAGE_SIZE = 25;

export type RunStatusFilter = "all" | WorkflowRunStatus;
export type RunRange = "7d" | "30d" | "90d" | "all";

export interface RunListItem {
  id: string;
  workflowId: string;
  /** null when the workflow no longer exists. */
  workflowName: string | null;
  contactId: string;
  /** null when the contact no longer exists. */
  contactName: string | null;
  contactEmail: string | null;
  /** Stored engine status, unchanged. */
  status: WorkflowRunStatus;
  /** Started from the Test button. */
  test: boolean;
  /** A Test run, or a run a Test started (child workflow / event). */
  testRelated: boolean;
  testOriginRunId: string | null;
  trigger: string;
  enrolledAtMs: number;
  updatedAtMs: number;
  failedStep: { nodeId: string; label: string } | null;
  errorSummary: string | null;
  currentStep: { nodeId: string; label: string } | null;
}

export interface RunListResponse {
  runs: RunListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /** More runs exist than one view scans (very large workflows). */
  truncated: boolean;
  /** Workspace view: workflows for the filter. */
  workflows: Array<{ id: string; name: string }>;
}

export interface RunTimelineItem {
  nodeId: string;
  label: string;
  type: string | null;
  atMs: number;
  status: "done" | "skipped" | "failed";
  text: string;
  error: { message: string; code: string | null; attempt: number | null } | null;
  /** The step still exists in the workflow (for "Open step"). */
  stepExists: boolean;
}

export interface RunDetail extends RunListItem {
  contact: { id: string; name: string; email: string | null; phone: string | null } | null;
  workflowExists: boolean;
  triggerDetails: Array<{ label: string; value: string }>;
  timeline: RunTimelineItem[];
  /** The step the run is on but hasn't finished. */
  pending: { nodeId: string; label: string; kind: "running" | "waiting" | "reply"; resumesAtMs: number | null } | null;
  /** Who pressed Test (test runs). */
  startedBy: string | null;
  /** For a run a Test started: the Test it traces back to. */
  testOrigin: { rootRunId: string; rootWorkflowId: string; rootWorkflowName: string | null } | null;
}

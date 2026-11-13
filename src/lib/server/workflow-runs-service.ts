import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { NODE_LABELS, TRIGGER_LABELS } from "@/lib/workflows/catalog";
import { describeRunError, errorCodeFromResult, scrubErrorText } from "@/lib/workflows/run-errors";
import { isTestRelated, testOriginOf } from "@/lib/workflows/run-lifecycle";
import type {
  RunDetail,
  RunListItem,
  RunListResponse,
  RunRange,
  RunStatusFilter,
  RunTimelineItem,
} from "@/types/workflow-runs";
import { RUN_PAGE_SIZE } from "@/types/workflow-runs";
import type { WorkflowDoc, WorkflowNodeType, WorkflowRunDoc, WorkflowRunHistoryEntry, WorkflowTriggerType } from "@/types/workflows";

/**
 * Workflow Runs (CRM Foundations Batch B, 2026-11). Reads the existing
 * `workflowRuns` records — no second run store — and shapes them for the
 * per-workflow Runs page, the workspace-wide Runs view (Workflows → Runs,
 * default Failed) and the run detail panel. Every read is scoped to the
 * workspace; a territory-scoped member only sees runs for contacts they
 * can see.
 */

export class RunsError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const WORKSPACE_STATUSES = new Set(["failed", "waiting", "running", "completed", "exited"]);
const MAX_SCAN = 5000;

function toMillis(v: unknown): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.getTime();
  const t = v as { toMillis?: () => number; seconds?: number; _seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  if (typeof t._seconds === "number") return t._seconds * 1000;
  return 0;
}

const RANGE_DAYS: Record<RunRange, number | null> = { "7d": 7, "30d": 30, "90d": 90, all: null };

function stepLabel(wf: WorkflowDoc | null, nodeId: string | null | undefined, fallbackType?: string): { label: string; type: string | null } {
  const node = nodeId && wf?.nodes ? wf.nodes[nodeId] : undefined;
  const type = (node?.type ?? fallbackType ?? null) as WorkflowNodeType | null;
  return { label: type ? NODE_LABELS[type] ?? type : "Step", type };
}

function lastFailure(run: WorkflowRunDoc): WorkflowRunHistoryEntry | null {
  const hist = run.history ?? [];
  for (let i = hist.length - 1; i >= 0; i--) {
    const h = hist[i];
    const st = h.execution?.status;
    if (st === "terminal_failure" || st === "retryable_failure" || h.result?.startsWith("error:")) return h;
  }
  return null;
}

function failureText(run: WorkflowRunDoc): string | null {
  if (run.status !== "failed") return null;
  const f = lastFailure(run);
  if (f) return describeRunError(f.execution?.errorCategory ?? errorCodeFromResult(f.result), f.execution?.errorMessage);
  return (run.history ?? []).length === 0
    ? "The run stopped before its first step (the step couldn't be scheduled or the workflow was unavailable)."
    : "The run stopped after its last recorded step.";
}

function triggerLabel(run: WorkflowRunDoc, wf: WorkflowDoc | null, workflowNames: Map<string, string>): string {
  const ctx = run.context ?? {};
  if (ctx.test === true) return "Test run";
  if (ctx.source === "workflow") {
    const parent = typeof ctx.sourceWorkflowId === "string" ? workflowNames.get(ctx.sourceWorkflowId) : null;
    return parent ? `Started by “${parent}”` : "Started by another workflow";
  }
  if (ctx.source === "checkout") return "Checkout";
  const evt = (typeof ctx.eventType === "string" ? ctx.eventType : wf?.trigger?.type) as WorkflowTriggerType | undefined;
  return evt ? TRIGGER_LABELS[evt] ?? String(evt) : "Trigger";
}

function resultText(h: WorkflowRunHistoryEntry): string {
  const r = h.result ?? "";
  if (r === "ok") return "Done";
  if (r === "goal") return "Goal reached — the run ended here";
  if (r.startsWith("branch:")) return r === "branch:true" ? "Conditions matched — took the Yes path" : "Conditions didn't match — took the No path";
  if (r.startsWith("wait:")) {
    const secs = Number(r.slice(5).replace(/s$/, ""));
    return Number.isFinite(secs) ? `Waited ${formatDuration(secs)}` : "Waited";
  }
  if (r.startsWith("tag+:")) return `Added tag “${r.slice(5)}”`;
  if (r.startsWith("tag-:")) return `Removed tag “${r.slice(5)}”`;
  if (r.startsWith("tag=:")) return `No change — tag “${r.slice(5)}” already as wanted`;
  if (r.startsWith("skipped:")) {
    const why = r.slice(8);
    const map: Record<string, string> = {
      opt_out: "Skipped — the contact opted out",
      no_email: "Skipped — the contact has no email",
      no_phone: "Skipped — the contact has no phone",
      deliverability_suppressed: "Skipped — this address is suppressed after bounces or complaints",
      no_tag: "Skipped — no tag was set on this step",
      no_stage: "Skipped — no stage was set on this step",
      no_recipient: "Skipped — no recipient was set",
    };
    return map[why] ?? `Skipped (${why.replace(/_/g, " ")})`;
  }
  if (r.startsWith("error:")) return describeRunError(errorCodeFromResult(r), h.execution?.errorMessage);
  if (r.startsWith("workflow_")) return r === "workflow_started" ? "Started the other workflow" : `Other workflow ${r.slice(9).replace(/[_:]/g, " ")}`;
  if (r === "unsupported_passthrough") return "Not supported yet — passed through";
  return scrubErrorText(r.replace(/[_:]/g, " "));
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs} s`;
  if (secs < 3600) return `${Math.round(secs / 60)} min`;
  if (secs < 86400) return `${Math.round((secs / 3600) * 10) / 10} h`;
  return `${Math.round((secs / 86400) * 10) / 10} days`;
}

async function loadDocs(col: string, ids: string[]): Promise<Map<string, FirebaseFirestore.DocumentData>> {
  const db = getAdminDb();
  const out = new Map<string, FirebaseFirestore.DocumentData>();
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 300) {
    const snaps = await db.getAll(...unique.slice(i, i + 300).map((id) => db.doc(`${col}/${id}`)));
    for (const s of snaps) if (s.exists) out.set(s.id, s.data()!);
  }
  return out;
}

interface Ctx {
  workflows: Map<string, WorkflowDoc>;
  workflowNames: Map<string, string>;
  contacts: Map<string, FirebaseFirestore.DocumentData>;
}

function toItem(run: WorkflowRunDoc, c: Ctx): RunListItem {
  const wf = c.workflows.get(run.workflowId) ?? null;
  const contact = c.contacts.get(run.contactId) ?? null;
  const failure = run.status === "failed" ? lastFailure(run) : null;
  const failedStep = failure ? stepLabel(wf, failure.nodeId, failure.type) : null;
  const current = run.status === "waiting" || run.status === "running" ? stepLabel(wf, run.currentNodeId) : null;
  const origin = testOriginOf({ id: run.id, workflowId: run.workflowId, context: run.context });
  return {
    id: run.id,
    workflowId: run.workflowId,
    workflowName: wf ? String(wf.name || "Untitled workflow") : null,
    contactId: run.contactId,
    contactName: contact ? String(contact.name || contact.email || "Unnamed contact") : null,
    contactEmail: contact ? String(contact.email || "") || null : null,
    status: run.status,
    test: run.context?.test === true,
    testRelated: isTestRelated(run.context),
    testOriginRunId: origin && run.context?.test !== true ? origin.rootRunId : null,
    trigger: triggerLabel(run, wf, c.workflowNames),
    enrolledAtMs: toMillis(run.enrolledAt),
    updatedAtMs: toMillis(run.updatedAt) || toMillis(run.enrolledAt),
    failedStep: failure ? { nodeId: failure.nodeId, label: failedStep!.label } : null,
    errorSummary: failureText(run),
    currentStep: run.currentNodeId && current ? { nodeId: run.currentNodeId, label: current.label } : null,
  };
}

async function buildCtx(runs: WorkflowRunDoc[], subAccountId: string): Promise<Ctx> {
  const wfIds = new Set<string>();
  for (const r of runs) {
    wfIds.add(r.workflowId);
    if (typeof r.context?.sourceWorkflowId === "string") wfIds.add(r.context.sourceWorkflowId);
  }
  const [wfDocs, contacts] = await Promise.all([
    loadDocs("workflows", [...wfIds]),
    loadDocs("contacts", runs.map((r) => r.contactId)),
  ]);
  const workflows = new Map<string, WorkflowDoc>();
  const workflowNames = new Map<string, string>();
  for (const [id, d] of wfDocs) {
    if (d.subAccountId !== subAccountId) continue;
    workflows.set(id, { id, ...(d as Omit<WorkflowDoc, "id">) });
    workflowNames.set(id, String(d.name || "Untitled workflow"));
  }
  for (const [id, d] of contacts) if (d.subAccountId !== subAccountId) contacts.delete(id);
  return { workflows, workflowNames, contacts };
}

/** Territory-scoped members only see runs for contacts they can see. */
function visibleToScope(run: WorkflowRunDoc, c: Ctx, territoryIds: string[] | null): boolean {
  if (territoryIds === null) return true;
  const contact = c.contacts.get(run.contactId);
  if (!contact) return false;
  return territoryIds.includes(String(contact.territoryId ?? ""));
}

export async function listRuns(input: {
  subAccountId: string;
  territoryIds: string[] | null;
  /** One workflow's runs, or the whole workspace when null. */
  workflowId: string | null;
  status: RunStatusFilter;
  range: RunRange;
  q: string;
  page: number;
  /** Workspace view: narrow to one workflow. */
  filterWorkflowId?: string | null;
}): Promise<RunListResponse> {
  const db = getAdminDb();
  let docs: WorkflowRunDoc[];
  if (input.workflowId) {
    const wf = await db.doc(`workflows/${input.workflowId}`).get();
    if (!wf.exists || wf.get("subAccountId") !== input.subAccountId) throw new RunsError("Workflow not found", 404);
    let q: FirebaseFirestore.Query = db.collection("workflowRuns").where("workflowId", "==", input.workflowId);
    if (input.status !== "all") q = q.where("status", "==", input.status);
    docs = (await q.limit(MAX_SCAN).get()).docs.map((d) => d.data() as WorkflowRunDoc);
  } else {
    // Workspace-wide view: one status at a time (default Failed). Two
    // equality filters are served by Firestore's single-field indexes —
    // no new composite index.
    if (!WORKSPACE_STATUSES.has(input.status)) throw new RunsError("Choose a status.", 400);
    let q: FirebaseFirestore.Query = db
      .collection("workflowRuns")
      .where("subAccountId", "==", input.subAccountId)
      .where("status", "==", input.status);
    if (input.filterWorkflowId) q = q.where("workflowId", "==", input.filterWorkflowId);
    docs = (await q.limit(MAX_SCAN).get()).docs.map((d) => d.data() as WorkflowRunDoc);
  }
  docs = docs.filter((r) => r.subAccountId === input.subAccountId);
  const days = RANGE_DAYS[input.range];
  if (days !== null) {
    const since = Date.now() - days * 86400000;
    docs = docs.filter((r) => toMillis(r.enrolledAt) >= since || toMillis(r.updatedAt) >= since);
  }
  docs.sort((a, b) => toMillis(b.enrolledAt) - toMillis(a.enrolledAt));

  const c = await buildCtx(docs, input.subAccountId);
  let items = docs.filter((r) => visibleToScope(r, c, input.territoryIds)).map((r) => toItem(r, c));
  const needle = input.q.trim().toLowerCase();
  if (needle) {
    items = items.filter((i) =>
      [i.contactName, i.contactEmail, i.workflowName, i.errorSummary, i.failedStep?.label]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / RUN_PAGE_SIZE));
  const page = Math.min(Math.max(1, input.page), pageCount);
  const workflows = input.workflowId
    ? []
    : (await db.collection("workflows").where("subAccountId", "==", input.subAccountId).get()).docs
        .map((d) => ({ id: d.id, name: String(d.get("name") || "Untitled workflow") }))
        .sort((a, b) => a.name.localeCompare(b.name));
  return {
    runs: items.slice((page - 1) * RUN_PAGE_SIZE, page * RUN_PAGE_SIZE),
    total,
    page,
    pageSize: RUN_PAGE_SIZE,
    pageCount,
    truncated: docs.length >= MAX_SCAN,
    workflows,
  };
}

export async function getRunDetail(input: {
  subAccountId: string;
  territoryIds: string[] | null;
  runId: string;
  /** When opened from a workflow's Runs page, the run must belong to it. */
  workflowId?: string | null;
}): Promise<RunDetail> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(input.runId)) throw new RunsError("Run not found", 404);
  const db = getAdminDb();
  const snap = await db.doc(`workflowRuns/${input.runId}`).get();
  const run = snap.exists ? (snap.data() as WorkflowRunDoc) : null;
  // Another workspace's run reads exactly like a missing one.
  if (!run || run.subAccountId !== input.subAccountId) throw new RunsError("Run not found", 404);
  if (input.workflowId && run.workflowId !== input.workflowId) throw new RunsError("Run not found", 404);
  const origin = testOriginOf({ id: run.id, workflowId: run.workflowId, context: run.context });
  const extraWf = origin && origin.rootWorkflowId !== run.workflowId ? [origin.rootWorkflowId] : [];
  const c = await buildCtx([run], input.subAccountId);
  if (extraWf.length) {
    const more = await loadDocs("workflows", extraWf);
    for (const [id, d] of more) if (d.subAccountId === input.subAccountId) c.workflowNames.set(id, String(d.name || "Untitled workflow"));
  }
  if (!visibleToScope(run, c, input.territoryIds)) throw new RunsError("Run not found", 404);
  const item = toItem(run, c);
  const wf = c.workflows.get(run.workflowId) ?? null;
  const contact = c.contacts.get(run.contactId) ?? null;

  const timeline: RunTimelineItem[] = [...(run.history ?? [])]
    .sort((a, b) => toMillis(a.at) - toMillis(b.at))
    .map((h) => {
      const { label, type } = stepLabel(wf, h.nodeId, h.type);
      const st = h.execution?.status;
      const failed = st === "terminal_failure" || st === "retryable_failure" || h.result?.startsWith("error:");
      return {
        nodeId: h.nodeId,
        label,
        type,
        atMs: toMillis(h.at),
        status: failed ? "failed" : st === "skipped" || h.result?.startsWith("skipped:") ? "skipped" : "done",
        text: resultText(h),
        error: failed
          ? {
              message: describeRunError(h.execution?.errorCategory ?? errorCodeFromResult(h.result), h.execution?.errorMessage),
              code: h.execution?.errorCategory ?? errorCodeFromResult(h.result),
              attempt: h.execution?.attempt ?? null,
            }
          : null,
        stepExists: !!(wf?.nodes && wf.nodes[h.nodeId]),
      };
    });

  let pending: RunDetail["pending"] = null;
  if ((run.status === "running" || run.status === "waiting") && run.currentNodeId && !run.history?.some((h) => h.nodeId === run.currentNodeId)) {
    const { label } = stepLabel(wf, run.currentNodeId);
    const last = run.history?.[run.history.length - 1];
    let resumesAtMs: number | null = null;
    if (last?.result?.startsWith("wait:")) {
      const secs = Number(last.result.slice(5).replace(/s$/, ""));
      if (Number.isFinite(secs)) resumesAtMs = toMillis(last.at) + secs * 1000;
    }
    pending = {
      nodeId: run.currentNodeId,
      label,
      kind: run.waiting ? "reply" : run.status === "waiting" ? "waiting" : "running",
      resumesAtMs,
    };
  }

  const ctx = run.context ?? {};
  const triggerDetails: Array<{ label: string; value: string }> = [];
  if (typeof ctx.formName === "string") triggerDetails.push({ label: "Form", value: ctx.formName });
  if (typeof ctx.tag === "string") triggerDetails.push({ label: "Tag", value: ctx.tag });
  if (Array.isArray(ctx.addedTags)) triggerDetails.push({ label: "Tags added", value: (ctx.addedTags as unknown[]).filter((t) => typeof t === "string").join(", ") });
  if (typeof ctx.tagSource === "string") triggerDetails.push({ label: "Tag source", value: ctx.tagSource.replace(/_/g, " ") });
  if (typeof ctx.channel === "string") triggerDetails.push({ label: "Channel", value: ctx.channel });
  if (typeof ctx.offerTitle === "string") triggerDetails.push({ label: "Offer", value: ctx.offerTitle });
  // Batch C: payment & subscription triggers (amounts are minor units).
  if (ctx.source === "stripe") {
    const money = (cents: unknown) =>
      typeof cents === "number" && typeof ctx.currency === "string"
        ? (() => {
            try {
              return new Intl.NumberFormat("en-US", { style: "currency", currency: ctx.currency.toUpperCase() }).format(cents / 100);
            } catch {
              return `${(cents / 100).toFixed(2)} ${ctx.currency.toUpperCase()}`;
            }
          })()
        : null;
    const amount = money(ctx.amount);
    if (amount) triggerDetails.push({ label: ctx.eventType === "refund.issued" ? "Original payment" : "Amount", value: amount });
    const refund = money(ctx.refundAmount);
    if (refund) triggerDetails.push({ label: "Refunded", value: `${refund}${ctx.fullyRefunded === true ? " (full refund)" : ""}` });
    else if (ctx.eventType === "refund.issued" && money(ctx.amountRefunded)) triggerDetails.push({ label: "Refunded so far", value: money(ctx.amountRefunded)! });
    if (typeof ctx.subscriptionStatus === "string") triggerDetails.push({ label: "Subscription status", value: ctx.subscriptionStatus.replace(/_/g, " ") });
    if (typeof ctx.paymentType === "string") triggerDetails.push({ label: "Payment type", value: ctx.paymentType === "one_time" ? "One-time" : "Subscription" });
    if (typeof ctx.failureCode === "string") triggerDetails.push({ label: "Decline reason", value: ctx.failureCode.replace(/_/g, " ") });
    if (ctx.livemode === false) triggerDetails.push({ label: "Stripe mode", value: "Test mode" });
  }

  let startedBy: string | null = null;
  if (typeof ctx.startedByUid === "string") {
    const u = await db.doc(`users/${ctx.startedByUid}`).get();
    startedBy = u.exists ? String(u.get("displayName") || u.get("email") || "A team member") : "A team member";
  }

  return {
    ...item,
    contact: contact
      ? {
          id: run.contactId,
          name: item.contactName ?? "Unnamed contact",
          email: String(contact.email || "") || null,
          phone: String(contact.phone || "") || null,
        }
      : null,
    workflowExists: !!wf,
    triggerDetails,
    timeline,
    pending,
    startedBy,
    testOrigin: origin && run.context?.test !== true
      ? { rootRunId: origin.rootRunId, rootWorkflowId: origin.rootWorkflowId, rootWorkflowName: c.workflowNames.get(origin.rootWorkflowId) ?? null }
      : null,
  };
}

import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { recordContactActivity } from "@/lib/server/contact-activity";
import type { WorkflowRunDoc } from "@/types/workflows";

/**
 * Workflow Runs ↔ Contact Activity (CRM Foundations Batch B, 2026-11).
 *
 * TEST ORIGIN. A Workflow Test runs the real engine (real messages, real
 * changes). When that test starts another workflow — through a Start
 * Workflow step, a Workflow Completed / Failed trigger or a tag change —
 * the downstream run is real too, but it carries `context.testOrigin` so it
 * stays traceable to the test that caused it. Nothing is simulated or
 * suppressed; the label only records where the run came from.
 */

export interface TestOrigin {
  /** The Test run at the top of the chain. */
  rootRunId: string;
  rootWorkflowId: string;
}

/** The test origin a run passes on: itself if it IS a test, else inherited. */
export function testOriginOf(run: { id: string; workflowId: string; context?: Record<string, unknown> | null }): TestOrigin | null {
  const ctx = run.context ?? {};
  if (ctx.test === true) return { rootRunId: run.id, rootWorkflowId: run.workflowId };
  const inherited = ctx.testOrigin as Partial<TestOrigin> | undefined;
  if (inherited && typeof inherited.rootRunId === "string" && typeof inherited.rootWorkflowId === "string") {
    return { rootRunId: inherited.rootRunId, rootWorkflowId: inherited.rootWorkflowId };
  }
  return null;
}

/** Spread into an event / child-run context to keep the chain traceable. */
export function testOriginContext(run: { id: string; workflowId: string; context?: Record<string, unknown> | null }): Record<string, unknown> {
  const origin = testOriginOf(run);
  return origin ? { testOrigin: origin } : {};
}

/** True for a Test run or anything a Test run started. */
export function isTestRelated(context: Record<string, unknown> | null | undefined): boolean {
  return context?.test === true || !!(context?.testOrigin as { rootRunId?: unknown } | undefined)?.rootRunId;
}

/**
 * Contact Activity row for a run's lifecycle (started / completed / failed),
 * with the workflow name, run id and test context. Deterministic id per run
 * + kind, so a retried job never writes it twice. Never throws.
 */
export async function recordRunActivity(
  runId: string,
  kind: "started" | "completed" | "failed",
  info: { nodeId?: string | null; message?: string | null } = {},
): Promise<void> {
  try {
    const db = getAdminDb();
    const runSnap = await db.doc(`workflowRuns/${runId}`).get();
    if (!runSnap.exists) return;
    const run = runSnap.data() as WorkflowRunDoc;
    const wfSnap = await db.doc(`workflows/${run.workflowId}`).get();
    const wf = wfSnap.exists && wfSnap.get("subAccountId") === run.subAccountId ? wfSnap.data() : null;
    const name = String(wf?.name || "Untitled workflow");
    const test = run.context?.test === true;
    const origin = testOriginOf({ id: run.id, workflowId: run.workflowId, context: run.context });
    const stepType = info.nodeId ? (wf?.nodes?.[info.nodeId]?.type as string | undefined) ?? null : null;
    const label = test ? "Workflow test" : origin ? "Workflow (started by a test)" : "Workflow";
    const verb = kind === "started" ? "started" : kind === "completed" ? "completed" : "failed";
    const detail =
      kind === "failed" && info.message ? ` — ${info.message.slice(0, 200)}` : "";
    await recordContactActivity({
      subAccountId: run.subAccountId,
      contactId: run.contactId,
      type: kind === "started" ? "workflow_started" : kind === "completed" ? "workflow_completed" : "workflow_failed",
      content: `${label} “${name}” ${verb}${detail}`,
      meta: {
        workflowId: run.workflowId,
        runId: run.id,
        workflowName: name,
        test,
        ...(origin && !test ? { testOriginRunId: origin.rootRunId } : {}),
        ...(info.nodeId ? { nodeId: info.nodeId } : {}),
        ...(stepType ? { stepType } : {}),
      },
      createdBy: "workflow",
      dedupeKey: `wfrun_${run.id}_${kind}`,
    });
  } catch (err) {
    console.warn("[workflows] run activity failed", err);
  }
}

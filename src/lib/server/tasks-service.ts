import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { isRoutineTaskId, taskDocRef } from "@/lib/server/task-ref";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import {
  serializeTaskForApi,
  type TaskApiObject,
} from "@/lib/api/serializers/tasks";
import { GLOBAL_TERRITORY_ID } from "@/types";
import { emitWorkflowEvent } from "@/lib/workflows/events";
import { writeDealActivity } from "@/lib/server/deals-service";
import {
  afterTaskCompletionChange,
  unfinishedPrerequisiteWarnings,
  type TaskActor,
} from "@/lib/server/task-graph-service";

/**
 * Server-side Task write service — create + complete go through here so
 * `task.created` / `task.completed` fire from the dashboard, not just the
 * public API. Plain edits + deletes have no webhook event, so they stay as
 * client-side Firestore writes.
 */

type Mode = "live" | "test";

/** Territory follows the linked contact; standalone tasks fall back to Global. */
async function territoryForContact(contactId: string | null): Promise<string> {
  if (!contactId) return GLOBAL_TERRITORY_ID;
  try {
    const snap = await getAdminDb().doc(`contacts/${contactId}`).get();
    const raw = snap.data()?.territoryId;
    return typeof raw === "string" ? raw : GLOBAL_TERRITORY_ID;
  } catch {
    return GLOBAL_TERRITORY_ID;
  }
}

export interface CreateTaskInput {
  subAccountId: string;
  agencyId: string;
  createdByUid: string;
  mode: Mode;
  title: string;
  notes: string;
  dueAt: Date | null;
  contactId: string | null;
  dealId: string | null;
  eventId: string | null;
  timeBlock?: "am" | "midday" | "pm" | "anytime" | null;
  /**
   * Projects & Tasks Phase 2 — optional extra fields written verbatim
   * (projectId, parentTaskId, priority, tags, recurrence, …). Callers that
   * don't pass it produce exactly the pre-Phase-2 document.
   */
  extra?: Record<string, unknown>;
  /** Overrides the contact-derived territory (project tasks follow their project's client). */
  territoryIdOverride?: string;
  /** Pre-chosen document id (deterministic ids for grants / recurrence). */
  docId?: string;
}

export interface TaskWriteResult {
  id: string;
  task: TaskApiObject;
}

/** Create a task + emit `task.created`. */
export async function createTaskServerSide(
  input: CreateTaskInput
): Promise<TaskWriteResult> {
  const db = getAdminDb();
  const territoryId =
    input.territoryIdOverride ?? (await territoryForContact(input.contactId));
  const ref = input.docId
    ? db.collection("tasks").doc(input.docId)
    : db.collection("tasks").doc();

  const doc = {
    ...(input.extra ?? {}),
    title: input.title,
    notes: input.notes,
    dueAt: input.dueAt,
    completed: false,
    completedAt: null,
    contactId: input.contactId,
    dealId: input.dealId,
    eventId: input.eventId,
    timeBlock: input.timeBlock ?? null,
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    createdByUid: input.createdByUid,
    territoryId,
    mode: input.mode,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  // create() (not set) when the id is deterministic, so a retry can never
  // overwrite an existing task — the caller treats ALREADY_EXISTS as done.
  if (input.docId) await ref.create(doc);
  else await ref.set(doc);
  if (input.dealId) {
    await writeDealActivity(input.dealId, {
      type: "task_created",
      content: `Task added: "${input.title}"`,
      createdBy: input.createdByUid,
      meta: { taskId: ref.id },
      contactId: input.contactId,
    });
  }

  const now = new Date();
  const task = serializeTaskForApi(
    ref.id,
    { ...doc, createdAt: now, updatedAt: now },
    input.mode
  );

  void emitWebhookEvent({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    mode: input.mode,
    type: "task.created",
    payload: { task },
  });
  if (input.mode === "live" && input.contactId) {
    emitWorkflowEvent({
      eventType: "task.created",
      eventId: ref.id,
      agencyId: input.agencyId,
      subAccountId: input.subAccountId,
      contactId: input.contactId,
      source: "tasks",
      payload: {
        taskId: ref.id,
        ownerUid: null,
        projectId: (input.extra?.projectId as string | null | undefined) ?? null,
      },
    });
  }

  return { id: ref.id, task };
}

/**
 * Flip a task's completed flag. Emits `task.completed` only on the
 * false→true edge (matches the public API), and writes the
 * `task_completed` activity on the linked contact. Returns null when the
 * task doesn't exist.
 */
export async function setTaskCompletedServerSide(opts: {
  taskId: string;
  completed: boolean;
  userId: string;
  mode?: Mode;
  /**
   * Tenancy guard: when set, the write is refused (returns null, exactly
   * like a missing doc) unless the loaded task's `subAccountId` matches.
   * This function otherwise mutates ANY task by id — callers whose taskId
   * comes from an untrusted source (the AI Suite, request payloads) MUST
   * pass this so a foreign id can't cross tenants.
   */
  expectedSubAccountId?: string;
  /** Who did it, for the task Activity feed (Phase 2). Defaults to staff `userId`. */
  actor?: TaskActor;
  /**
   * Routine activities (`rt_…`, stored in routineTasks) are only reachable
   * when the caller has already checked routine privacy and opts in —
   * every other caller (AI Suite, workflows) sees them as missing.
   */
  allowRoutineTask?: boolean;
}): Promise<(TaskWriteResult & { warnings: string[] }) | null> {
  const db = getAdminDb();
  if (isRoutineTaskId(opts.taskId) && !opts.allowRoutineTask) return null;
  const ref = taskDocRef(opts.taskId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  if (
    opts.expectedSubAccountId !== undefined &&
    snap.data()?.subAccountId !== opts.expectedSubAccountId
  ) {
    return null;
  }

  const existing = snap.data()!;
  const mode = opts.mode ?? (existing.mode as Mode) ?? "live";
  const wasCompleted = !!existing.completed;

  // Dependencies warn, never block (owner decision): report unfinished
  // prerequisites to the caller and complete anyway.
  const warnings =
    opts.completed && !wasCompleted
      ? await unfinishedPrerequisiteWarnings(existing)
      : [];

  const statusPatch: Record<string, unknown> = {};
  if (opts.completed) statusPatch.status = "completed";
  else if (existing.status === "completed") statusPatch.status = "todo";

  await ref.set(
    {
      completed: opts.completed,
      completedAt: opts.completed ? FieldValue.serverTimestamp() : null,
      ...statusPatch,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  if (opts.completed !== wasCompleted) {
    await afterTaskCompletionChange({
      taskId: opts.taskId,
      task: existing,
      completed: opts.completed,
      actor: opts.actor ?? { kind: "staff", uid: opts.userId },
    });
  }

  const justCompleted = opts.completed && !wasCompleted;
  if (justCompleted && existing.contactId) {
    try {
      await db
        .collection("contacts")
        .doc(existing.contactId as string)
        .collection("activities")
        .add({
          type: "task_completed",
          createdBy: opts.userId,
          content: `Task completed: "${existing.title ?? ""}"`,
          meta: {},
          createdAt: FieldValue.serverTimestamp(),
        });
    } catch (err) {
      console.warn("[tasks-service] task_completed activity failed", err);
    }
  }

  if (justCompleted && existing.dealId) {
    await writeDealActivity(existing.dealId as string, {
      type: "task_completed",
      content: `Task completed: "${existing.title ?? ""}"`,
      createdBy: opts.userId,
      meta: { taskId: opts.taskId },
      contactId: (existing.contactId as string | null) ?? null,
    });
  }

  const fresh = await ref.get();
  const task = serializeTaskForApi(fresh.id, fresh.data()!, mode);

  // Routine activities are generated automatically, so — like their
  // creation — their completion emits no task webhook / workflow event
  // (owner decision). Everything else is unchanged.
  if (justCompleted && !existing.routineId) {
    void emitWebhookEvent({
      subAccountId: existing.subAccountId,
      agencyId: existing.agencyId,
      mode,
      type: "task.completed",
      payload: { task },
    });
    if (mode === "live" && existing.contactId) {
      emitWorkflowEvent({
        eventType: "task.completed",
        eventId: ref.id,
        agencyId: existing.agencyId,
        subAccountId: existing.subAccountId,
        contactId: existing.contactId as string,
        source: "tasks",
        payload: {
          taskId: ref.id,
          ownerUid: null,
          projectId: (existing.projectId as string | null | undefined) ?? null,
        },
      });
    }
  }

  return { id: fresh.id, task, warnings };
}

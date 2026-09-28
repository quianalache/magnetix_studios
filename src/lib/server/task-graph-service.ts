import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Projects & Tasks Phase 2 (2026-09) — the relationships layered on top of
 * the existing CRM Tasks engine: task activity, project progress counts,
 * recurring routines, dependencies. Kept out of tasks-service.ts so that
 * file stays the thin create/complete/webhook service it was; tasks-service
 * calls in here for the completion side effects.
 *
 * Storage (all server-only — no firestore.rules match, default deny):
 * - `taskActivity/{id}` — one row per MEANINGFUL event (status, priority,
 *   assignee, due date / rollover, completion, time tracked, subtask
 *   added…). Timer start/stop is never logged; only the finished entry.
 * - `taskComments/{id}` — staff comments (see task-comments route).
 */

export type TaskActor =
  | { kind: "staff"; uid: string; name?: string }
  | { kind: "client"; memberId: string; contactId: string | null; name?: string }
  | { kind: "system"; name?: string };

export type TaskActivityType =
  | "created"
  | "completed"
  | "reopened"
  | "status_changed"
  | "priority_changed"
  | "assignee_changed"
  | "due_changed"
  | "rolled_over"
  | "renamed"
  | "time_tracked"
  | "time_corrected"
  | "subtask_added"
  | "deleted"
  | "occurrence_created"
  | "milestone_changed";

export interface TaskActivityInput {
  subAccountId: string;
  agencyId: string;
  taskId: string;
  projectId: string | null;
  taskTitle: string;
  type: TaskActivityType;
  actor: TaskActor;
  summary: string;
  detail?: Record<string, unknown>;
  /** "internal" rows never leave the CRM (e.g. staff time). */
  visibility: "client" | "internal";
}

const nameCache = new Map<string, string>();

/** Display name for an actor — staff from the membership row / users doc, client from the member doc. */
export async function actorName(
  subAccountId: string,
  actor: TaskActor
): Promise<string> {
  if (actor.name) return actor.name;
  if (actor.kind === "system") return "Magnetix";
  const key =
    actor.kind === "staff"
      ? `s:${subAccountId}:${actor.uid}`
      : `m:${subAccountId}:${actor.memberId}`;
  const cached = nameCache.get(key);
  if (cached) return cached;
  const db = getAdminDb();
  let name = actor.kind === "staff" ? "A team member" : "Client";
  try {
    if (actor.kind === "staff") {
      const m = await db
        .doc(`subAccounts/${subAccountId}/subAccountMembers/${actor.uid}`)
        .get();
      const u = m.exists ? null : await db.doc(`users/${actor.uid}`).get();
      const d = m.data() ?? u?.data() ?? {};
      name =
        (d.displayName as string) || (d.email as string) || "A team member";
    } else {
      const m = await db
        .doc(`subAccounts/${subAccountId}/members/${actor.memberId}`)
        .get();
      const d = m.data() ?? {};
      name = (d.displayName as string) || (d.name as string) || "Client";
    }
  } catch {
    /* fall back to the generic label */
  }
  nameCache.set(key, name);
  return name;
}

export async function recordTaskActivity(input: TaskActivityInput) {
  try {
    const name = await actorName(input.subAccountId, input.actor);
    await getAdminDb()
      .collection("taskActivity")
      .add({
        subAccountId: input.subAccountId,
        agencyId: input.agencyId,
        taskId: input.taskId,
        projectId: input.projectId,
        taskTitle: input.taskTitle,
        type: input.type,
        actorKind: input.actor.kind,
        actorUid: input.actor.kind === "staff" ? input.actor.uid : null,
        actorMemberId:
          input.actor.kind === "client" ? input.actor.memberId : null,
        actorName: name,
        summary: input.summary,
        detail: input.detail ?? {},
        visibility: input.visibility,
        createdAt: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    // Activity is a record, never a reason to fail the user's action.
    console.warn("[task-graph] activity write failed", err);
  }
}

/** Client-project tasks are client-visible unless explicitly internal. */
export function activityVisibilityFor(task: FirebaseFirestore.DocumentData) {
  return task.projectId && task.visibility !== "internal"
    ? ("client" as const)
    : ("internal" as const);
}

/**
 * Task-based projects keep `stepCount` / `stepsDoneCount` = top-level,
 * non-routine tasks, so every existing progress display (Overview list,
 * contact card, Client Portal) reads task projects without changes.
 * Step-model projects are never touched here.
 */
export async function recomputeProjectTaskCounts(
  projectId: string
): Promise<void> {
  const db = getAdminDb();
  const projectRef = db.doc(`projects/${projectId}`);
  const project = await projectRef.get();
  if (!project.exists || project.data()?.taskModel !== "tasks") return;
  const snap = await db
    .collection("tasks")
    .where("subAccountId", "==", project.data()!.subAccountId)
    .where("projectId", "==", projectId)
    .get();
  const counted = snap.docs
    .map((d) => d.data())
    .filter((t) => !t.parentTaskId && t.kind !== "routine" && !t.recurrence);
  await projectRef.set(
    {
      stepCount: counted.length,
      stepsDoneCount: counted.filter((t) => t.completed === true).length,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const t = v as { toDate?: () => Date };
  return typeof t.toDate === "function" ? t.toDate() : null;
}

/** Momentum OS recurrence (provider `npe`): daily +1 day, weekly → next selected weekday, monthly +1 month, annually +1 year. */
export function nextOccurrenceDate(
  from: Date,
  recurrence: { type: string; days?: number[] }
): Date {
  const d = new Date(from);
  switch (recurrence.type) {
    case "daily":
      d.setUTCDate(d.getUTCDate() + 1);
      return d;
    case "weekly": {
      const days = (recurrence.days ?? []).filter(
        (n) => Number.isInteger(n) && n >= 0 && n <= 6
      );
      if (days.length === 0) {
        d.setUTCDate(d.getUTCDate() + 7);
        return d;
      }
      for (let i = 1; i <= 7; i++) {
        const c = new Date(from);
        c.setUTCDate(c.getUTCDate() + i);
        if (days.includes(c.getUTCDay())) return c;
      }
      d.setUTCDate(d.getUTCDate() + 7);
      return d;
    }
    case "monthly":
      d.setUTCMonth(d.getUTCMonth() + 1);
      return d;
    case "annually":
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      return d;
    default:
      d.setUTCDate(d.getUTCDate() + 1);
      return d;
  }
}

/**
 * Completing a recurring task creates the next occurrence. The id is
 * deterministic (`{seriesId}__{n}`) and written with create(), so a retried
 * or repeated completion (QStash, double-click, completing → reopening →
 * completing) can never produce a second copy. Project routines stop once
 * the next date passes the project's due date.
 */
export async function spawnNextOccurrence(
  taskId: string,
  task: FirebaseFirestore.DocumentData,
  actor: TaskActor
): Promise<string | null> {
  const recurrence = task.recurrence as
    | { type: string; days?: number[] }
    | null
    | undefined;
  if (!recurrence?.type) return null;
  const db = getAdminDb();
  const base = toDate(task.dueAt) ?? new Date();
  const nextDue = nextOccurrenceDate(base, recurrence);

  if (task.projectId) {
    const project = await db.doc(`projects/${task.projectId}`).get();
    const p = project.data();
    if (!p || p.status !== "active") return null;
    const projectDue = toDate(p.dueAt);
    if (projectDue && nextDue.getTime() > projectDue.getTime() + 86_399_000)
      return null;
  }

  const seriesId = (task.recurrenceSeriesId as string) || taskId;
  const index = ((task.occurrenceIndex as number) ?? 0) + 1;
  const docId = `${seriesId}__${index}`.slice(0, 140);
  const { createTaskServerSide } = await import("@/lib/server/tasks-service");
  try {
    await createTaskServerSide({
      subAccountId: task.subAccountId,
      agencyId: task.agencyId,
      createdByUid: (task.createdByUid as string) ?? "",
      mode: (task.mode as "live" | "test") ?? "live",
      title: task.title ?? "",
      notes: task.notes ?? "",
      dueAt: nextDue,
      contactId: task.contactId ?? null,
      dealId: task.dealId ?? null,
      eventId: null,
      timeBlock: task.timeBlock ?? null,
      territoryIdOverride: task.territoryId ?? undefined,
      docId,
      extra: {
        projectId: task.projectId ?? null,
        parentTaskId: null,
        status: "todo",
        priority: task.priority ?? null,
        assigneeUid: task.assigneeUid ?? null,
        assigneeContactId: task.assigneeContactId ?? null,
        tags: task.tags ?? [],
        estimateMinutes: task.estimateMinutes ?? null,
        checklist: ((task.checklist as { id: string; title: string }[]) ?? []).map(
          (c) => ({ id: c.id, title: c.title, done: false })
        ),
        recurrence,
        recurrenceSeriesId: seriesId,
        occurrenceIndex: index,
        autoRollover: task.autoRollover === true,
        visibility: task.visibility ?? null,
        kind: task.kind ?? "task",
        createdByMemberId: task.createdByMemberId ?? null,
      },
    });
  } catch (err) {
    const code = (err as { code?: number | string }).code;
    if (code === 6 || code === "already-exists" || code === "ALREADY_EXISTS")
      return docId; // occurrence already exists — idempotent
    throw err;
  }
  await recordTaskActivity({
    subAccountId: task.subAccountId,
    agencyId: task.agencyId,
    taskId: docId,
    projectId: task.projectId ?? null,
    taskTitle: task.title ?? "",
    type: "occurrence_created",
    actor,
    summary: `Next occurrence scheduled`,
    detail: { dueAt: nextDue.toISOString(), previousTaskId: taskId },
    visibility: activityVisibilityFor(task),
  });
  return docId;
}

export async function unfinishedPrerequisiteWarnings(
  task: FirebaseFirestore.DocumentData
): Promise<string[]> {
  const ids = (task.dependsOnTaskIds as string[] | undefined) ?? [];
  if (ids.length === 0) return [];
  const db = getAdminDb();
  const snaps = await db.getAll(...ids.map((id) => db.doc(`tasks/${id}`)));
  return snaps
    .filter(
      (s) =>
        s.exists &&
        s.data()?.subAccountId === task.subAccountId &&
        s.data()?.completed !== true
    )
    .map((s) => `Prerequisite “${s.data()?.title ?? "Untitled"}” isn't finished yet.`);
}

/** Rejects a dependency set that would create a loop (A → … → A). */
export async function wouldCreateDependencyCycle(
  subAccountId: string,
  taskId: string,
  dependsOn: string[]
): Promise<boolean> {
  const db = getAdminDb();
  const seen = new Set<string>();
  let frontier = [...dependsOn];
  let guard = 0;
  while (frontier.length > 0 && guard < 500) {
    guard++;
    if (frontier.includes(taskId)) return true;
    const batch = frontier.filter((id) => !seen.has(id)).slice(0, 100);
    batch.forEach((id) => seen.add(id));
    if (batch.length === 0) break;
    const snaps = await db.getAll(...batch.map((id) => db.doc(`tasks/${id}`)));
    const next: string[] = [];
    for (const s of snaps) {
      const d = s.data();
      if (!d || d.subAccountId !== subAccountId) continue;
      for (const dep of (d.dependsOnTaskIds as string[] | undefined) ?? []) {
        if (!seen.has(dep)) next.push(dep);
      }
    }
    frontier = next;
  }
  return false;
}

/** Side effects of a completion flip (called by setTaskCompletedServerSide). */
export async function afterTaskCompletionChange(opts: {
  taskId: string;
  task: FirebaseFirestore.DocumentData;
  completed: boolean;
  actor: TaskActor;
}) {
  const { task } = opts;
  await recordTaskActivity({
    subAccountId: task.subAccountId,
    agencyId: task.agencyId,
    taskId: opts.taskId,
    projectId: task.projectId ?? null,
    taskTitle: task.title ?? "",
    type: opts.completed ? "completed" : "reopened",
    actor: opts.actor,
    summary: opts.completed ? "Completed the task" : "Reopened the task",
    visibility: activityVisibilityFor(task),
  });
  if (opts.completed) {
    try {
      await spawnNextOccurrence(opts.taskId, task, opts.actor);
    } catch (err) {
      console.warn("[task-graph] next occurrence failed", err);
    }
  }
  if (task.projectId) await recomputeProjectTaskCounts(task.projectId);
}


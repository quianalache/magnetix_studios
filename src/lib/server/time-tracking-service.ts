import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { taskDocRef } from "@/lib/server/task-ref";
import {
  activityVisibilityFor,
  actorName,
  recordTaskActivity,
  type TaskActor,
} from "@/lib/server/task-graph-service";
import { TaskInputError } from "@/lib/server/project-tasks-service";
import {
  formatDuration,
  type ActiveTimerView,
  type TimeEntryView,
} from "@/types/time-tracking";

/**
 * Time tracking (Projects & Tasks Phase 2). See src/types/time-tracking.ts
 * for the data model. Invariants enforced here, server-side:
 *
 * - ONE running timer per person: `activeTimers/{actorKey}` is keyed by the
 *   person, and start/stop run in transactions. Starting a timer while one
 *   is running stops the old one first (it becomes a normal entry).
 * - Timestamps are server clock only; a client never supplies timer times.
 * - Manual entries carry a client request id → deterministic entry id →
 *   a double-submit returns the same entry instead of a duplicate.
 * - A person may only correct/delete THEIR OWN entries; every change
 *   appends a revision (before-values, who, when) and deletes are soft.
 *   Business owners review client entries but cannot alter them.
 * - Totals (`timeSpentSeconds` on the task and project, plus
 *   `clientTimeSeconds` for client-reported time) move by exact deltas
 *   inside the same transaction as the entry write.
 * - Activity gets ONE row per finished entry ("Quiana tracked 35m") —
 *   never separate start/stop rows. Staff time is internal-only.
 */

export type TimeActor =
  | { kind: "staff"; uid: string }
  | { kind: "client"; memberId: string; contactId: string | null };

export function actorKeyOf(actor: TimeActor): string {
  return actor.kind === "staff" ? `u_${actor.uid}` : `m_${actor.memberId}`;
}
function taskActor(actor: TimeActor): TaskActor {
  return actor.kind === "staff"
    ? { kind: "staff", uid: actor.uid }
    : { kind: "client", memberId: actor.memberId, contactId: actor.contactId };
}

const MAX_ENTRY_SECONDS = 24 * 3600;

function iso(v: unknown): string | null {
  if (!v) return null;
  const t = v as { toDate?: () => Date };
  if (typeof t.toDate === "function") return t.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  return null;
}

export function toEntryView(
  id: string,
  d: FirebaseFirestore.DocumentData,
  viewerKey: string
): TimeEntryView {
  return {
    id,
    taskId: d.taskId,
    projectId: d.projectId ?? null,
    actorKind: d.actorKind,
    actorKey: d.actorKey,
    actorName: d.actorName ?? "",
    startedAt: iso(d.startedAt),
    endedAt: iso(d.endedAt),
    durationSeconds: d.durationSeconds ?? 0,
    source: d.source,
    note: d.note ?? "",
    edited: Array.isArray(d.revisions) && d.revisions.length > 0,
    canEdit: d.actorKey === viewerKey && d.deleted !== true,
  };
}

function totalsUpdate(
  tx: FirebaseFirestore.Transaction,
  task: { id: string; projectId: string | null },
  deltaSeconds: number,
  isClient: boolean
) {
  if (deltaSeconds === 0) return;
  const db = getAdminDb();
  tx.set(
    taskDocRef(task.id),
    {
      timeSpentSeconds: FieldValue.increment(deltaSeconds),
      ...(isClient ? { clientTimeSeconds: FieldValue.increment(deltaSeconds) } : {}),
    },
    { merge: true }
  );
  if (task.projectId) {
    tx.set(
      db.doc(`projects/${task.projectId}`),
      {
        timeSpentSeconds: FieldValue.increment(deltaSeconds),
        ...(isClient ? { clientTimeSeconds: FieldValue.increment(deltaSeconds) } : {}),
      },
      { merge: true }
    );
  }
}

async function logTracked(
  task: FirebaseFirestore.DocumentData & { id: string },
  actor: TimeActor,
  seconds: number,
  summaryPrefix = "Tracked"
) {
  await recordTaskActivity({
    subAccountId: task.subAccountId,
    agencyId: task.agencyId,
    taskId: task.id,
    projectId: task.projectId ?? null,
    taskTitle: task.title ?? "",
    type: "time_tracked",
    actor: taskActor(actor),
    summary: `${summaryPrefix} ${formatDuration(seconds)}`,
    detail: { seconds },
    // Staff time is private to the business; client time is visible to both.
    visibility:
      actor.kind === "client" ? activityVisibilityFor(task) : "internal",
  });
}

export async function getActiveTimer(
  actor: TimeActor
): Promise<ActiveTimerView | null> {
  const snap = await getAdminDb().doc(`activeTimers/${actorKeyOf(actor)}`).get();
  const d = snap.data();
  if (!d) return null;
  return {
    taskId: d.taskId,
    taskTitle: d.taskTitle ?? "",
    projectId: d.projectId ?? null,
    startedAt: iso(d.startedAt) ?? new Date().toISOString(),
  };
}

/** Finalizes a running timer inside a transaction; returns the new entry (or null for a zero-length run). */
async function finalizeTimerInTx(
  tx: FirebaseFirestore.Transaction,
  timerRef: FirebaseFirestore.DocumentReference,
  timer: FirebaseFirestore.DocumentData,
  actor: TimeActor,
  name: string,
  now: Date
): Promise<{ entryId: string; seconds: number; task: FirebaseFirestore.DocumentData & { id: string } } | null> {
  const db = getAdminDb();
  const started = (timer.startedAt as Timestamp).toDate();
  const seconds = Math.min(
    MAX_ENTRY_SECONDS,
    Math.max(0, Math.round((now.getTime() - started.getTime()) / 1000))
  );
  const taskSnap = await tx.get(taskDocRef(timer.taskId));
  tx.delete(timerRef);
  if (seconds < 1 || !taskSnap.exists) return null;
  const task = { id: taskSnap.id, ...taskSnap.data() } as FirebaseFirestore.DocumentData & { id: string };
  const entryRef = db.collection("timeEntries").doc();
  tx.set(entryRef, entryDoc(task, actor, name, started, new Date(started.getTime() + seconds * 1000), seconds, "timer", ""));
  totalsUpdate(tx, { id: task.id, projectId: task.projectId ?? null }, seconds, actor.kind === "client");
  return { entryId: entryRef.id, seconds, task };
}

function entryDoc(
  task: FirebaseFirestore.DocumentData,
  actor: TimeActor,
  name: string,
  startedAt: Date,
  endedAt: Date,
  seconds: number,
  source: "timer" | "manual",
  note: string
) {
  return {
    agencyId: task.agencyId,
    subAccountId: task.subAccountId,
    taskId: task.id,
    projectId: task.projectId ?? null,
    actorKind: actor.kind,
    actorKey: actorKeyOf(actor),
    actorUid: actor.kind === "staff" ? actor.uid : null,
    actorMemberId: actor.kind === "client" ? actor.memberId : null,
    actorContactId: actor.kind === "client" ? actor.contactId : null,
    actorName: name,
    startedAt: Timestamp.fromDate(startedAt),
    endedAt: Timestamp.fromDate(endedAt),
    durationSeconds: seconds,
    source,
    note,
    deleted: false,
    revisions: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/** Start (or switch) the person's single timer. The caller has already authorized access to `task`. */
export async function startTimer(
  actor: TimeActor,
  task: FirebaseFirestore.DocumentData & { id: string }
): Promise<{ timer: ActiveTimerView; stopped: { taskId: string; seconds: number } | null }> {
  if (task.completed) throw new TaskInputError("Reopen the task to track time on it.");
  const db = getAdminDb();
  const key = actorKeyOf(actor);
  const timerRef = db.doc(`activeTimers/${key}`);
  const name = await actorName(task.subAccountId, taskActor(actor));
  const now = new Date();
  const result = await db.runTransaction(async (tx) => {
    const existing = await tx.get(timerRef);
    let stopped: Awaited<ReturnType<typeof finalizeTimerInTx>> = null;
    if (existing.exists) {
      if (existing.data()!.taskId === task.id) {
        return { already: true as const, stopped: null };
      }
      stopped = await finalizeTimerInTx(tx, timerRef, existing.data()!, actor, name, now);
    }
    tx.set(timerRef, {
      actorKey: key,
      subAccountId: task.subAccountId,
      taskId: task.id,
      taskTitle: task.title ?? "",
      projectId: task.projectId ?? null,
      startedAt: Timestamp.fromDate(now),
    });
    return { already: false as const, stopped };
  });
  if (result.stopped) await logTracked(result.stopped.task, actor, result.stopped.seconds);
  const timer = await getActiveTimer(actor);
  return {
    timer: timer!,
    stopped: result.stopped
      ? { taskId: result.stopped.task.id, seconds: result.stopped.seconds }
      : null,
  };
}

export async function stopTimer(
  actor: TimeActor
): Promise<{ taskId: string; seconds: number; entryId: string } | null> {
  const db = getAdminDb();
  const timerRef = db.doc(`activeTimers/${actorKeyOf(actor)}`);
  const pre = await timerRef.get();
  if (!pre.exists) return null;
  const name = await actorName(pre.data()!.subAccountId, taskActor(actor));
  const now = new Date();
  const res = await db.runTransaction(async (tx) => {
    const t = await tx.get(timerRef);
    if (!t.exists) return null; // already stopped (double click / retry)
    return finalizeTimerInTx(tx, timerRef, t.data()!, actor, name, now);
  });
  if (!res) return null;
  await logTracked(res.task, actor, res.seconds);
  return { taskId: res.task.id, seconds: res.seconds, entryId: res.entryId };
}

export async function addManualEntry(opts: {
  actor: TimeActor;
  task: FirebaseFirestore.DocumentData & { id: string };
  startedAt: Date;
  durationSeconds: number;
  note: string;
  requestId: string;
}): Promise<{ entryId: string; duplicate: boolean }> {
  const seconds = Math.round(opts.durationSeconds);
  if (!Number.isFinite(seconds) || seconds < 60 || seconds > MAX_ENTRY_SECONDS) {
    throw new TaskInputError("Enter between 1 minute and 24 hours.");
  }
  if (opts.startedAt.getTime() > Date.now() + 5 * 60_000) {
    throw new TaskInputError("Time entries can't be in the future.");
  }
  if (!/^[\w-]{8,80}$/.test(opts.requestId)) {
    throw new TaskInputError("Missing request id.");
  }
  const db = getAdminDb();
  const key = actorKeyOf(opts.actor);
  const entryRef = db.doc(`timeEntries/${key}_${opts.requestId}`);
  const name = await actorName(opts.task.subAccountId, taskActor(opts.actor));
  const ended = new Date(opts.startedAt.getTime() + seconds * 1000);
  const created = await db.runTransaction(async (tx) => {
    const existing = await tx.get(entryRef);
    if (existing.exists) return false;
    tx.set(
      entryRef,
      entryDoc(opts.task, opts.actor, name, opts.startedAt, ended, seconds, "manual", opts.note.slice(0, 500))
    );
    totalsUpdate(tx, { id: opts.task.id, projectId: opts.task.projectId ?? null }, seconds, opts.actor.kind === "client");
    return true;
  });
  if (created) await logTracked(opts.task, opts.actor, seconds, "Logged");
  return { entryId: entryRef.id, duplicate: !created };
}

/** Correct or delete one's OWN entry. Keeps an append-only revision trail. */
export async function reviseEntry(opts: {
  actor: TimeActor;
  entryId: string;
  action: "edit" | "delete";
  startedAt?: Date;
  durationSeconds?: number;
  note?: string;
  /** Extra guard for portal callers: the entry must be in this sub-account. */
  subAccountId: string;
}): Promise<void> {
  const db = getAdminDb();
  const ref = db.doc(`timeEntries/${opts.entryId}`);
  const key = actorKeyOf(opts.actor);
  let summary = "";
  let taskForLog: (FirebaseFirestore.DocumentData & { id: string }) | null = null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data();
    if (!d || d.subAccountId !== opts.subAccountId) {
      throw new TaskInputError("Time entry not found", 404);
    }
    if (d.actorKey !== key) {
      // Owners review client time; nobody silently alters someone else's entry.
      throw new TaskInputError("You can only change your own time entries.", 403);
    }
    if (d.deleted) throw new TaskInputError("This entry was deleted.", 409);
    const before = {
      startedAt: d.startedAt ?? null,
      endedAt: d.endedAt ?? null,
      durationSeconds: d.durationSeconds ?? 0,
      note: d.note ?? "",
    };
    const revision = { at: Timestamp.now(), byActorKey: key, action: opts.action === "delete" ? "deleted" : "edited", before };
    const taskSnap = await tx.get(taskDocRef(d.taskId));
    const taskRef = { id: d.taskId as string, projectId: (d.projectId as string | null) ?? null };
    if (opts.action === "delete") {
      tx.set(ref, { deleted: true, revisions: FieldValue.arrayUnion(revision), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (taskSnap.exists) totalsUpdate(tx, taskRef, -(d.durationSeconds ?? 0), d.actorKind === "client");
      summary = `Removed a ${formatDuration(d.durationSeconds ?? 0)} time entry`;
    } else {
      const seconds =
        opts.durationSeconds !== undefined ? Math.round(opts.durationSeconds) : (d.durationSeconds as number);
      if (!Number.isFinite(seconds) || seconds < 60 || seconds > MAX_ENTRY_SECONDS) {
        throw new TaskInputError("Enter between 1 minute and 24 hours.");
      }
      const started = opts.startedAt ?? (d.startedAt as Timestamp).toDate();
      if (started.getTime() > Date.now() + 5 * 60_000) {
        throw new TaskInputError("Time entries can't be in the future.");
      }
      tx.set(
        ref,
        {
          startedAt: Timestamp.fromDate(started),
          endedAt: Timestamp.fromDate(new Date(started.getTime() + seconds * 1000)),
          durationSeconds: seconds,
          note: opts.note !== undefined ? opts.note.slice(0, 500) : d.note ?? "",
          revisions: FieldValue.arrayUnion(revision),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      if (taskSnap.exists) totalsUpdate(tx, taskRef, seconds - (d.durationSeconds ?? 0), d.actorKind === "client");
      summary =
        seconds !== d.durationSeconds
          ? `Corrected a time entry (${formatDuration(d.durationSeconds ?? 0)} → ${formatDuration(seconds)})`
          : "Updated a time entry";
    }
    if (taskSnap.exists) taskForLog = { id: taskSnap.id, ...taskSnap.data()! };
  });
  const t = taskForLog as (FirebaseFirestore.DocumentData & { id: string }) | null;
  if (t) {
    await recordTaskActivity({
      subAccountId: t.subAccountId,
      agencyId: t.agencyId,
      taskId: t.id,
      projectId: t.projectId ?? null,
      taskTitle: t.title ?? "",
      type: "time_corrected",
      actor: taskActor(opts.actor),
      summary,
      visibility: opts.actor.kind === "client" ? activityVisibilityFor(t) : "internal",
    });
  }
}

/**
 * Entries for one task. Staff see everything on the task (their own entries
 * editable; client entries read-only). Portal callers pass `onlyActorKey`
 * so a client only ever sees their own time.
 */
export async function listEntriesForTask(opts: {
  taskId: string;
  subAccountId: string;
  viewerKey: string;
  onlyActorKey?: string;
}): Promise<TimeEntryView[]> {
  const snap = await getAdminDb()
    .collection("timeEntries")
    .where("taskId", "==", opts.taskId)
    .get();
  return snap.docs
    .filter((d) => {
      const x = d.data();
      if (x.subAccountId !== opts.subAccountId || x.deleted) return false;
      return !opts.onlyActorKey || x.actorKey === opts.onlyActorKey;
    })
    .map((d) => toEntryView(d.id, d.data(), opts.viewerKey))
    .sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
}

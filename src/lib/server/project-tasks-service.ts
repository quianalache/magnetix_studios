import "server-only";

import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { isRoutineTaskId, taskDocRef } from "@/lib/server/task-ref";
import { canViewRoutineTask } from "@/lib/server/routine-access";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { loadEffectiveTerritoryScope } from "@/lib/auth/territory-filter";
import { createTaskServerSide, setTaskCompletedServerSide } from "@/lib/server/tasks-service";
import {
  activityVisibilityFor,
  recomputeProjectTaskCounts,
  recordTaskActivity,
  wouldCreateDependencyCycle,
  type TaskActor,
} from "@/lib/server/task-graph-service";
import { GLOBAL_TERRITORY_ID } from "@/types";
import {
  TASK_PRIORITIES,
  TASK_RECURRENCE_LABELS,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from "@/types/tasks";

/**
 * Projects & Tasks Phase 2 — full task create / update / delete on top of
 * the existing CRM Tasks engine. Every Task Detail edit comes through here
 * (not a browser Firestore write) so due-date history, activity and project
 * progress stay correct, and so project-owned fields can only be set by the
 * server (firestore.rules refuses them from the browser).
 */

type Db = FirebaseFirestore.Firestore;
type Doc = FirebaseFirestore.DocumentData;

export class TaskInputError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

// ── access ────────────────────────────────────────────────────────────────

export type TaskAccess = Exclude<
  Awaited<ReturnType<typeof requireSubAccountMember>>,
  NextResponse
>;

/**
 * Staff access to one task: sub-account membership, then the same territory
 * rule firestore.rules applies to tasks for scoped collaborators ("global"
 * = the shared pool everyone sees).
 */
export async function requireTaskAccess(
  request: Request,
  taskId: string
): Promise<
  { access: TaskAccess; task: Doc; ref: FirebaseFirestore.DocumentReference } | NextResponse
> {
  if (!taskId || taskId.includes("/")) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  const ref = taskDocRef(taskId);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  const task = snap.data()!;
  const access = await requireSubAccountMember(request, task.subAccountId);
  if (access instanceof NextResponse) return access;
  // A personal routine's activities read exactly like a missing task to
  // anyone but its owner (shared routines are visible to every member).
  if (isRoutineTaskId(taskId) && !(await canViewRoutineTask(task, access.uid))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  const territoryDenied = await territoryDenial(access, task.territoryId);
  if (territoryDenied) return territoryDenied;
  return { access, task, ref };
}

export async function territoryDenial(
  access: TaskAccess,
  territoryId: string | null | undefined
): Promise<NextResponse | null> {
  if (territoryId === GLOBAL_TERRITORY_ID) return null;
  const scope = await loadEffectiveTerritoryScope(access);
  if (!scope.enforce) return null;
  if (territoryId && (scope.ids ?? []).includes(territoryId)) return null;
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

// ── parsing helpers ─────────────────────────────────────────────────────────

const STATUS_SET = new Set(TASK_STATUSES.map((s) => s.value));
const PRIORITY_SET = new Set(TASK_PRIORITIES.map((p) => p.value));
const RECURRENCE_SET = new Set(Object.keys(TASK_RECURRENCE_LABELS));
const TIME_BLOCKS = new Set(["am", "midday", "pm", "anytime"]);

export function str(v: unknown, max = 5000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
export function parseDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function parseTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [
    ...new Set(
      v
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().slice(0, 40))
        .filter(Boolean)
    ),
  ].slice(0, 20);
}
function parseIdList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [
    ...new Set(
      v.filter((t): t is string => typeof t === "string" && /^[\w-]{1,160}$/.test(t))
    ),
  ].slice(0, 50);
}
let idCounter = 0;
function shortId(): string {
  idCounter = (idCounter + 1) % 1e6;
  return `${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
function parseChecklist(v: unknown) {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, 100)
    .map((c) => {
      const title = str(c?.title, 300);
      if (!title) return null;
      return {
        id: typeof c?.id === "string" && c.id ? c.id.slice(0, 40) : shortId(),
        title,
        done: c?.done === true,
      };
    })
    .filter((c): c is { id: string; title: string; done: boolean } => !!c);
}
function parseAttachments(v: unknown) {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, 50)
    .map((a) => {
      const url = str(a?.url, 2000);
      if (!/^https?:\/\//i.test(url)) return null;
      return {
        id: typeof a?.id === "string" && a.id ? a.id.slice(0, 40) : shortId(),
        name: str(a?.name, 200) || url.replace(/^https?:\/\//i, "").slice(0, 80),
        url,
      };
    })
    .filter((a): a is { id: string; name: string; url: string } => !!a);
}
function parseRecurrence(v: unknown) {
  if (v === null) return null;
  const type = (v as { type?: unknown })?.type;
  if (typeof type !== "string" || !RECURRENCE_SET.has(type)) return undefined;
  const days = Array.isArray((v as { days?: unknown }).days)
    ? ((v as { days: unknown[] }).days.filter(
        (n) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 6
      ) as number[])
    : [];
  return type === "weekly" && days.length ? { type, days } : { type };
}
function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const t = v as { toDate?: () => Date };
  return typeof t.toDate === "function" ? t.toDate() : null;
}
function dayLabel(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "no date";
}

// ── projects ────────────────────────────────────────────────────────────────

export async function loadTaskProject(
  db: Db,
  subAccountId: string,
  projectId: string
): Promise<Doc> {
  const snap = await db.doc(`projects/${projectId}`).get();
  const p = snap.data();
  if (!p || p.subAccountId !== subAccountId) {
    throw new TaskInputError("Project not found", 404);
  }
  if (p.taskModel !== "tasks") {
    // Step-model (pre-Phase-2) projects keep their original checklist.
    throw new TaskInputError(
      "This project uses the original step checklist. Add steps from the project instead."
    );
  }
  return p;
}

/** Project tasks follow their project's client for territory; internal projects use the shared pool. */
async function projectTerritory(db: Db, project: Doc): Promise<string> {
  if (!project.assignedContactId) return GLOBAL_TERRITORY_ID;
  const c = await db.doc(`contacts/${project.assignedContactId}`).get();
  const t = c.data()?.territoryId;
  return typeof t === "string" ? t : GLOBAL_TERRITORY_ID;
}

async function validateStaffAssignee(
  db: Db,
  subAccountId: string,
  uid: string
): Promise<void> {
  const m = await db.doc(`subAccounts/${subAccountId}/subAccountMembers/${uid}`).get();
  if (m.exists && m.data()?.status !== "removed") return;
  // Agency owner is implicitly admin everywhere.
  const u = await db.doc(`users/${uid}`).get();
  const sub = await db.doc(`subAccounts/${subAccountId}`).get();
  if (u.exists && sub.data()?.agencyId && u.data()?.primaryAgencyId === sub.data()?.agencyId) return;
  throw new TaskInputError("That assignee isn't a member of this workspace.");
}

// ── create ──────────────────────────────────────────────────────────────────

export interface CreateFullTaskInput {
  subAccountId: string;
  agencyId: string;
  actor: TaskActor;
  createdByUid: string;
  body: Record<string, unknown>;
  /** Client Portal creations — never trusted for project-owned fields. */
  fromClient?: { memberId: string; contactId: string };
}

export async function createFullTask(input: CreateFullTaskInput) {
  const db = getAdminDb();
  const b = input.body;
  const title = str(b.title, 200);
  if (!title) throw new TaskInputError("Title is required");

  let projectId = typeof b.projectId === "string" && b.projectId ? b.projectId : null;
  let parentTaskId =
    typeof b.parentTaskId === "string" && b.parentTaskId ? b.parentTaskId : null;
  let parent: Doc | null = null;
  if (parentTaskId) {
    const ps = await taskDocRef(parentTaskId).get();
    parent = ps.data() ?? null;
    if (!parent || parent.subAccountId !== input.subAccountId) {
      throw new TaskInputError("Parent task not found", 404);
    }
    if (parent.routineId) {
      throw new TaskInputError(
        "Routine activities can't have subtasks. Use the checklist, or add an activity to the routine."
      );
    }
    if (parent.parentTaskId) {
      throw new TaskInputError("Subtasks can't have their own subtasks.");
    }
    projectId = (parent.projectId as string | null) ?? null;
  }
  const project = projectId
    ? await loadTaskProject(db, input.subAccountId, projectId)
    : null;

  let territoryIdOverride: string | undefined;
  let visibility: "client" | "internal" | null = null;
  let assigneeContactId: string | null = null;
  if (project) {
    territoryIdOverride = await projectTerritory(db, project);
    if (project.assignedContactId) {
      visibility = input.fromClient
        ? "client"
        : parent?.visibility === "internal" || b.visibility === "internal"
          ? "internal"
          : "client";
      if (
        typeof b.assigneeContactId === "string" &&
        b.assigneeContactId === project.assignedContactId
      ) {
        assigneeContactId = project.assignedContactId;
      }
    }
  } else {
    parentTaskId = parentTaskId && parent ? parentTaskId : null;
  }

  const assigneeUid =
    !input.fromClient && typeof b.assigneeUid === "string" && b.assigneeUid
      ? b.assigneeUid
      : null;
  if (assigneeUid) await validateStaffAssignee(db, input.subAccountId, assigneeUid);

  const status =
    typeof b.status === "string" && STATUS_SET.has(b.status as TaskStatus) && b.status !== "completed"
      ? (b.status as TaskStatus)
      : "todo";
  const priority =
    typeof b.priority === "string" && PRIORITY_SET.has(b.priority as TaskPriority)
      ? (b.priority as TaskPriority)
      : null;
  const estimate =
    typeof b.estimateMinutes === "number" && Number.isFinite(b.estimateMinutes)
      ? Math.min(100_000, Math.max(0, Math.round(b.estimateMinutes)))
      : null;
  const recurrence = input.fromClient ? null : parseRecurrence(b.recurrence) ?? null;

  const contactId =
    !input.fromClient && !project && typeof b.contactId === "string" && b.contactId
      ? b.contactId
      : null;
  if (contactId) {
    const c = await db.doc(`contacts/${contactId}`).get();
    if (c.data()?.subAccountId !== input.subAccountId) {
      throw new TaskInputError("Contact not found", 404);
    }
  }

  const { id } = await createTaskServerSide({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    createdByUid: input.createdByUid,
    mode: "live",
    title,
    notes: str(b.notes ?? b.description),
    dueAt: parseDate(b.dueAt),
    contactId,
    dealId: null,
    eventId: null,
    timeBlock:
      typeof b.timeBlock === "string" && TIME_BLOCKS.has(b.timeBlock)
        ? (b.timeBlock as "am" | "midday" | "pm" | "anytime")
        : null,
    territoryIdOverride,
    extra: {
      projectId,
      parentTaskId,
      status,
      priority,
      assigneeUid,
      assigneeContactId,
      tags: parseTags(b.tags),
      estimateMinutes: estimate,
      checklist: parseChecklist(b.checklist),
      attachments: [],
      dependsOnTaskIds: [],
      relatedTaskIds: [],
      recurrence,
      autoRollover: !input.fromClient && b.autoRollover === true,
      rolledOverCount: 0,
      timeSpentSeconds: 0,
      clientTimeSeconds: 0,
      visibility,
      kind: "task",
      createdByMemberId: input.fromClient?.memberId ?? null,
    },
  });

  await recordTaskActivity({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    taskId: id,
    projectId,
    taskTitle: title,
    type: "created",
    actor: input.actor,
    summary: "Created this task",
    visibility: visibility === "client" ? "client" : "internal",
  });
  if (parentTaskId && parent) {
    await recordTaskActivity({
      subAccountId: input.subAccountId,
      agencyId: input.agencyId,
      taskId: parentTaskId,
      projectId,
      taskTitle: parent.title ?? "",
      type: "subtask_added",
      actor: input.actor,
      summary: `Added subtask “${title}”`,
      detail: { subtaskId: id },
      visibility: activityVisibilityFor(parent),
    });
  }
  if (projectId) await recomputeProjectTaskCounts(projectId);
  return id;
}

// ── update ──────────────────────────────────────────────────────────────────

const CLIENT_EDITABLE = new Set([
  "title",
  "notes",
  "description",
  "dueAt",
  "priority",
  "status",
  "checklist",
  "tags",
]);

/**
 * Applies a partial edit. `fromClient` narrows the editable fields to what a
 * Client Portal member may change on their OWN tasks (the route decides
 * ownership). Records one activity row per meaningful change and keeps the
 * due-date history.
 */
export async function updateFullTask(opts: {
  taskId: string;
  task: Doc;
  actor: TaskActor;
  patch: Record<string, unknown>;
  fromClient?: boolean;
}) {
  const db = getAdminDb();
  const { task, patch } = opts;
  const ref = taskDocRef(opts.taskId);
  const data: Record<string, unknown> = {};
  const events: { type: Parameters<typeof recordTaskActivity>[0]["type"]; summary: string; detail?: Record<string, unknown> }[] = [];
  const keys = Object.keys(patch).filter((k) =>
    opts.fromClient ? CLIENT_EDITABLE.has(k) : true
  );
  const has = (k: string) => keys.includes(k);

  // Routine activities follow their routine's schedule: the date, repeat
  // and rollover settings belong to the routine, not the single occurrence.
  if (task.routineId && ["dueAt", "recurrence", "autoRollover"].some(has)) {
    throw new TaskInputError(
      "This is a routine activity. Change its schedule from the routine instead."
    );
  }

  if (has("title")) {
    const t = str(patch.title, 200);
    if (!t) throw new TaskInputError("Title can't be empty");
    if (t !== task.title) {
      data.title = t;
      events.push({ type: "renamed", summary: `Renamed to “${t}”`, detail: { from: task.title } });
    }
  }
  if (has("notes") || has("description")) data.notes = str(patch.notes ?? patch.description);
  if (has("dueAt")) {
    const next = patch.dueAt === null ? null : parseDate(patch.dueAt);
    const prev = toDate(task.dueAt);
    if ((next?.getTime() ?? null) !== (prev?.getTime() ?? null)) {
      data.dueAt = next ? Timestamp.fromDate(next) : null;
      events.push({
        type: "due_changed",
        summary: next ? `Changed the due date to ${dayLabel(next)}` : "Removed the due date",
        detail: { from: prev?.toISOString() ?? null, to: next?.toISOString() ?? null, reason: "manual" },
      });
    }
  }
  if (has("timeBlock") && !opts.fromClient) {
    data.timeBlock =
      typeof patch.timeBlock === "string" && TIME_BLOCKS.has(patch.timeBlock)
        ? patch.timeBlock
        : null;
  }
  if (has("priority")) {
    const p =
      typeof patch.priority === "string" && PRIORITY_SET.has(patch.priority as TaskPriority)
        ? patch.priority
        : null;
    if (p !== (task.priority ?? null)) {
      data.priority = p;
      events.push({
        type: "priority_changed",
        summary: p ? `Set priority to ${TASK_PRIORITIES.find((x) => x.value === p)?.label}` : "Cleared the priority",
      });
    }
  }
  let completionChange: boolean | null = null;
  if (has("status")) {
    const s = patch.status;
    if (typeof s !== "string" || !STATUS_SET.has(s as TaskStatus)) {
      throw new TaskInputError("Unknown status");
    }
    if (opts.fromClient && s === "completed") {
      // Completion from the portal goes through the completion permission check.
      throw new TaskInputError("Use complete to finish a task.");
    }
    if (s === "completed" && !task.completed) completionChange = true;
    else if (s !== "completed" && task.completed) {
      completionChange = false;
      data.status = s;
    } else if (s !== "completed" && s !== (task.status ?? "todo")) {
      data.status = s;
      events.push({
        type: "status_changed",
        summary: `Changed status to ${TASK_STATUSES.find((x) => x.value === s)?.label}`,
      });
    }
  }
  if (has("assigneeUid") && !opts.fromClient) {
    const uid = typeof patch.assigneeUid === "string" && patch.assigneeUid ? patch.assigneeUid : null;
    if (uid !== (task.assigneeUid ?? null)) {
      if (uid) await validateStaffAssignee(db, task.subAccountId, uid);
      data.assigneeUid = uid;
      if (uid) data.assigneeContactId = null;
      events.push({ type: "assignee_changed", summary: uid ? "Changed the assignee" : "Unassigned the task", detail: { assigneeUid: uid } });
    }
  }
  if (has("assigneeContactId") && !opts.fromClient) {
    const cid = typeof patch.assigneeContactId === "string" && patch.assigneeContactId ? patch.assigneeContactId : null;
    if (cid !== (task.assigneeContactId ?? null)) {
      if (cid) {
        const project = task.projectId
          ? (await db.doc(`projects/${task.projectId}`).get()).data()
          : null;
        if (!project || project.assignedContactId !== cid) {
          throw new TaskInputError("Only the project's client can be assigned.");
        }
        data.assigneeUid = null;
        if (task.visibility === "internal") data.visibility = "client";
      }
      data.assigneeContactId = cid;
      events.push({ type: "assignee_changed", summary: cid ? "Assigned the task to the client" : "Unassigned the task", detail: { assigneeContactId: cid } });
    }
  }
  if (has("tags")) data.tags = parseTags(patch.tags);
  if (has("estimateMinutes") && !opts.fromClient) {
    const e = patch.estimateMinutes;
    data.estimateMinutes =
      typeof e === "number" && Number.isFinite(e) ? Math.min(100_000, Math.max(0, Math.round(e))) : null;
  }
  if (has("checklist")) data.checklist = parseChecklist(patch.checklist);
  if (has("attachments") && !opts.fromClient) data.attachments = parseAttachments(patch.attachments);
  if (has("autoRollover") && !opts.fromClient) data.autoRollover = patch.autoRollover === true;
  if (has("recurrence") && !opts.fromClient) {
    const r = parseRecurrence(patch.recurrence);
    if (r === undefined) throw new TaskInputError("Unknown repeat setting");
    data.recurrence = r;
  }
  if (has("visibility") && !opts.fromClient && task.projectId) {
    if (patch.visibility !== "client" && patch.visibility !== "internal") {
      throw new TaskInputError("Unknown visibility");
    }
    if (patch.visibility === "internal" && task.assigneeContactId) {
      throw new TaskInputError("Unassign the client before making this task internal.");
    }
    if (patch.visibility === "internal" && task.createdByMemberId) {
      throw new TaskInputError("Tasks your client created stay visible to them.");
    }
    data.visibility = patch.visibility;
  }
  if (has("dependsOnTaskIds") && !opts.fromClient) {
    const ids = parseIdList(patch.dependsOnTaskIds).filter((id) => id !== opts.taskId);
    if (ids.length) {
      const snaps = await db.getAll(...ids.map((id) => taskDocRef(id)));
      if (snaps.some((s) => s.data()?.subAccountId !== task.subAccountId)) {
        throw new TaskInputError("A linked task wasn't found in this workspace.");
      }
      if (await wouldCreateDependencyCycle(task.subAccountId, opts.taskId, ids)) {
        throw new TaskInputError("That dependency would create a loop.");
      }
    }
    data.dependsOnTaskIds = ids;
  }
  if (has("relatedTaskIds") && !opts.fromClient) {
    const ids = parseIdList(patch.relatedTaskIds).filter((id) => id !== opts.taskId);
    if (ids.length) {
      const snaps = await db.getAll(...ids.map((id) => taskDocRef(id)));
      if (snaps.some((s) => s.data()?.subAccountId !== task.subAccountId)) {
        throw new TaskInputError("A linked task wasn't found in this workspace.");
      }
    }
    data.relatedTaskIds = ids;
  }
  // Existing CRM relationships (standalone tasks; project tasks keep their project context).
  if (has("contactId") && !opts.fromClient) {
    const cid = typeof patch.contactId === "string" && patch.contactId ? patch.contactId : null;
    if (cid) {
      const c = await db.doc(`contacts/${cid}`).get();
      if (c.data()?.subAccountId !== task.subAccountId) throw new TaskInputError("Contact not found", 404);
      if (!task.projectId) {
        const t = c.data()?.territoryId;
        data.territoryId = typeof t === "string" ? t : GLOBAL_TERRITORY_ID;
      }
    } else if (!task.projectId) {
      data.territoryId = GLOBAL_TERRITORY_ID;
    }
    data.contactId = cid;
  }
  if (has("dealId") && !opts.fromClient) {
    const did = typeof patch.dealId === "string" && patch.dealId ? patch.dealId : null;
    if (did) {
      const d = await db.doc(`deals/${did}`).get();
      if (d.data()?.subAccountId !== task.subAccountId) throw new TaskInputError("Deal not found", 404);
    }
    data.dealId = did;
  }

  if (Object.keys(data).length > 0) {
    data.updatedAt = FieldValue.serverTimestamp();
    await ref.set(data, { merge: true });
  }
  const merged = { ...task, ...data };
  const visibility = activityVisibilityFor(merged);
  for (const e of events) {
    await recordTaskActivity({
      subAccountId: task.subAccountId,
      agencyId: task.agencyId,
      taskId: opts.taskId,
      projectId: task.projectId ?? null,
      taskTitle: (merged.title as string) ?? "",
      type: e.type,
      actor: opts.actor,
      summary: e.summary,
      detail: e.detail,
      visibility,
    });
  }
  let warnings: string[] = [];
  if (completionChange !== null) {
    const r = await setTaskCompletedServerSide({
      taskId: opts.taskId,
      completed: completionChange,
      userId: opts.actor.kind === "staff" ? opts.actor.uid : "",
      actor: opts.actor,
    });
    warnings = r?.warnings ?? [];
  }
  return { warnings };
}

// ── delete ──────────────────────────────────────────────────────────────────

/** Deletes a task and its subtasks, unlinks it from other tasks' connections. Time entries are kept (audit). */
export async function deleteFullTask(opts: { taskId: string; task: Doc; actor: TaskActor }) {
  const db = getAdminDb();
  const { task } = opts;
  if (task.routineId) {
    // Deleting one date's activity would just be regenerated; history stays intact.
    throw new TaskInputError(
      "Routine activities can't be deleted one by one. Remove the activity from the routine, or pause the routine."
    );
  }
  const subtasks = await db
    .collection("tasks")
    .where("subAccountId", "==", task.subAccountId)
    .where("parentTaskId", "==", opts.taskId)
    .get();
  const ids = [opts.taskId, ...subtasks.docs.map((d) => d.id)];
  const batch = db.batch();
  for (const id of ids) batch.delete(db.doc(`tasks/${id}`));
  for (const field of ["dependsOnTaskIds", "relatedTaskIds"] as const) {
    const linked = await db
      .collection("tasks")
      .where("subAccountId", "==", task.subAccountId)
      .where(field, "array-contains", opts.taskId)
      .get();
    for (const d of linked.docs) {
      if (!ids.includes(d.id)) batch.update(d.ref, { [field]: FieldValue.arrayRemove(opts.taskId) });
    }
  }
  const timer = await db
    .collection("activeTimers")
    .where("taskId", "in", ids.slice(0, 30))
    .get();
  timer.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  await recordTaskActivity({
    subAccountId: task.subAccountId,
    agencyId: task.agencyId,
    taskId: opts.taskId,
    projectId: task.projectId ?? null,
    taskTitle: task.title ?? "",
    type: "deleted",
    actor: opts.actor,
    summary: `Deleted task “${task.title ?? ""}”`,
    visibility: activityVisibilityFor(task),
  });
  if (task.projectId) await recomputeProjectTaskCounts(task.projectId as string);
}

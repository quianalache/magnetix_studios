import "server-only";

import { randomBytes } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { GLOBAL_TERRITORY_ID } from "@/types";
import { setTaskCompletedServerSide } from "@/lib/server/tasks-service";
import { ROUTINE_TASKS_COLLECTION, taskDocRef } from "@/lib/server/task-ref";
import { taskJson } from "@/lib/server/task-serialize";
import { canManageRoutine, canViewRoutine, routineOwnerUid } from "@/lib/server/routine-access";
import { TaskInputError } from "@/lib/server/project-tasks-service";
import type { TaskActor } from "@/lib/server/task-graph-service";
import {
  addDaysYmd,
  blockForTime,
  isClock,
  isYmd,
  monthEndYmd,
  monthStartYmd,
  nextOccurrenceOnOrAfter,
  normalizeSchedule,
  occurrencesBetween,
  occursOn,
  previousOccurrenceOnOrBefore,
  ScheduleError,
  todayInTimeZone,
  weekStartYmd,
  zonedDateTimeToUtc,
  formatYmd,
} from "@/lib/routines/schedule";
import {
  MAX_ROUTINE_ACTIVITIES,
  ROUTINE_COLOR_KEYS,
  ROUTINE_ICON_KEYS,
  type ProjectRoutineItem,
  type Routine,
  type RoutineActivity,
  type RoutineCalendarEntry,
  type RoutineColorKey,
  type RoutineDaySummary,
  type RoutineIconKey,
  type RoutineListItem,
  type RoutineOccurrenceTask,
  type RoutineSchedule,
  type RoutineTimeBlock,
  type RoutineTimeMode,
  type RoutineView,
} from "@/types/routines";

/**
 * Routines service (Projects & Tasks, 2026-09). See src/types/routines.ts
 * for the model. The rules this file enforces:
 *
 * 1. Occurrence tasks are generated ONLY for a date that has arrived (the
 *    hourly cron + opening a routine materialize "today"), or when someone
 *    checks off a specific date. Future dates are projected from the
 *    schedule, never written — so the Calendar and My Tasks don't fill up
 *    with months of placeholder tasks.
 * 2. Ids are deterministic and written with create(), so any number of
 *    overlapping generations yields exactly one task per activity per date.
 * 3. Completion is per task, per date. Nothing ever copies a completion
 *    forward; last week's records are separate documents and stay intact.
 * 4. Editing or pausing a routine only reconciles UNTOUCHED occurrences
 *    dated today or later (not completed, no tracked time). Past and
 *    completed occurrences are history and are never rewritten.
 * 5. Privacy: routines are PERSONAL by default (see routine-access.ts).
 *    Occurrence tasks live in the server-only `routineTasks` collection,
 *    so the browser's `tasks` queries (My Tasks, Calendar, badges, search,
 *    public API, AI Suite) never see them; every read below is filtered to
 *    the viewer. Generating them emits NO `task.created` webhook, and
 *    completing them emits no `task.completed` event.
 */

export interface RoutineViewer {
  uid: string;
  /** Sub-account role from requireSubAccountMember (admins may manage SHARED routines). */
  role: string | null;
}

type Doc = FirebaseFirestore.DocumentData;

const TASK_ID_PREFIX = "rt_";
/** How far ahead a date may be checked off early (e.g. doing Monday's reset on Sunday). */
const EARLY_COMPLETION_DAYS = 7;
/** Max range one read may span (Calendar month grid = 42 days). */
const MAX_RANGE_DAYS = 62;

export function occurrenceTaskId(routineId: string, date: string, activityId: string): string {
  return `${TASK_ID_PREFIX}${routineId}_${date.replace(/-/g, "")}_${activityId}`;
}

function newActivityId(): string {
  return `a${randomBytes(4).toString("hex")}`;
}

function toIso(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | null | undefined;
  if (t && typeof t.toDate === "function") return t.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  return null;
}

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | null | undefined;
  if (t && typeof t.toDate === "function") return t.toDate();
  return v instanceof Date ? v : null;
}

// ── context ──────────────────────────────────────────────────────────────────

export async function subAccountTimeZone(subAccountId: string): Promise<string> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  return (snap.data()?.timezone as string) || "UTC";
}

export async function loadRoutine(
  subAccountId: string,
  routineId: string
): Promise<Routine> {
  if (!routineId || routineId.includes("/")) throw new TaskInputError("Routine not found", 404);
  const snap = await getAdminDb().doc(`routines/${routineId}`).get();
  const data = snap.data();
  // Tenant isolation: a foreign id reads exactly like a missing one.
  if (!data || data.subAccountId !== subAccountId) {
    throw new TaskInputError("Routine not found", 404);
  }
  return { ...(data as Omit<Routine, "id">), id: snap.id };
}

/** Like loadRoutine, but a routine the viewer may not see reads as missing. */
export async function loadVisibleRoutine(
  subAccountId: string,
  routineId: string,
  viewer: RoutineViewer
): Promise<Routine> {
  const r = await loadRoutine(subAccountId, routineId);
  if (!canViewRoutine(r, viewer.uid)) throw new TaskInputError("Routine not found", 404);
  return r;
}

async function loadManageableRoutine(
  subAccountId: string,
  routineId: string,
  viewer: RoutineViewer
): Promise<Routine> {
  const r = await loadVisibleRoutine(subAccountId, routineId, viewer);
  if (!canManageRoutine(r, viewer.uid, viewer.role)) {
    throw new TaskInputError("Only the routine's owner can change it.", 403);
  }
  return r;
}

interface ProjectWindow {
  title: string | null;
  windowEnd: string | null;
  windowClosed: boolean;
}

async function projectWindow(
  routine: Pick<Routine, "projectId" | "endsWithProject" | "schedule" | "subAccountId">,
  timeZone: string
): Promise<ProjectWindow> {
  // Routines are independent task containers. Keep this compatibility helper
  // for callers that still expect a window, but never derive one from a
  // Project. Per-task end dates are evaluated from each activity schedule.
  void routine.projectId;
  void routine.endsWithProject;
  void timeZone;
  return { title: null, windowEnd: null, windowClosed: false };
}

function toView(r: Routine, w: ProjectWindow, viewer: RoutineViewer): RoutineView {
  const { createdAt, updatedAt, pausedAt: _paused, ...rest } = r;
  void _paused;
  const ownerUid = routineOwnerUid(r) ?? r.createdByUid;
  return {
    ...rest,
    ownerUid,
    visibility: r.visibility === "shared" ? "shared" : "private",
    createdAt: toIso(createdAt),
    updatedAt: toIso(updatedAt),
    projectTitle: w.title,
    windowEnd: w.windowEnd,
    windowClosed: w.windowClosed,
    isOwner: ownerUid === viewer.uid,
    canManage: canManageRoutine(r, viewer.uid, viewer.role),
  };
}

/** Is `date` a live run date: scheduled AND inside the project window. */
function runsOn(r: Routine, w: ProjectWindow, date: string, activity?: RoutineActivity): boolean {
  if (w.windowClosed) return false;
  if (w.windowEnd && date > w.windowEnd) return false;
  return activity ? occursOn(activity.schedule ?? r.schedule, date) : occursOn(r.schedule, date);
}

function routineRunsOn(r: Routine, w: ProjectWindow, date: string): boolean {
  return r.activities.some((activity) => runsOn(r, w, date, activity));
}

// ── input ────────────────────────────────────────────────────────────────────

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function parseActivities(
  raw: unknown,
  existing: RoutineActivity[] = [],
  fallbackSchedule?: RoutineSchedule,
  fallbackTimeMode: RoutineTimeMode = "anytime",
  fallbackTimeBlock: RoutineTimeBlock | null = null,
  fallbackTime: string | null = null,
  today?: string
): RoutineActivity[] {
  if (!Array.isArray(raw)) throw new TaskInputError("Add at least one activity.");
  const known = new Set(existing.map((a) => a.id));
  const seen = new Set<string>();
  const out: RoutineActivity[] = [];
  for (const item of raw.slice(0, MAX_ROUTINE_ACTIVITIES)) {
    const a = (item ?? {}) as Record<string, unknown>;
    const title = str(a.title, 200);
    if (!title) continue;
    // Keep an id the routine already had (so history lines up); mint new ones otherwise.
    let id = typeof a.id === "string" && known.has(a.id) && !seen.has(a.id) ? a.id : newActivityId();
    while (seen.has(id)) id = newActivityId();
    seen.add(id);
    const est = typeof a.estimateMinutes === "number" ? Math.round(a.estimateMinutes) : Number(a.estimateMinutes);
    let taskSchedule = fallbackSchedule;
    if (a.schedule && typeof a.schedule === "object" && today) {
      try {
        taskSchedule = normalizeSchedule(a.schedule as Record<string, unknown>, today);
      } catch (err) {
        if (err instanceof ScheduleError) throw new TaskInputError(`Schedule for “${title}”: ${err.message}`);
        throw err;
      }
    }
    const taskMode = a.timeMode === "block" || a.timeMode === "time" ? a.timeMode : fallbackTimeMode;
    const taskBlock = taskMode === "block"
      ? (a.timeBlock === "midday" || a.timeBlock === "pm" ? a.timeBlock : fallbackTimeBlock ?? "am")
      : null;
    const rawTime = typeof a.time === "string" ? a.time : fallbackTime;
    if (taskMode === "time" && !isClock(rawTime)) throw new TaskInputError(`Enter a valid time for “${title}”.`);
    out.push({
      id,
      title,
      estimateMinutes: Number.isFinite(est) && est > 0 ? Math.min(1440, est) : null,
      notes: str(a.notes, 2000),
      description: str(a.description ?? a.notes, 2000),
      priority: typeof a.priority === "string" ? a.priority.slice(0, 30) : null,
      tags: Array.isArray(a.tags) ? a.tags.filter((v): v is string => typeof v === "string").slice(0, 20) : [],
      schedule: taskSchedule,
      timeMode: taskMode,
      timeBlock: taskBlock,
      time: taskMode === "time" ? rawTime as string : null,
    });
  }
  if (out.length === 0) throw new TaskInputError("Add at least one activity.");
  return out;
}

interface RoutineFields {
  name: string;
  description: string;
  icon: RoutineIconKey;
  color: RoutineColorKey;
  schedule: Routine["schedule"];
  timeMode: RoutineTimeMode;
  timeBlock: RoutineTimeBlock | null;
  time: string | null;
  activities: RoutineActivity[];
  projectId: string | null;
  endsWithProject: boolean;
  visibility: "private" | "shared";
}

async function parseRoutineInput(
  subAccountId: string,
  body: Record<string, unknown>,
  today: string,
  existing: Routine | null,
  viewer: RoutineViewer
): Promise<RoutineFields> {
  const pick = <K extends keyof Routine>(k: K): unknown =>
    k in body ? body[k as string] : existing?.[k];

  const name = str(pick("name"), 120);
  if (!name) throw new TaskInputError("Give the routine a name.");
  const icon = ROUTINE_ICON_KEYS.includes(pick("icon") as RoutineIconKey)
    ? (pick("icon") as RoutineIconKey)
    : "sparkles";
  const color = ROUTINE_COLOR_KEYS.includes(pick("color") as RoutineColorKey)
    ? (pick("color") as RoutineColorKey)
    : "violet";

  let schedule: Routine["schedule"];
  try {
    const raw = (pick("schedule") ?? {}) as Record<string, unknown>;
    // A routine edited after it started keeps its original anchor unless the editor sends a new one.
    schedule = normalizeSchedule(
      { ...raw, startDate: isYmd(raw.startDate) ? raw.startDate : existing?.schedule.startDate ?? today },
      today
    );
  } catch (err) {
    if (err instanceof ScheduleError) throw new TaskInputError(err.message);
    throw err;
  }

  const timeModeRaw = pick("timeMode");
  const timeMode: RoutineTimeMode =
    timeModeRaw === "block" || timeModeRaw === "time" ? timeModeRaw : "anytime";
  const blockRaw = pick("timeBlock");
  const timeBlock: RoutineTimeBlock | null =
    timeMode === "block"
      ? blockRaw === "midday" || blockRaw === "pm" ? blockRaw : "am"
      : null;
  const timeRaw = pick("time");
  if (timeMode === "time" && !isClock(timeRaw)) {
    throw new TaskInputError("Enter a specific time, or choose Anytime.");
  }
  const time = timeMode === "time" ? (timeRaw as string) : null;

  const activities = parseActivities(pick("activities"), existing?.activities ?? [], schedule, timeMode, timeBlock, time, today);
  // Private by default. Only the owner decides who can see it.
  const currentVisibility = existing?.visibility === "shared" ? "shared" : "private";
  let visibility: "private" | "shared" = currentVisibility;
  if ("visibility" in body && (body.visibility === "private" || body.visibility === "shared")) {
    const isOwner = !existing || routineOwnerUid(existing) === viewer.uid;
    if (body.visibility !== currentVisibility && !isOwner) {
      throw new TaskInputError("Only the routine's owner can change who can see it.", 403);
    }
    visibility = body.visibility;
  }

  return {
    name,
    description: str(pick("description"), 1000),
    icon,
    color,
    schedule,
    timeMode,
    timeBlock,
    time,
    activities,
    projectId: null,
    endsWithProject: false,
    visibility,
  };
}

// ── occurrence generation ────────────────────────────────────────────────────

function activityTiming(r: Routine, a: RoutineActivity, date: string, timeZone: string) {
  const mode = a.timeMode ?? r.timeMode;
  const time = a.time ?? r.time;
  if (mode === "time" && time) {
    return { dueAt: zonedDateTimeToUtc(date, time, timeZone), timeBlock: blockForTime(time) };
  }
  return {
    dueAt: zonedDateTimeToUtc(date, "12:00", timeZone),
    timeBlock: mode === "block" && (a.timeBlock ?? r.timeBlock) ? (a.timeBlock ?? r.timeBlock)! : ("anytime" as const),
  };
}

function isAlreadyExists(err: unknown): boolean {
  const code = (err as { code?: number | string }).code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
}

/**
 * Makes sure every current activity has its task for `date`. Idempotent:
 * existing tasks (done or not) are left exactly as they are.
 */
export async function ensureOccurrence(r: Routine, date: string, timeZone: string): Promise<number> {
  const db = getAdminDb();
  const refs = r.activities.map((a) => taskDocRef(occurrenceTaskId(r.id, date, a.id)));
  const existing = refs.length ? await db.getAll(...refs) : [];
  let created = 0;
  for (let i = 0; i < r.activities.length; i++) {
    if (existing[i]?.exists) continue;
    const a = r.activities[i];
    if (!occursOn(a.schedule ?? r.schedule, date)) continue;
    const { dueAt, timeBlock } = activityTiming(r, a, date, timeZone);
    const ownerUid = routineOwnerUid(r) ?? r.createdByUid;
    try {
      // Same document shape as an ordinary task (so the shared Tasks
      // services work on it), written directly: generated activities emit
      // no task.created webhook / workflow event (owner decision).
      await refs[i].create({
        title: a.title,
        notes: a.notes,
        dueAt: Timestamp.fromDate(dueAt),
        completed: false,
        completedAt: null,
        contactId: null,
        dealId: null,
        eventId: null,
        timeBlock,
        agencyId: r.agencyId,
        subAccountId: r.subAccountId,
        createdByUid: ownerUid,
        territoryId: GLOBAL_TERRITORY_ID,
        mode: "live",
        routineId: r.id,
        routineName: r.name,
        routineActivityId: a.id,
        occurrenceDate: date,
        ownerUid,
        status: "todo",
        priority: null,
        assigneeUid: ownerUid,
        tags: ["routine"],
        estimateMinutes: a.estimateMinutes,
        autoRollover: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      created++;
    } catch (err) {
      if (!isAlreadyExists(err)) throw err;
    }
  }
  return created;
}

async function occurrenceTasksInRange(
  subAccountId: string,
  from: string,
  to: string
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const snap = await getAdminDb()
    .collection(ROUTINE_TASKS_COLLECTION)
    .where("subAccountId", "==", subAccountId)
    .where("occurrenceDate", ">=", from)
    .where("occurrenceDate", "<=", to)
    .get();
  return snap.docs.filter((d) => typeof d.data().routineId === "string");
}

function untouched(t: Doc): boolean {
  return t.completed !== true && !(Number(t.timeSpentSeconds) > 0);
}

/**
 * After an edit / pause / delete: bring UNTOUCHED occurrences dated today
 * or later in line with the routine (or remove them), then generate today
 * if it's a run date. History (past or touched tasks) is never changed.
 */
async function reconcileUpcoming(r: Routine | null, routineId: string, subAccountId: string, timeZone: string) {
  const db = getAdminDb();
  const today = todayInTimeZone(timeZone);
  const snap = await db
    .collection(ROUTINE_TASKS_COLLECTION)
    .where("subAccountId", "==", subAccountId)
    .where("occurrenceDate", ">=", today)
    .get();
  const w = r ? await projectWindow(r, timeZone) : null;
  const byActivity = new Map((r?.activities ?? []).map((a) => [a.id, a]));
  const batch = db.batch();
  let writes = 0;
  for (const d of snap.docs) {
    const t = d.data();
    if (t.routineId !== routineId || !untouched(t)) continue;
    const activity = byActivity.get(t.routineActivityId as string);
    const keep = r && r.status === "active" && w && activity && runsOn(r, w, t.occurrenceDate as string, activity);
    if (!keep) {
      batch.delete(d.ref);
    } else {
      const { dueAt, timeBlock } = activityTiming(r, activity, t.occurrenceDate as string, timeZone);
      batch.update(d.ref, {
        title: activity.title,
        notes: activity.notes,
        estimateMinutes: activity.estimateMinutes,
        routineName: r.name,
        dueAt: Timestamp.fromDate(dueAt),
        timeBlock,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    writes++;
    if (writes >= 450) break;
  }
  if (writes > 0) await batch.commit();
  if (r && r.status === "active" && w && routineRunsOn(r, w, today)) await ensureOccurrence(r, today, timeZone);
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function createRoutine(opts: {
  subAccountId: string;
  agencyId: string;
  viewer: RoutineViewer;
  body: Record<string, unknown>;
}): Promise<RoutineView> {
  const tz = await subAccountTimeZone(opts.subAccountId);
  const today = todayInTimeZone(tz);
  const fields = await parseRoutineInput(opts.subAccountId, opts.body, today, null, opts.viewer);
  const ref = getAdminDb().collection("routines").doc();
  const doc = {
    ...fields,
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    status: "active" as const,
    createdByUid: opts.viewer.uid,
    ownerUid: opts.viewer.uid,
    assigneeUid: opts.viewer.uid,
    pausedAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(doc);
  const routine = await loadRoutine(opts.subAccountId, ref.id);
  const w = await projectWindow(routine, tz);
  if (routineRunsOn(routine, w, today)) await ensureOccurrence(routine, today, tz);
  return toView(routine, w, opts.viewer);
}

export async function updateRoutine(opts: {
  subAccountId: string;
  routineId: string;
  viewer: RoutineViewer;
  body: Record<string, unknown>;
}): Promise<RoutineView> {
  const tz = await subAccountTimeZone(opts.subAccountId);
  const today = todayInTimeZone(tz);
  const existing = await loadManageableRoutine(opts.subAccountId, opts.routineId, opts.viewer);
  const fields = await parseRoutineInput(opts.subAccountId, opts.body, today, existing, opts.viewer);
  const patch: Record<string, unknown> = { ...fields, updatedAt: FieldValue.serverTimestamp() };
  if (opts.body.status === "active" || opts.body.status === "paused") {
    patch.status = opts.body.status;
    if (opts.body.status !== existing.status) {
      patch.pausedAt = opts.body.status === "paused" ? FieldValue.serverTimestamp() : null;
    }
  }
  await getAdminDb().doc(`routines/${opts.routineId}`).update(patch);
  const routine = await loadRoutine(opts.subAccountId, opts.routineId);
  await reconcileUpcoming(routine, routine.id, routine.subAccountId, tz);
  return toView(routine, await projectWindow(routine, tz), opts.viewer);
}

export async function setRoutineStatus(opts: {
  subAccountId: string;
  routineId: string;
  status: "active" | "paused";
  viewer: RoutineViewer;
}): Promise<RoutineView> {
  const tz = await subAccountTimeZone(opts.subAccountId);
  const existing = await loadManageableRoutine(opts.subAccountId, opts.routineId, opts.viewer);
  if (existing.status !== opts.status) {
    await getAdminDb()
      .doc(`routines/${opts.routineId}`)
      .update({
        status: opts.status,
        pausedAt: opts.status === "paused" ? FieldValue.serverTimestamp() : null,
        updatedAt: FieldValue.serverTimestamp(),
      });
  }
  const routine = await loadRoutine(opts.subAccountId, opts.routineId);
  await reconcileUpcoming(routine, routine.id, routine.subAccountId, tz);
  return toView(routine, await projectWindow(routine, tz), opts.viewer);
}

/** Deletes the definition + untouched upcoming activities. Completed and past activity tasks stay as task history. */
export async function deleteRoutine(opts: { subAccountId: string; routineId: string; viewer: RoutineViewer }) {
  const tz = await subAccountTimeZone(opts.subAccountId);
  await loadManageableRoutine(opts.subAccountId, opts.routineId, opts.viewer);
  await reconcileUpcoming(null, opts.routineId, opts.subAccountId, tz);
  await getAdminDb().doc(`routines/${opts.routineId}`).delete();
}

// ── reads ────────────────────────────────────────────────────────────────────

function summarize(
  r: Routine,
  w: ProjectWindow,
  dates: string[],
  tasksByDate: Map<string, Doc[]>,
  today: string
): RoutineDaySummary[] {
  return dates.map((date) => {
    const tasks = tasksByDate.get(date) ?? [];
    const scheduled = r.activities.some((a) => runsOn(r, w, date, a)) ||
      (r.status === "paused" && r.activities.some((a) => occursOn(a.schedule ?? r.schedule, date)) && date < today);
    return {
      date,
      scheduled,
      recorded: tasks.length > 0,
      done: tasks.filter((t) => t.completed === true).length,
      total: tasks.length > 0 ? tasks.length : scheduled ? r.activities.filter((a) => occursOn(a.schedule ?? r.schedule, date)).length : 0,
    };
  });
}

function scheduledActivityCount(r: Routine, w: ProjectWindow, date: string): number {
  return r.activities.filter((a) => runsOn(r, w, date, a)).length;
}

function nextRoutineDate(r: Routine, w: ProjectWindow, from: string): string | null {
  const dates = r.activities
    .map((a) => nextOccurrenceOnOrAfter(a.schedule ?? r.schedule, from, w.windowEnd))
    .filter((d): d is string => !!d)
    .sort();
  return dates[0] ?? null;
}

function groupByRoutineAndDate(docs: FirebaseFirestore.QueryDocumentSnapshot[]) {
  const map = new Map<string, Map<string, Doc[]>>();
  for (const d of docs) {
    const t = d.data();
    const byDate = map.get(t.routineId) ?? new Map<string, Doc[]>();
    const arr = byDate.get(t.occurrenceDate) ?? [];
    arr.push({ ...t, id: d.id });
    byDate.set(t.occurrenceDate, arr);
    map.set(t.routineId, byDate);
  }
  return map;
}

function rangeDates(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysYmd(d, 1)) out.push(d);
  return out;
}

/** Routines the viewer may see in this sub-account: their own + shared ones. */
async function visibleRoutines(subAccountId: string, viewer: RoutineViewer): Promise<Routine[]> {
  const snap = await getAdminDb().collection("routines").where("subAccountId", "==", subAccountId).get();
  return snap.docs
    .map((d) => ({ ...(d.data() as Omit<Routine, "id">), id: d.id }))
    .filter((r) => canViewRoutine(r, viewer.uid));
}

export async function listRoutines(subAccountId: string, viewer: RoutineViewer): Promise<{
  today: string;
  routines: RoutineListItem[];
  projectRoutines: ProjectRoutineItem[];
}> {
  const tz = await subAccountTimeZone(subAccountId);
  const today = todayInTimeZone(tz);
  const routines = await visibleRoutines(subAccountId, viewer);

  const weekStart = weekStartYmd(today);
  const weekEnd = addDaysYmd(weekStart, 6);
  const from = [weekStart, monthStartYmd(today)].sort()[0];
  const to = [weekEnd, monthEndYmd(today)].sort()[1];
  const grouped = groupByRoutineAndDate(routines.length ? await occurrenceTasksInRange(subAccountId, from, to) : []);

  // Generate today for any routine the cron hasn't reached yet this hour.
  const items: RoutineListItem[] = [];
  for (const r of routines) {
    const w = await projectWindow(r, tz);
    let byDate = grouped.get(r.id) ?? new Map<string, Doc[]>();
    if (r.status === "active" && scheduledActivityCount(r, w, today) > 0 && (byDate.get(today)?.length ?? 0) < scheduledActivityCount(r, w, today)) {
      if ((await ensureOccurrence(r, today, tz)) > 0) {
        const fresh = await occurrenceTasksInRange(subAccountId, today, today);
        byDate = new Map(byDate);
        byDate.set(today, fresh.filter((d) => d.data().routineId === r.id).map((d) => ({ ...d.data(), id: d.id })));
      }
    }
    const week = summarize(r, w, rangeDates(weekStart, weekEnd), byDate, today);
    let progress: RoutineListItem["progress"];
    if (r.schedule.unit === "month") {
      const monthDays = summarize(r, w, rangeDates(monthStartYmd(today), monthEndYmd(today)), byDate, today).filter(
        (d) => d.scheduled || d.recorded
      );
      progress = {
        label: "This Month's Progress",
        done: monthDays.reduce((s, d) => s + d.done, 0),
        total: monthDays.reduce((s, d) => s + d.total, 0),
        date: null,
      };
    } else {
      const todays = week.find((d) => d.date === today);
      if (todays && (todays.scheduled || todays.recorded)) {
        progress = { label: "Today's Progress", done: todays.done, total: todays.total, date: today };
      } else {
        const last = previousOccurrenceOnOrBefore(r.schedule, addDaysYmd(today, -1), 62);
        const lastTasks = last ? byDate.get(last) : undefined;
        progress = last
          ? {
              label: `Last: ${formatYmd(last)}`,
              done: lastTasks?.filter((t) => t.completed === true).length ?? 0,
              total: lastTasks?.length || r.activities.length,
              date: last,
            }
          : { label: "Not started yet", done: 0, total: r.activities.length, date: null };
      }
    }
    items.push({
      routine: toView(r, w, viewer),
      today,
      progress,
      week,
      nextDate:
        r.status === "active" && !w.windowClosed
          ? nextRoutineDate(r, w, today)
          : null,
    });
  }

  return { today, routines: items, projectRoutines: await listProjectRoutines(subAccountId) };
}

/** Momentum OS template routines live as recurring project tasks — listed read-only, never migrated. */
async function listProjectRoutines(subAccountId: string): Promise<ProjectRoutineItem[]> {
  const db = getAdminDb();
  const projects = await db.collection("projects").where("subAccountId", "==", subAccountId).get();
  const active = projects.docs.filter((p) => p.data().taskModel === "tasks" && p.data().status === "active");
  const out: ProjectRoutineItem[] = [];
  for (const p of active.slice(0, 50)) {
    const tasks = await db
      .collection("tasks")
      .where("subAccountId", "==", subAccountId)
      .where("projectId", "==", p.id)
      .get();
    for (const t of tasks.docs) {
      const d = t.data();
      if (d.kind !== "routine" || d.completed === true || !d.recurrence?.type) continue;
      out.push({
        taskId: t.id,
        title: d.title ?? "",
        projectId: p.id,
        projectTitle: (p.data().title as string) ?? "",
        recurrenceType: d.recurrence.type,
        timeBlock: d.timeBlock ?? null,
        estimateMinutes: d.estimateMinutes ?? null,
        dueAt: toIso(d.dueAt),
      });
    }
  }
  return out;
}

function serializeOccurrence(id: string, t: Doc): RoutineOccurrenceTask {
  return {
    id,
    title: t.title ?? "",
    notes: t.notes ?? "",
    completed: t.completed === true,
    completedAt: toIso(t.completedAt),
    estimateMinutes: t.estimateMinutes ?? null,
    timeSpentSeconds: Number(t.timeSpentSeconds) || 0,
    activityId: t.routineActivityId,
    date: t.occurrenceDate,
  };
}

function checkRange(from: unknown, to: unknown): { from: string; to: string } {
  if (!isYmd(from) || !isYmd(to) || to < from) throw new TaskInputError("Invalid date range");
  if (addDaysYmd(from, MAX_RANGE_DAYS) < to) throw new TaskInputError("Date range is too long");
  return { from, to };
}

/** Routine + per-date summaries + the activity tasks for a range (a week, or a month for monthly routines). */
export async function getRoutineDetail(opts: {
  subAccountId: string;
  routineId: string;
  from: unknown;
  to: unknown;
  viewer: RoutineViewer;
}) {
  const tz = await subAccountTimeZone(opts.subAccountId);
  const today = todayInTimeZone(tz);
  const r = await loadVisibleRoutine(opts.subAccountId, opts.routineId, opts.viewer);
  const w = await projectWindow(r, tz);
  const { from, to } = checkRange(opts.from, opts.to);
  if (r.status === "active" && routineRunsOn(r, w, today) && from <= today && today <= to) {
    await ensureOccurrence(r, today, tz);
  }
  const docs = (await occurrenceTasksInRange(opts.subAccountId, from, to)).filter(
    (d) => d.data().routineId === r.id
  );
  const byDate = groupByRoutineAndDate(docs).get(r.id) ?? new Map();
  return {
    today,
    routine: toView(r, w, opts.viewer),
    days: summarize(r, w, rangeDates(from, to), byDate, today),
    tasks: docs.map((d) => serializeOccurrence(d.id, d.data())),
    nextDate: r.status === "active" && !w.windowClosed ? nextOccurrenceOnOrAfter(r.schedule, today, w.windowEnd) : null,
  };
}

/**
 * Past occurrences, newest first: every scheduled date since the routine
 * started, plus any recorded date the current schedule no longer covers.
 * `before` pages backwards.
 */
export async function getRoutineHistory(opts: {
  subAccountId: string;
  routineId: string;
  before?: unknown;
  viewer: RoutineViewer;
}) {
  const tz = await subAccountTimeZone(opts.subAccountId);
  const today = todayInTimeZone(tz);
  const r = await loadVisibleRoutine(opts.subAccountId, opts.routineId, opts.viewer);
  const w = await projectWindow(r, tz);
  const to = isYmd(opts.before) ? addDaysYmd(opts.before, -1) : today;
  const created = toDate(r.createdAt);
  const floor = [r.schedule.startDate, created ? todayInTimeZone(tz, created) : r.schedule.startDate].sort()[0];
  const from = [addDaysYmd(to, -(MAX_RANGE_DAYS * 2)), floor].sort()[1];
  if (to < from) return { entries: [], nextBefore: null };
  const docs = (await occurrenceTasksInRange(opts.subAccountId, from, to)).filter(
    (d) => d.data().routineId === r.id
  );
  const byDate = groupByRoutineAndDate(docs).get(r.id) ?? new Map<string, Doc[]>();
  const dates = new Set<string>(byDate.keys());
  for (const d of occurrencesBetween(r.schedule, [from, r.schedule.startDate].sort()[1], to, w.windowEnd)) {
    dates.add(d);
  }
  const sorted = [...dates].sort().reverse();
  const entries = summarize(r, w, sorted.slice(0, 30), byDate, today).map((s) => ({
    ...s,
    total: s.total || (byDate.get(s.date)?.length ?? 0),
  }));
  const reachedStart = from <= floor;
  const oldest = sorted.length > 30 ? sorted[29] : from;
  return { entries, nextBefore: reachedStart && sorted.length <= 30 ? null : oldest };
}

// ── completion ───────────────────────────────────────────────────────────────

async function assertCompletableDate(r: Routine, date: unknown, tz: string): Promise<string> {
  if (!isYmd(date)) throw new TaskInputError("Invalid date");
  const today = todayInTimeZone(tz);
  if (date > addDaysYmd(today, EARLY_COMPLETION_DAYS)) {
    throw new TaskInputError("You can check off this date closer to the day.");
  }
  const w = await projectWindow(r, tz);
  if (!routineRunsOn(r, w, date) || (w.windowEnd && date > w.windowEnd)) {
    // A date the schedule no longer covers can still be worked on if it was recorded.
    const anyRecorded = (await occurrenceTasksInRange(r.subAccountId, date, date)).some(
      (d) => d.data().routineId === r.id
    );
    if (!anyRecorded) throw new TaskInputError("This routine isn't scheduled on that date.");
  }
  return date;
}

export async function setRoutineActivityCompleted(opts: {
  subAccountId: string;
  routineId: string;
  date: unknown;
  activityId: unknown;
  completed: boolean;
  actor: TaskActor & { kind: "staff" };
}) {
  const tz = await subAccountTimeZone(opts.subAccountId);
  // Anyone who can SEE the routine (its owner, or any member for a shared one) may check it off.
  const r = await loadVisibleRoutine(opts.subAccountId, opts.routineId, { uid: opts.actor.uid, role: null });
  const date = await assertCompletableDate(r, opts.date, tz);
  const w = await projectWindow(r, tz);
  if (typeof opts.activityId !== "string") throw new TaskInputError("Invalid activity");
  const taskId = occurrenceTaskId(r.id, date, opts.activityId);
  let snap = await taskDocRef(taskId).get();
  if (!snap.exists) {
    if (!r.activities.some((a) => a.id === opts.activityId)) throw new TaskInputError("Activity not found", 404);
    const activity = r.activities.find((candidate) => candidate.id === opts.activityId);
    if (activity && runsOn(r, w, date, activity)) await ensureOccurrence(r, date, tz);
    snap = await taskDocRef(taskId).get();
    if (!snap.exists) throw new TaskInputError("Activity not found", 404);
  }
  const res = await setTaskCompletedServerSide({
    taskId,
    completed: opts.completed,
    userId: opts.actor.uid,
    expectedSubAccountId: opts.subAccountId,
    actor: opts.actor,
    allowRoutineTask: true,
  });
  if (!res) throw new TaskInputError("Activity not found", 404);
  return { taskId };
}

/** "Mark All Complete" for one date — completes every open activity of THAT date only. */
export async function completeRoutineDate(opts: {
  subAccountId: string;
  routineId: string;
  date: unknown;
  actor: TaskActor & { kind: "staff" };
}) {
  const tz = await subAccountTimeZone(opts.subAccountId);
  const r = await loadVisibleRoutine(opts.subAccountId, opts.routineId, { uid: opts.actor.uid, role: null });
  const date = await assertCompletableDate(r, opts.date, tz);
  if (routineRunsOn(r, await projectWindow(r, tz), date)) await ensureOccurrence(r, date, tz);
  const docs = (await occurrenceTasksInRange(opts.subAccountId, date, date)).filter(
    (d) => d.data().routineId === r.id && d.data().completed !== true
  );
  for (const d of docs) {
    await setTaskCompletedServerSide({
      taskId: d.id,
      completed: true,
      userId: opts.actor.uid,
      expectedSubAccountId: opts.subAccountId,
      actor: opts.actor,
      allowRoutineTask: true,
    });
  }
  return { completed: docs.length };
}

// ── calendar ─────────────────────────────────────────────────────────────────

/**
 * Routine entries for the Calendar: one per routine per run date (projected
 * from the schedule — nothing is written for future dates), plus recorded
 * past dates. Untimed routines carry no clock time.
 */
export async function routineCalendarEntries(opts: {
  subAccountId: string;
  from: unknown;
  to: unknown;
  viewer: RoutineViewer;
}): Promise<RoutineCalendarEntry[]> {
  const { from, to } = checkRange(opts.from, opts.to);
  const tz = await subAccountTimeZone(opts.subAccountId);
  const today = todayInTimeZone(tz);
  const routines = await visibleRoutines(opts.subAccountId, opts.viewer);
  if (routines.length === 0) return [];
  const grouped = groupByRoutineAndDate(await occurrenceTasksInRange(opts.subAccountId, from, to));
  const out: RoutineCalendarEntry[] = [];
  for (const r of routines) {
    const w = await projectWindow(r, tz);
    const byDate = grouped.get(r.id) ?? new Map<string, Doc[]>();
    const dates = new Set<string>(byDate.keys());
    if (r.status === "active") {
      for (const date of occurrencesBetween(r.schedule, [from, today].sort()[1], to, w.windowEnd)) {
        if (!w.windowClosed) dates.add(date);
      }
    }
    for (const date of [...dates].sort()) {
      const tasks = byDate.get(date) ?? [];
      out.push({
        routineId: r.id,
        name: r.name,
        icon: r.icon,
        color: r.color,
        date,
        timeMode: r.timeMode,
        timeBlock: r.timeBlock,
        time: r.time,
        done: tasks.filter((t) => t.completed === true).length,
        total: tasks.length || r.activities.length,
      });
    }
  }
  return out;
}

// ── My Tasks ─────────────────────────────────────────────────────────────────

/**
 * The viewer's routine activities for My Tasks and the due-today badge:
 * everything from routines they can see, dated from 30 days ago to 7 days
 * ahead — EXCEPT missed ones (past and unfinished), which stay in the
 * routine's History and are never shown as overdue ordinary tasks.
 * Generates today's activities first so the list is current.
 */
export async function listRoutineActivities(subAccountId: string, viewer: RoutineViewer) {
  const tz = await subAccountTimeZone(subAccountId);
  const today = todayInTimeZone(tz);
  const routines = await visibleRoutines(subAccountId, viewer);
  if (routines.length === 0) return { today, tasks: [] as Record<string, unknown>[] };
  for (const r of routines) {
    if (r.status !== "active") continue;
    const w = await projectWindow(r, tz);
      if (routineRunsOn(r, w, today)) await ensureOccurrence(r, today, tz);
  }
  const ids = new Set(routines.map((r) => r.id));
  const docs = await occurrenceTasksInRange(subAccountId, addDaysYmd(today, -30), addDaysYmd(today, EARLY_COMPLETION_DAYS));
  const tasks = docs
    .filter((d) => ids.has(d.data().routineId))
    .filter((d) => d.data().completed === true || d.data().occurrenceDate >= today)
    .map((d) => taskJson(d.id, d.data()));
  return { today, tasks };
}

// ── cron ─────────────────────────────────────────────────────────────────────

/** Hourly: generate today's activities for every active routine whose run date it is. */
export async function runRoutineGeneration(now = new Date()) {
  const db = getAdminDb();
  const snap = await db.collection("routines").where("status", "==", "active").get();
  const tzCache = new Map<string, string>();
  let checked = 0;
  let created = 0;
  for (const d of snap.docs) {
    checked++;
    const r = { ...(d.data() as Omit<Routine, "id">), id: d.id };
    try {
      let tz = tzCache.get(r.subAccountId);
      if (!tz) {
        tz = await subAccountTimeZone(r.subAccountId);
        tzCache.set(r.subAccountId, tz);
      }
      const today = todayInTimeZone(tz, now);
      const w = await projectWindow(r, tz);
      if (routineRunsOn(r, w, today)) created += await ensureOccurrence(r, today, tz);
    } catch (err) {
      console.warn("[routines] generation failed", r.id, err);
    }
  }
  return { checked, created };
}

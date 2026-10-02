/**
 * Routines — end-to-end checks. EMULATOR ONLY (Firestore + Auth, `demo-*`
 * project, no production credentials). Runs the REAL routines service,
 * the staff route handlers and the shared Tasks services against isolated
 * fixtures, plus firestore.rules under the client SDK:
 *
 *   validation, per-date generation with deterministic ids (no duplicates
 *   from cron / list / detail / concurrent calls), per-date completion +
 *   Mark All Complete, early-completion window, completion history
 *   (never overwritten), progress summaries, edits reconciling only
 *   untouched upcoming activities, pause / resume / delete, specific-time
 *   and time-block timing, Calendar projection (no writes for future
 *   dates, untimed = no clock time), project windows, tenant isolation,
 *   project-generated routines (preserved, listed read-only), existing task
 *   regressions (standalone, recurring, rollover, My Tasks completion
 *   route), rules for the new fields, Rituals untouched — plus (2026-09-28
 *   adjustments) personal-by-default privacy against other members,
 *   sub-account admins and the agency owner across every route, optional
 *   sharing, the browser's `tasks` queries, and webhooks (none for routine
 *   activities; unchanged for ordinary tasks).
 *
 * Run:
 *   echo '{"firestore":{"rules":"<repo>/firestore.rules"},
 *          "emulators":{"auth":{"port":9099},"firestore":{"port":8080}}}' > /tmp/emu/firebase.json
 *   firebase emulators:exec --config /tmp/emu/firebase.json --only firestore,auth \
 *     --project demo-routines \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx scripts/check-routines.ts"
 */
import assert from "node:assert/strict";
import { viaDispatcher } from "./_via-dispatcher";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { initializeApp as initClient, type FirebaseApp } from "firebase/app";
import {
  collection as cCollection,
  connectFirestoreEmulator,
  deleteDoc as cDelete,
  doc as cDoc,
  getDoc as cGet,
  getDocs as cGetDocs,
  getFirestore as cFirestore,
  query as cQuery,
  setDoc as cSet,
  updateDoc as cUpdate,
  where as cWhere,
  type Firestore as ClientDb,
} from "firebase/firestore";

const PROJECT = process.env.GCLOUD_PROJECT || "demo-routines";
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !PROJECT.startsWith("demo-") ||
  process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS
) {
  console.error("Refusing to run: needs Firestore + Auth emulators, a demo-* project and no production credentials.");
  process.exit(2);
}
for (const k of ["RESEND_API_KEY", "QSTASH_TOKEN", "QSTASH_URL", "OPENROUTER_API_KEY", "VAPID_PRIVATE_KEY", "STRIPE_SECRET_KEY"]) {
  delete process.env[k];
}
initializeApp({ projectId: PROJECT });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
const auth = getAuth();

const AG = "ag1";
const SA = "sa1";
const SA2 = "sa2";
const TZ = "America/New_York";

let passes = 0;
let failures = 0;
async function check(label: string, fn: () => Promise<void>) {
  try {
    await fn();
    passes++;
    console.log(`PASS  ${label}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${label} — ${(err as Error).message}`);
  }
}
async function rule(label: string, allowed: boolean, op: () => Promise<unknown>) {
  await check(`${allowed ? "allow" : "deny "}  ${label}`, async () => {
    try {
      await op();
      assert.ok(allowed, "was ALLOWED");
    } catch (err) {
      if (allowed) throw err;
      assert.equal((err as { code?: string }).code, "permission-denied", String(err));
    }
  });
}

async function seed() {
  for (const [uid, agencyRole] of [["admin1", null], ["outsider", null], ["member2", null], ["admin3", null], ["boss", "owner"]] as const) {
    await auth.createUser({ uid, email: `${uid}@example.test` });
    await auth.setCustomUserClaims(uid, { status: "active", agencyId: AG, agencyRole });
    await db.doc(`users/${uid}`).set({ status: "active" });
  }
  const w = (p: string, d: Record<string, unknown>) => db.doc(p).set(d);
  await w(`subAccounts/${SA}`, { agencyId: AG, name: "Studio", timezone: TZ });
  await w(`subAccounts/${SA2}`, { agencyId: AG, name: "Other", timezone: "UTC" });
  await w(`subAccounts/${SA}/subAccountMembers/admin1`, { status: "active", role: "admin", displayName: "Quiana" });
  await w(`subAccounts/${SA2}/subAccountMembers/outsider`, { status: "active", role: "admin" });
  await w(`subAccounts/${SA}/subAccountMembers/member2`, { status: "active", role: "collaborator", displayName: "Riley" });
  await w(`subAccounts/${SA}/subAccountMembers/admin3`, { status: "active", role: "admin", displayName: "Morgan" });
  // An API/webhook subscriber listening to every event (proves which events fire).
  await w(`subAccounts/${SA}/webhookSubscriptions/hook1`, { subAccountId: SA, agencyId: AG, mode: "live", status: "active", events: [], url: "https://example.test/hook", description: null, secretHash: "x", createdAt: new Date(), updatedAt: new Date() });
  await w(`tasks/legacyTask`, { title: "Legacy follow-up", notes: "", dueAt: null, completed: false, completedAt: null, contactId: null, dealId: null, eventId: null, timeBlock: null, agencyId: AG, subAccountId: SA, createdByUid: "admin1", territoryId: "global" });
  await w(`reflectionRituals/rit1`, { subAccountId: SA, agencyId: AG, name: "Journal", description: "", frequency: "daily", timeBlock: "AM", completedDates: ["2026-09-01"] });
}

function req(uid: string, method = "GET", body?: unknown, url = "http://test.local/x") {
  return new Request(url, {
    method,
    headers: { "x-user-uid": uid, "x-user-email": `${uid}@example.test`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

let appN = 0;
function clientAs(uid: string): ClientDb {
  const app: FirebaseApp = initClient({ projectId: PROJECT }, `c${appN++}`);
  const cdb = cFirestore(app);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(":");
  connectFirestoreEmulator(cdb, host, Number(port), {
    mockUserToken: { sub: uid, user_id: uid, status: "active", agencyId: AG, agencyRole: null },
  });
  return cdb;
}

async function main() {
  await seed();
  const sched = await import("../src/lib/routines/schedule");
  const svc = await import("../src/lib/server/routines-service");
  const tasksSvc = await import("../src/lib/server/tasks-service");
  const full = await import("../src/lib/server/project-tasks-service");
  const rollover = await import("../src/lib/server/task-rollover-service");
  const gen = await import("../src/lib/server/project-generation-service");
  const listRoute = viaDispatcher(await import("../src/app/api/sub-accounts/[id]/routines/[[...path]]/route"), "");
  const oneRoute = viaDispatcher(await import("../src/app/api/sub-accounts/[id]/routines/[[...path]]/route"), "[routineId]");
  const completeRoute = viaDispatcher(await import("../src/app/api/sub-accounts/[id]/routines/[[...path]]/route"), "[routineId]/complete");
  const historyRoute = viaDispatcher(await import("../src/app/api/sub-accounts/[id]/routines/[[...path]]/route"), "[routineId]/history");
  const calendarRoute = viaDispatcher(await import("../src/app/api/sub-accounts/[id]/routines/[[...path]]/route"), "calendar");
  const taskRoute = await import("../src/app/api/tasks/[id]/route");
  const taskCompleteRoute = await import("../src/app/api/tasks/[id]/complete/route");

  const today = sched.todayInTimeZone(TZ);
  const d = (n: number) => sched.addDaysYmd(today, n);
  const saCtx = (id = SA) => ({ params: Promise.resolve({ id }) });
  const rCtx = (routineId: string, id = SA) => ({ params: Promise.resolve({ id, routineId }) });
  const routineTasks = async (routineId: string, date?: string) => {
    const s = await db.collection("routineTasks").where("routineId", "==", routineId).get();
    return s.docs.filter((x) => !date || x.data().occurrenceDate === date);
  };
  const post = async (body: Record<string, unknown>, uid = "admin1") => listRoute.POST(req(uid, "POST", body), saCtx());
  const complete = (routineId: string, body: Record<string, unknown>) =>
    completeRoute.POST(req("admin1", "POST", body), rCtx(routineId));
  const detail = async (routineId: string, from: string, to: string) => {
    const res = await oneRoute.GET(req("admin1", "GET", undefined, `http://test.local/x?from=${from}&to=${to}`), rCtx(routineId));
    assert.equal(res.status, 200, await res.clone().text());
    return (await res.json()) as {
      today: string;
      days: { date: string; scheduled: boolean; recorded: boolean; done: number; total: number }[];
      tasks: { id: string; activityId: string; date: string; completed: boolean }[];
    };
  };
  const dayOf = async (routineId: string, date: string) =>
    (await detail(routineId, date, date)).days[0];

  const baseMorning = {
    name: "Morning Power Routine",
    description: "Start the day focused.",
    icon: "sun",
    color: "orange",
    activities: [
      { title: "Plan the day", estimateMinutes: 10 },
      { title: "Inbox zero", estimateMinutes: 20 },
      { title: "Review metrics", estimateMinutes: 15 },
    ],
    schedule: { frequency: "daily", days: [0, 1, 2, 3, 4, 5, 6], startDate: d(-14) },
  };

  // ── validation ─────────────────────────────────────────────────────────
  await check("validation: missing name, invalid schedules and time → 400; empty routines are valid; legacy project fields are ignored", async () => {
    for (const bad of [
      { ...baseMorning, name: "  " },
      { ...baseMorning, schedule: { frequency: "weekly", days: [] } },
      { ...baseMorning, timeMode: "time", time: "25:00" },
    ]) {
      const res = await post(bad);
      assert.equal(res.status, 400, JSON.stringify(bad).slice(0, 80));
    }
    assert.equal((await db.collection("routines").get()).size, 0, "nothing written");
    const empty = await post({ ...baseMorning, name: "Empty starter routine", activities: [] });
    assert.equal(empty.status, 201);
    await db.doc(`routines/${(await empty.json()).routine.id}`).delete();
    const legacy = await post({ ...baseMorning, name: "Legacy project-shaped routine", projectId: "nope", endsWithProject: true });
    assert.equal(legacy.status, 201);
    const legacyRoutine = (await legacy.json()).routine;
    assert.equal(legacyRoutine.projectId, null);
    assert.equal(legacyRoutine.endsWithProject, false);
  });

  // ── create + generation ────────────────────────────────────────────────
  let morning = "";
  let aIds: string[] = [];
  await check("create: routine saved; today's activities generated as ordinary tasks with deterministic ids", async () => {
    const res = await post(baseMorning);
    assert.equal(res.status, 201);
    const { routine } = await res.json();
    morning = routine.id;
    aIds = routine.activities.map((a: { id: string }) => a.id);
    assert.equal(routine.timeMode, "anytime", "Anytime is the default");
    assert.equal(routine.visibility, "private", "personal by default");
    assert.equal(routine.isOwner, true);
    assert.equal(routine.schedule.endDate, null, "no end date required");
    const tasks = await routineTasks(morning, today);
    assert.equal(tasks.length, 3);
    for (const t of tasks) {
      const x = t.data();
      assert.equal(t.id, svc.occurrenceTaskId(morning, today, x.routineActivityId));
      assert.equal(x.subAccountId, SA);
      assert.equal(x.territoryId, "global");
      assert.equal(x.completed, false);
      assert.equal(x.autoRollover, false);
      assert.equal(x.recurrence, undefined, "no per-task recurrence — the routine schedules dates");
      assert.equal(x.projectId, undefined);
      assert.equal(x.timeBlock, "anytime");
      assert.equal(x.routineName, "Morning Power Routine");
      assert.equal(x.ownerUid, "admin1");
      assert.equal(x.assigneeUid, "admin1");
      assert.equal((await db.doc(`tasks/${t.id}`).get()).exists, false, "never in the browser-readable tasks collection");
      assert.equal(x.dueAt.toDate().toISOString(), sched.zonedDateTimeToUtc(today, "12:00", TZ).toISOString());
    }
    assert.equal((await routineTasks(morning)).length, 3, "no past or future dates were generated");
  });

  await check("duplicate prevention: concurrent ensure + cron + list + detail never create a second copy", async () => {
    const r = await svc.loadRoutine(SA, morning);
    await Promise.all([svc.ensureOccurrence(r, today, TZ), svc.ensureOccurrence(r, today, TZ), svc.ensureOccurrence(r, today, TZ)]);
    await svc.runRoutineGeneration();
    await svc.runRoutineGeneration();
    await listRoute.GET(req("admin1"), saCtx());
    await detail(morning, today, today);
    assert.equal((await routineTasks(morning, today)).length, 3);
  });

  // ── completion history ─────────────────────────────────────────────────
  await check("completing an activity today changes only today's record", async () => {
    const res = await complete(morning, { date: today, activityId: aIds[0], completed: true });
    assert.equal(res.status, 200);
    const t = (await db.doc(`routineTasks/${svc.occurrenceTaskId(morning, today, aIds[0])}`).get()).data()!;
    assert.equal(t.completed, true);
    assert.equal(t.status, "completed");
    const all = await routineTasks(morning);
    assert.equal(all.filter((x) => x.data().completed).length, 1);
    assert.equal(all.filter((x) => x.data().occurrenceDate !== today).length, 0, "no other date touched or created");
  });

  await check("checking off a past date generates just that date, keeps today separate", async () => {
    const res = await complete(morning, { date: d(-1), activityId: aIds[0], completed: true });
    assert.equal(res.status, 200);
    assert.equal((await routineTasks(morning, d(-1))).length, 3);
    assert.deepEqual(await dayOf(morning, d(-1)), { date: d(-1), scheduled: true, recorded: true, done: 1, total: 3 });
    assert.deepEqual(await dayOf(morning, today), { date: today, scheduled: true, recorded: true, done: 1, total: 3 });
  });

  await check("Mark All Complete completes every activity of that date only", async () => {
    const res = await complete(morning, { date: today });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).completed, 2);
    assert.equal((await dayOf(morning, today)).done, 3);
    assert.equal((await dayOf(morning, d(-1))).done, 1, "yesterday unchanged");
    assert.equal((await dayOf(morning, d(1))).done, 0, "tomorrow not pre-completed");
    assert.equal((await dayOf(morning, d(1))).recorded, false, "tomorrow not generated");
  });

  await check("reopening an activity works per date", async () => {
    await complete(morning, { date: today, activityId: aIds[1], completed: false });
    assert.equal((await dayOf(morning, today)).done, 2);
  });

  await check("early check-off: within 7 days allowed; further ahead refused; unscheduled date refused", async () => {
    assert.equal((await complete(morning, { date: d(3), activityId: aIds[0], completed: true })).status, 200);
    assert.equal((await complete(morning, { date: d(10), activityId: aIds[0], completed: true })).status, 400);
    assert.equal((await complete(morning, { date: d(-30), activityId: aIds[0], completed: true })).status, 400, "before the routine started");
    assert.equal((await complete(morning, { date: "2026-13-01" })).status, 400);
  });

  await check("history never overwritten: a fully done past week stays done after new completions", async () => {
    await complete(morning, { date: d(-8) });
    const before = await dayOf(morning, d(-8));
    assert.equal(before.done, 3);
    await complete(morning, { date: d(-2) });
    await complete(morning, { date: d(-1) });
    assert.deepEqual(await dayOf(morning, d(-8)), before);
  });

  await check("history route: newest first; missed days are reported, never written", async () => {
    const res = await historyRoute.GET(req("admin1"), rCtx(morning));
    assert.equal(res.status, 200);
    const { entries } = (await res.json()) as { entries: { date: string; done: number; total: number; recorded: boolean }[] };
    assert.equal(entries[0].date, today);
    const dates = entries.map((e) => e.date);
    assert.deepEqual(dates, [...dates].sort().reverse());
    const missed = entries.find((e) => e.date === d(-5))!;
    assert.deepEqual([missed.done, missed.total, missed.recorded], [0, 3, false]);
    assert.equal((await routineTasks(morning, d(-5))).length, 0);
    assert.equal(entries.find((e) => e.date === d(-8))!.done, 3);
  });

  await check("progress: week summary separates scheduled days from recorded completion", async () => {
    const wk = sched.weekStartYmd(today);
    const res = await detail(morning, wk, sched.addDaysYmd(wk, 6));
    assert.equal(res.days.length, 7);
    assert.ok(res.days.every((x) => x.scheduled), "daily routine is scheduled every day");
    const t = res.days.find((x) => x.date === today)!;
    assert.deepEqual([t.done, t.total], [2, 3]);
    const list = await (await listRoute.GET(req("admin1"), saCtx())).json();
    const item = list.routines.find((i: { routine: { id: string } }) => i.routine.id === morning);
    assert.equal(item.progress.label, "Today's Progress");
    assert.deepEqual([item.progress.done, item.progress.total], [2, 3]);
    assert.equal(item.week.length, 7);
  });

  // ── edits ──────────────────────────────────────────────────────────────
  await check("edit: untouched upcoming activities follow the edit; completed + past records stay as they were", async () => {
    // today: a0 done, a1 open, a2 done. d(3): a0 done (early), a1/a2 open.
    const res = await oneRoute.PATCH(
      req("admin1", "PATCH", {
        activities: [
          { id: aIds[0], title: "Plan the whole day", estimateMinutes: 12 },
          { id: aIds[1], title: "Inbox to zero", estimateMinutes: 25 },
          { title: "Stretch", estimateMinutes: 5 },
        ],
      }),
      rCtx(morning)
    );
    assert.equal(res.status, 200, await res.clone().text());
    const { routine } = await res.json();
    const newId = routine.activities[2].id;
    const get = async (date: string, a: string) => (await db.doc(`routineTasks/${svc.occurrenceTaskId(morning, date, a)}`).get()).data();
    assert.equal((await get(today, aIds[0]))!.title, "Plan the day", "completed today keeps its title");
    assert.equal((await get(today, aIds[1]))!.title, "Inbox to zero", "open today follows the edit");
    assert.ok(await get(today, aIds[2]), "completed activity removed from the routine is kept as history");
    assert.ok(await get(today, newId), "new activity added to today");
    assert.equal(await get(d(3), aIds[2]), undefined, "untouched upcoming activity of a removed step is removed");
    assert.equal((await get(d(3), aIds[0]))!.completed, true);
    assert.equal((await get(d(-1), aIds[1]))!.title, "Inbox zero", "past date untouched");
    assert.ok(await get(d(-1), aIds[2]), "past date keeps removed activity");
  });

  // ── timing ─────────────────────────────────────────────────────────────
  let timed = "";
  await check("specific time: due at that wall-clock time in the sub-account timezone; block from the time", async () => {
    const res = await post({
      name: "Weekly CEO Reset",
      icon: "laptop",
      color: "violet",
      activities: [{ title: "Review finances" }],
      schedule: { frequency: "weekly", days: [sched.weekdayOf(today)], startDate: today },
      timeMode: "time",
      time: "07:30",
    });
    timed = (await res.json()).routine.id;
    const [t] = await routineTasks(timed, today);
    assert.equal(t.data().dueAt.toDate().toISOString(), sched.zonedDateTimeToUtc(today, "07:30", TZ).toISOString());
    assert.equal(t.data().timeBlock, "am");
  });
  await check("time block routine keeps its block and gets no clock time", async () => {
    const res = await post({ name: "Evening Wind Down", activities: [{ title: "Journal" }], schedule: { frequency: "daily" }, timeMode: "block", timeBlock: "pm" });
    const id = (await res.json()).routine.id;
    const [t] = await routineTasks(id, today);
    assert.equal(t.data().timeBlock, "pm");
    await svc.deleteRoutine({ subAccountId: SA, routineId: id, viewer: { uid: "admin1", role: "admin" } });
  });

  // ── calendar ───────────────────────────────────────────────────────────
  await check("Calendar: future dates projected from the schedule, nothing written; untimed has no clock time", async () => {
    const before = (await db.collection("tasks").get()).size;
    const res = await calendarRoute.GET(req("admin1", "GET", undefined, `http://test.local/x?from=${today}&to=${d(13)}`), saCtx());
    assert.equal(res.status, 200);
    const { entries } = await res.json();
    const m = entries.filter((e: { routineId: string }) => e.routineId === morning);
    assert.equal(m.length, 14);
    assert.ok(m.every((e: { timeMode: string; time: string | null }) => e.timeMode === "anytime" && e.time === null));
    const t = entries.filter((e: { routineId: string }) => e.routineId === timed);
    assert.equal(t.length, 2);
    assert.equal(t[0].time, "07:30");
    assert.equal((await db.collection("tasks").get()).size, before, "no tasks written for projected dates");
    const range = await calendarRoute.GET(req("admin1", "GET", undefined, `http://test.local/x?from=${today}&to=${d(200)}`), saCtx());
    assert.equal(range.status, 400, "range cap");
  });

  // ── pause / resume ─────────────────────────────────────────────────────
  await check("pause: untouched upcoming activities removed, completed kept, cron generates nothing", async () => {
    const res = await oneRoute.PATCH(req("admin1", "PATCH", { status: "paused" }), rCtx(morning));
    assert.equal(res.status, 200);
    const todays = await routineTasks(morning, today);
    assert.ok(todays.every((x) => x.data().completed), "only completed activities remain today");
    await svc.runRoutineGeneration();
    assert.equal((await routineTasks(morning, today)).length, todays.length);
    const cal = await (await calendarRoute.GET(req("admin1", "GET", undefined, `http://test.local/x?from=${d(1)}&to=${d(6)}`), saCtx())).json();
    const paused = cal.entries.filter((e: { routineId: string }) => e.routineId === morning);
    // No projected dates while paused — only d(3), where an activity was
    // already checked off early, still shows as a real record.
    assert.deepEqual(paused.map((e: { date: string; done: number }) => [e.date, e.done]), [[d(3), 1]]);
    assert.equal((await dayOf(morning, d(-8))).done, 3, "history intact");
  });
  await check("resume: today's missing activities come back without duplicating completed ones", async () => {
    await oneRoute.PATCH(req("admin1", "PATCH", { status: "active" }), rCtx(morning));
    const todays = await routineTasks(morning, today);
    const r = await svc.loadRoutine(SA, morning);
    assert.equal(todays.length, r.activities.length + 1, "3 current activities + the removed-but-completed one");
    assert.equal(new Set(todays.map((x) => x.id)).size, todays.length);
  });

  // ── legacy project compatibility ───────────────────────────────────────
  await check("routine definitions remain independent of legacy project fields", async () => {
    await db.doc("projects/pWin").set({ agencyId: AG, subAccountId: SA, title: "Launch", status: "active", taskModel: "tasks", dueAt: Timestamp.fromDate(sched.zonedDateTimeToUtc(d(2), "17:00", TZ)) });
    const bound = (await (await post({ name: "Launch daily", activities: [{ title: "Post" }], schedule: { frequency: "daily" }, projectId: "pWin", endsWithProject: true })).json()).routine;
    const free = (await (await post({ name: "Keep going", activities: [{ title: "Post" }], schedule: { frequency: "daily" }, projectId: "pWin" })).json()).routine;
    assert.equal(bound.projectId, null);
    assert.equal(bound.endsWithProject, false);
    assert.equal(bound.windowEnd, null);
    assert.equal(free.projectId, null);
    assert.equal(free.windowEnd, null);
    const cal = await (await calendarRoute.GET(req("admin1", "GET", undefined, `http://test.local/x?from=${today}&to=${d(6)}`), saCtx())).json();
    assert.equal(cal.entries.filter((e: { routineId: string }) => e.routineId === bound.id).length, 7);
    assert.equal(cal.entries.filter((e: { routineId: string }) => e.routineId === free.id).length, 7);
    const t = (await routineTasks(bound.id, today))[0].data();
    assert.equal(t.projectId, undefined, "occurrences never join the project's task list / portal");
    await db.doc("projects/pWin").update({ status: "completed" });
    const view = (await (await oneRoute.GET(req("admin1", "GET", undefined, `http://test.local/x?from=${today}&to=${today}`), rCtx(bound.id))).json()).routine;
    assert.equal(view.windowClosed, false);
    assert.equal((await routineTasks(free.id, today)).length, 1);
  });

  // ── monthly ────────────────────────────────────────────────────────────
  await check("monthly routine: month progress, 1st of month schedule", async () => {
    const res = await post({ name: "Monthly Personal Check-In", icon: "heart", color: "pink", activities: [{ title: "Reflect" }, { title: "Set goals" }], schedule: { frequency: "monthly", monthMode: "dates", monthDates: [1], startDate: sched.monthStartYmd(today) } });
    const id = (await res.json()).routine.id;
    const list = await (await listRoute.GET(req("admin1"), saCtx())).json();
    const item = list.routines.find((i: { routine: { id: string } }) => i.routine.id === id);
    assert.equal(item.progress.label, "This Month's Progress");
    assert.equal(item.progress.total, 2);
    assert.equal(item.nextDate, today === sched.monthStartYmd(today) ? today : sched.addDaysYmd(sched.monthEndYmd(today), 1));
  });

  // ── tenancy ────────────────────────────────────────────────────────────
  await check("tenant isolation: other sub-account can't read, list, complete, edit or see routines on its calendar", async () => {
    assert.equal((await oneRoute.GET(req("outsider", "GET", undefined, `http://test.local/x?from=${today}&to=${today}`), rCtx(morning, SA2))).status, 404);
    assert.equal((await oneRoute.GET(req("outsider", "GET", undefined, `http://test.local/x?from=${today}&to=${today}`), rCtx(morning))).status, 403);
    assert.equal((await completeRoute.POST(req("outsider", "POST", { date: today }), rCtx(morning, SA2))).status, 404);
    assert.equal((await oneRoute.PATCH(req("outsider", "PATCH", { status: "paused" }), rCtx(morning, SA2))).status, 404);
    assert.equal((await oneRoute.DELETE(req("outsider", "DELETE"), rCtx(morning, SA2))).status, 404);
    const list = await (await listRoute.GET(req("outsider"), saCtx(SA2))).json();
    assert.equal(list.routines.length, 0);
    const cal = await (await calendarRoute.GET(req("outsider", "GET", undefined, `http://test.local/x?from=${today}&to=${d(6)}`), saCtx(SA2))).json();
    assert.equal(cal.entries.length, 0);
    assert.equal((await svc.loadRoutine(SA, morning)).status, "active", "unchanged");
  });

  // ── existing tasks: regressions ────────────────────────────────────────
  await check("standalone task create still writes exactly the pre-Phase-2 shape", async () => {
    const { id } = await tasksSvc.createTaskServerSide({ subAccountId: SA, agencyId: AG, createdByUid: "admin1", mode: "live", title: "Workflow task", notes: "", dueAt: null, contactId: null, dealId: null, eventId: null });
    const keys = Object.keys((await db.doc(`tasks/${id}`).get()).data()!).sort();
    assert.deepEqual(keys, ["agencyId", "completed", "completedAt", "contactId", "createdAt", "createdByUid", "dealId", "dueAt", "eventId", "mode", "notes", "subAccountId", "territoryId", "timeBlock", "title", "updatedAt"]);
  });
  await check("recurring task (Phase 2) still spawns its next occurrence exactly once", async () => {
    const { id } = await tasksSvc.createTaskServerSide({ subAccountId: SA, agencyId: AG, createdByUid: "admin1", mode: "live", title: "Weekly report", notes: "", dueAt: new Date(), contactId: null, dealId: null, eventId: null, extra: { recurrence: { type: "weekly" } } });
    await tasksSvc.setTaskCompletedServerSide({ taskId: id, completed: true, userId: "admin1" });
    await tasksSvc.setTaskCompletedServerSide({ taskId: id, completed: false, userId: "admin1" });
    await tasksSvc.setTaskCompletedServerSide({ taskId: id, completed: true, userId: "admin1" });
    assert.ok((await db.doc(`tasks/${id}__1`).get()).exists);
    assert.equal((await db.collection("tasks").where("recurrenceSeriesId", "==", id).get()).size, 1);
  });
  await check("rollover moves only opted-in tasks — missed routine activities are never rolled over", async () => {
    const past = sched.zonedDateTimeToUtc(d(-3), "12:00", TZ);
    await db.doc("tasks/optIn").set({ title: "Opted in", completed: false, autoRollover: true, dueAt: Timestamp.fromDate(past), subAccountId: SA, agencyId: AG, territoryId: "global" });
    const r = await svc.loadRoutine(SA, morning);
    await svc.ensureOccurrence(r, d(-4), TZ);
    await rollover.runRolloverSweep();
    assert.equal((await db.doc("tasks/optIn").get()).data()!.rolledOverCount, 1);
    const missed = await routineTasks(morning, d(-4));
    assert.ok(missed.every((x) => x.data().occurrenceDate === d(-4) && !x.data().rolledOverCount));
  });
  await check("My Tasks completion route completes a routine activity (same Tasks engine)", async () => {
    const id = svc.occurrenceTaskId(morning, today, aIds[1]);
    await db.doc(`routineTasks/${id}`).update({ completed: false, status: "todo" });
    const res = await taskCompleteRoute.POST(req("admin1", "POST", { completed: true }), { params: Promise.resolve({ id }) });
    assert.equal(res.status, 200, await res.clone().text());
    assert.equal((await db.doc(`routineTasks/${id}`).get()).data()!.completed, true);
    assert.equal((await db.collection("tasks").where("recurrenceSeriesId", "==", id).get()).size, 0, "no recurrence spawn");
  });
  await check("routine activity: date / repeat / rollover locked; title editable; occurrence subtasks are isolated", async () => {
    const id = svc.occurrenceTaskId(morning, today, aIds[1]);
    const res = await taskRoute.PATCH(req("admin1", "PATCH", { dueAt: new Date().toISOString() }), { params: Promise.resolve({ id }) });
    assert.equal(res.status, 400);
    const ok = await taskRoute.PATCH(req("admin1", "PATCH", { notes: "Did it early" }), { params: Promise.resolve({ id }) });
    assert.equal(ok.status, 200, await ok.clone().text());
    const subtask = await full.createFullTask({
      subAccountId: SA,
      agencyId: AG,
      actor: { kind: "staff", uid: "admin1" },
      createdByUid: "admin1",
      body: { title: "Occurrence-only follow-up", parentTaskId: id },
    });
    assert.match(subtask, new RegExp(`^${id}_s_`));
    assert.equal((await db.doc(`routineTasks/${subtask}`).get()).data()!.parentTaskId, id);
    const detailRes = await taskRoute.GET(req("admin1"), { params: Promise.resolve({ id }) });
    assert.equal(detailRes.status, 200, await detailRes.clone().text());
    assert.equal(((await detailRes.json()) as { subtasks: unknown[] }).subtasks.length, 1);
    await svc.ensureOccurrence(await svc.loadRoutine(SA, morning), d(1), TZ);
    assert.equal((await routineTasks(morning, d(1))).filter((x) => x.data().parentTaskId === id).length, 0);
    const completeSubtask = await taskCompleteRoute.POST(req("admin1", "POST", { completed: true }), { params: Promise.resolve({ id: subtask }) });
    assert.equal(completeSubtask.status, 200, await completeSubtask.clone().text());
    assert.equal((await db.doc(`routineTasks/${subtask}`).get()).data()!.completed, true);
    assert.equal((await db.doc(`routineTasks/${svc.occurrenceTaskId(morning, d(1), aIds[1])}`).get()).data()!.completed, false);
    assert.equal((await taskRoute.DELETE(req("admin1", "DELETE"), { params: Promise.resolve({ id }) })).status, 400);
    assert.equal((await taskRoute.DELETE(req("admin1", "DELETE"), { params: Promise.resolve({ id: subtask }) })).status, 200);
    assert.equal((await db.doc(`routineTasks/${subtask}`).get()).exists, false);
  });
  await check("project-generated (Momentum OS) routines are preserved and listed read-only, never migrated", async () => {
    const g = await gen.generateProjectFromSystemTemplate({ subAccountId: SA, agencyId: AG, createdByUid: "admin1", templateKey: "sys_weekly_ceo_reset", title: "CEO Reset project", startAt: new Date(), endAt: null, autoSchedule: true, includeRoutines: true, includeMilestones: true, assignedContactId: null });
    assert.equal(g.routines, 2);
    const list = await (await listRoute.GET(req("admin1"), saCtx())).json();
    const mine = list.projectRoutines.filter((p: { projectId: string }) => p.projectId === g.projectId);
    assert.equal(mine.length, 2);
    const tasks = await db.collection("tasks").where("projectId", "==", g.projectId).get();
    const routines = tasks.docs.filter((t) => t.data().kind === "routine");
    assert.ok(routines.every((t) => t.data().recurrence?.type && !t.data().routineId));
    assert.equal(list.routines.some((i: { routine: { name: string } }) => i.routine.name === "CEO Reset project"), false);
  });

  // ── privacy (personal by default) + sharing ───────────────────────────
  const activitiesRoute = viaDispatcher(await import("../src/app/api/sub-accounts/[id]/routines/[[...path]]/route"), "activities");
  const timerRoute = await import("../src/app/api/time/timer/route");
  const tId = svc.occurrenceTaskId(morning, today, aIds[1]);
  const others = ["member2", "admin3", "boss"] as const; // collaborator, sub-account admin, agency owner
  const asUser = (uid: string) => ({
    list: async () => (await (await listRoute.GET(req(uid), saCtx())).json()).routines as { routine: { id: string; canManage: boolean; isOwner: boolean } }[],
    detail: () => oneRoute.GET(req(uid, "GET", undefined, `http://test.local/x?from=${today}&to=${today}`), rCtx(morning)),
    history: () => historyRoute.GET(req(uid), rCtx(morning)),
    complete: (completed = true) => completeRoute.POST(req(uid, "POST", { date: today, activityId: aIds[1], completed }), rCtx(morning)),
    patch: (body: Record<string, unknown>) => oneRoute.PATCH(req(uid, "PATCH", body), rCtx(morning)),
    del: () => oneRoute.DELETE(req(uid, "DELETE"), rCtx(morning)),
    calendar: async () => (await (await calendarRoute.GET(req(uid, "GET", undefined, `http://test.local/x?from=${today}&to=${d(6)}`), saCtx())).json()).entries as { routineId: string }[],
    activities: async () => (await (await activitiesRoute.GET(req(uid), saCtx())).json()).tasks as { id: string; routineId: string; occurrenceDate: string; derived?: boolean }[],
    taskGet: () => taskRoute.GET(req(uid), { params: Promise.resolve({ id: tId }) }),
    taskComplete: () => taskCompleteRoute.POST(req(uid, "POST", { completed: true }), { params: Promise.resolve({ id: tId }) }),
    timer: () => timerRoute.POST(req(uid, "POST", { action: "start", taskId: tId })),
  });

  await check("private routine: owner sees it everywhere (list, detail, calendar, My Tasks, Task Detail)", async () => {
    const o = asUser("admin1");
    assert.ok((await o.list()).some((i) => i.routine.id === morning && i.routine.isOwner && i.routine.canManage));
    assert.equal((await o.detail()).status, 200);
    assert.ok((await o.calendar()).some((e) => e.routineId === morning));
    assert.ok((await o.activities()).some((t) => t.id === tId));
    assert.equal((await o.taskGet()).status, 200);
  });
  await check("My Tasks projects upcoming routine work without writing future placeholder documents", async () => {
    const activities = await asUser("admin1").activities();
    const future = activities.find((t) => t.routineId === morning && t.occurrenceDate > today && t.derived === true);
    assert.ok(future, "next routine occurrence is visible before its date");
    assert.equal((await routineTasks(morning, future!.occurrenceDate)).length, 0, "future projection is not stored");
  });
  await check("Task Detail edits update the recurring definition while preserving occurrence history", async () => {
    const before = (await routineTasks(morning, d(-8)))[0]?.data().title;
    const res = await taskRoute.PATCH(req("admin1", "PATCH", { title: "Plan the day — updated" }), { params: Promise.resolve({ id: tId }) });
    assert.equal(res.status, 200, await res.clone().text());
    const fresh = await svc.loadRoutine(SA, morning);
    assert.equal(fresh.activities.find((a) => a.id === aIds[1])?.title, "Plan the day — updated");
    assert.equal((await routineTasks(morning, d(-8)))[0]?.data().title, before);
  });
  await check("missed activities: kept in History with their state, never listed in My Tasks as overdue", async () => {
    const acts = (await (await activitiesRoute.GET(req("admin1"), saCtx())).json()) as { tasks: { occurrenceDate: string; completed: boolean }[] };
    assert.equal(acts.tasks.some((t) => t.occurrenceDate < today && !t.completed), false, "no missed activity in My Tasks");
    assert.ok(acts.tasks.some((t) => t.occurrenceDate === d(-8) && t.completed), "completed past activities still show as done");
    const missed = await routineTasks(morning, d(-4));
    assert.ok(missed.length > 0 && missed.every((x) => x.data().completed === false), "the missed record is preserved as-is");
    const hist = (await (await historyRoute.GET(req("admin1"), rCtx(morning))).json()) as { entries: { date: string; done: number }[] };
    assert.equal(hist.entries.find((e) => e.date === d(-4))?.done, 0);
  });
  for (const uid of others) {
    await check(`private routine is invisible to ${uid} on every route (list, detail, history, calendar, My Tasks, Task Detail, completion, timer, edit, delete)`, async () => {
      const u = asUser(uid);
      assert.equal((await u.list()).some((i) => i.routine.id === morning), false, "list");
      assert.equal((await u.detail()).status, 404, "detail");
      assert.equal((await u.history()).status, 404, "history");
      assert.equal((await u.calendar()).some((e) => e.routineId === morning), false, "calendar");
      assert.equal((await u.activities()).some((t) => t.routineId === morning), false, "My Tasks");
      assert.equal((await u.taskGet()).status, 404, "Task Detail");
      assert.equal((await u.taskComplete()).status, 404, "My Tasks completion route");
      assert.equal((await u.complete()).status, 404, "routine completion");
      assert.equal((await u.timer()).status, 404, "timer");
      assert.equal((await u.patch({ status: "paused" })).status, 404, "pause");
      assert.equal((await u.del()).status, 404, "delete");
    });
  }
  await check("other routes can't reach a routine activity either (shared completion service, AI-style callers)", async () => {
    const r = await tasksSvc.setTaskCompletedServerSide({ taskId: tId, completed: true, userId: "member2", expectedSubAccountId: SA });
    assert.equal(r, null, "without the explicit routine opt-in a routine activity reads as missing");
  });

  await check("sharing: only the owner can share; members then see it and can check it off, but not manage it", async () => {
    assert.equal((await asUser("admin3").patch({ visibility: "shared" })).status, 404, "a non-owner can't even find it to share");
    const res = await asUser("admin1").patch({ visibility: "shared" });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).routine.visibility, "shared");
    const m = asUser("member2");
    const item = (await m.list()).find((i) => i.routine.id === morning)!;
    assert.ok(item, "visible to a collaborator");
    assert.deepEqual([item.routine.isOwner, item.routine.canManage], [false, false]);
    assert.equal((await m.detail()).status, 200);
    assert.ok((await m.calendar()).some((e) => e.routineId === morning));
    assert.ok((await m.activities()).some((t) => t.id === tId));
    await db.doc(`routineTasks/${tId}`).update({ completed: false, status: "todo" });
    assert.equal((await m.complete()).status, 200, "members can check off a shared routine");
    assert.equal((await m.taskGet()).status, 200);
    assert.equal((await m.patch({ status: "paused" })).status, 403, "collaborator can't pause");
    assert.equal((await m.del()).status, 403, "collaborator can't delete");
  });
  await check("sharing: a sub-account admin may manage a SHARED routine but can't change who sees it", async () => {
    const a = asUser("admin3");
    assert.ok((await a.list()).find((i) => i.routine.id === morning)!.routine.canManage);
    assert.equal((await a.patch({ visibility: "private" })).status, 403);
    assert.equal((await a.patch({ status: "paused" })).status, 200);
    assert.equal((await a.patch({ status: "active" })).status, 200);
  });
  await check("un-sharing makes it private again — history intact, others lose access", async () => {
    const before = await dayOf(morning, d(-8));
    assert.equal((await asUser("admin1").patch({ visibility: "private" })).status, 200);
    for (const uid of others) {
      assert.equal((await asUser(uid).detail()).status, 404, uid);
      assert.equal((await asUser(uid).activities()).some((t) => t.routineId === morning), false, uid);
    }
    assert.deepEqual(await dayOf(morning, d(-8)), before);
  });

  // ── automation / webhooks ──────────────────────────────────────────────
  const settle = () => new Promise((r) => setTimeout(r, 400));
  const events = async () => (await db.collection(`subAccounts/${SA}/webhookEvents`).get()).docs.map((x) => x.data());
  await check("webhooks: ordinary tasks still emit task.created + task.completed exactly once", async () => {
    const { id } = await tasksSvc.createTaskServerSide({ subAccountId: SA, agencyId: AG, createdByUid: "admin1", mode: "live", title: "Hook check", notes: "", dueAt: null, contactId: null, dealId: null, eventId: null });
    await tasksSvc.setTaskCompletedServerSide({ taskId: id, completed: true, userId: "admin1" });
    await tasksSvc.setTaskCompletedServerSide({ taskId: id, completed: true, userId: "admin1" }); // repeat: no second event
    await settle();
    const mine = (await events()).filter((e) => (e.payload as { task?: { id?: string } }).task?.id === id);
    assert.deepEqual(mine.map((e) => e.type).sort(), ["task.completed", "task.created"]);
  });
  await check("webhooks: generating, completing, Mark All Complete and reopening routine activities emit nothing", async () => {
    const res = await post({ name: "Hook routine", activities: [{ title: "A" }, { title: "B" }], schedule: { frequency: "daily" } });
    const r = (await res.json()).routine;
    await svc.runRoutineGeneration();
    await complete(r.id, { date: today, activityId: r.activities[0].id, completed: true });
    await complete(r.id, { date: today, activityId: r.activities[0].id, completed: false });
    await complete(r.id, { date: today });
    await complete(r.id, { date: today });
    await taskCompleteRoute.POST(req("admin1", "POST", { completed: true }), { params: Promise.resolve({ id: svc.occurrenceTaskId(r.id, today, r.activities[1].id) }) });
    await settle();
    const leaked = (await events()).filter((e) => String((e.payload as { task?: { id?: string } }).task?.id ?? "").startsWith("rt_"));
    assert.equal(leaked.length, 0, JSON.stringify(leaked.map((e) => e.type)));
    assert.equal((await routineTasks(r.id, today)).filter((x) => x.data().completed).length, 2, "still recorded normally");
    const act = await db.collection("taskActivity").where("taskId", "==", svc.occurrenceTaskId(r.id, today, r.activities[0].id)).get();
    assert.deepEqual(act.docs.map((x) => x.data().type).sort(), ["completed", "completed", "reopened"], "internal history kept, one row per real change");
  });

  // ── Client Portal ──────────────────────────────────────────────────────
  await check("Client Portal: routine activities are never reachable, even for a client project's routine", async () => {
    const portal = await import("../src/lib/server/portal-tasks-service");
    await db.doc("contacts/cP").set({ subAccountId: SA, agencyId: AG, name: "Client P" });
    await db.doc("projects/pClient").set({ agencyId: AG, subAccountId: SA, title: "Client work", status: "active", taskModel: "tasks", assignedContactId: "cP", dueAt: null });
    const r = (await (await post({ name: "Client-linked", activities: [{ title: "Prep" }], schedule: { frequency: "daily" }, projectId: "pClient" })).json()).routine;
    const t = (await routineTasks(r.id, today))[0];
    assert.equal(t.data().projectId, undefined);
    const view = await portal.loadPortalTaskProject(
      { id: "pClient", ...(await db.doc("projects/pClient").get()).data() } as never,
      { id: "mP", contactId: "cP" } as never
    );
    assert.equal(JSON.stringify(view).includes("rt_"), false);
  });

  // ── rules ──────────────────────────────────────────────────────────────
  const browser = clientAs("admin1");
  const memberBrowser = clientAs("member2");
  const outsiderBrowser = clientAs("outsider");
  await rule("owner's own browser tasks query returns no routine activities (they're server-only)", true, async () => {
    const s = await cGetDocs(cQuery(cCollection(browser, "tasks"), cWhere("subAccountId", "==", SA)));
    assert.equal(s.docs.some((x) => x.id.startsWith("rt_") || x.data().routineId), false);
  });
  await rule("another member's browser tasks query (My Tasks / Calendar / badge) still works and has no routine activities", true, async () => {
    const s = await cGetDocs(cQuery(cCollection(memberBrowser, "tasks"), cWhere("subAccountId", "==", SA)));
    assert.ok(s.size > 0, "ordinary shared tasks still listed");
    assert.equal(s.docs.some((x) => x.id.startsWith("rt_") || x.data().routineId), false);
  });
  await rule("member reads a routine activity directly", false, () => cGet(cDoc(memberBrowser, `routineTasks/${tId}`)));
  await rule("owner reads a routine activity directly (server routes only)", false, () => cGet(cDoc(browser, `routineTasks/${tId}`)));
  await rule("member lists routineTasks", false, () => cGetDocs(cQuery(cCollection(memberBrowser, "routineTasks"), cWhere("subAccountId", "==", SA))));
  await rule("outsider reads a routine activity", false, () => cGet(cDoc(outsiderBrowser, `routineTasks/${tId}`)));
  await rule("browser creates a task claiming a routine", false, () => cSet(cDoc(browser, "tasks/forged"), { title: "x", completed: false, agencyId: AG, subAccountId: SA, territoryId: "global", routineId: morning, occurrenceDate: today }));
  await rule("browser creates a task with a routine-style id", false, () => cSet(cDoc(browser, `tasks/rt_shadow`), { title: "x", completed: false, agencyId: AG, subAccountId: SA, territoryId: "global" }));
  await rule("browser writes a routine activity", false, () => cUpdate(cDoc(browser, `routineTasks/${tId}`), { completed: false }));
  await rule("browser reads a routine definition directly", false, () => cGet(cDoc(browser, `routines/${morning}`)));
  await rule("browser still creates + edits + deletes a plain standalone task", true, async () => {
    await cSet(cDoc(browser, "tasks/plain"), { title: "Call back", notes: "", completed: false, agencyId: AG, subAccountId: SA, territoryId: "global", createdByUid: "admin1" });
    await cUpdate(cDoc(browser, "tasks/plain"), { title: "Call back tomorrow" });
    await cDelete(cDoc(browser, "tasks/plain"));
  });
  await rule("another member still reads + edits a shared standalone task", true, async () => {
    await cSet(cDoc(browser, "tasks/teamTask"), { title: "Team", notes: "", completed: false, agencyId: AG, subAccountId: SA, territoryId: "global", createdByUid: "admin1" });
    await cGet(cDoc(memberBrowser, "tasks/teamTask"));
    await cUpdate(cDoc(memberBrowser, "tasks/teamTask"), { title: "Team (edited)" });
  });

  await check("archived routines stay available to the Archived workspace and restore without losing identity or history", async () => {
    const res = await post({
      name: "Archive regression routine",
      activities: [{ title: "Preserve history" }],
      schedule: { frequency: "daily", startDate: today },
    });
    assert.equal(res.status, 201);
    const archivedId = (await res.json()).routine.id as string;
    const before = await db.doc("routines/" + archivedId).get();
    const historyTask = svc.occurrenceTaskId(archivedId, today, (await before.data())!.activities[0].id);
    await db.doc("routineTasks/" + historyTask).update({ completed: true, status: "completed" });
    assert.equal((await oneRoute.PATCH(req("admin1", "PATCH", { status: "archived" }), rCtx(archivedId))).status, 200);
    const activeList = await (await listRoute.GET(req("admin1"), saCtx())).json();
    assert.equal(activeList.routines.some((item: { routine: { id: string } }) => item.routine.id === archivedId), false);
    const archivedList = await (await listRoute.GET(req("admin1", "GET", undefined, "http://test.local/x?includeArchived=1"), saCtx())).json();
    assert.equal(archivedList.routines.find((item: { routine: { id: string } }) => item.routine.id === archivedId)?.routine.status, "archived");
    assert.equal((await db.doc("routineTasks/" + historyTask).get()).data()!.completed, true);
    assert.equal((await oneRoute.PATCH(req("admin1", "PATCH", { status: "active" }), rCtx(archivedId))).status, 200);
    assert.equal((await db.doc("routines/" + archivedId).get()).data()!.status, "active");
  });

  // ── delete + rituals ───────────────────────────────────────────────────
  await check("delete: definition gone, completed activities stay in task history, untouched upcoming removed", async () => {
    const res = await oneRoute.DELETE(req("admin1", "DELETE"), rCtx(morning));
    assert.equal(res.status, 200);
    assert.equal((await db.doc(`routines/${morning}`).get()).exists, false);
    const left = await routineTasks(morning);
    assert.ok(left.length > 0);
    assert.ok(
      left.every((x) => x.data().completed || x.data().occurrenceDate < today || Number(x.data().timeSpentSeconds) > 0),
      "only history remains"
    );
    assert.equal((await oneRoute.GET(req("admin1", "GET", undefined, `http://test.local/x?from=${today}&to=${today}`), rCtx(morning))).status, 404);
  });
  await check("Rituals (Reflections) are untouched and never listed as routines", async () => {
    const r = (await db.doc("reflectionRituals/rit1").get()).data()!;
    assert.deepEqual(r.completedDates, ["2026-09-01"]);
    const list = await (await listRoute.GET(req("admin1"), saCtx())).json();
    assert.equal(list.routines.some((i: { routine: { name: string } }) => i.routine.name === "Journal"), false);
  });

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

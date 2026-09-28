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
 *   route), rules for the new fields, Rituals untouched.
 *
 * Run:
 *   echo '{"firestore":{"rules":"<repo>/firestore.rules"},
 *          "emulators":{"auth":{"port":9099},"firestore":{"port":8080}}}' > /tmp/emu/firebase.json
 *   firebase emulators:exec --config /tmp/emu/firebase.json --only firestore,auth \
 *     --project demo-routines \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx scripts/check-routines.ts"
 */
import assert from "node:assert/strict";
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
  for (const [uid] of [["admin1"], ["outsider"]] as const) {
    await auth.createUser({ uid, email: `${uid}@example.test` });
    await auth.setCustomUserClaims(uid, { status: "active", agencyId: AG, agencyRole: null });
    await db.doc(`users/${uid}`).set({ status: "active" });
  }
  const w = (p: string, d: Record<string, unknown>) => db.doc(p).set(d);
  await w(`subAccounts/${SA}`, { agencyId: AG, name: "Studio", timezone: TZ });
  await w(`subAccounts/${SA2}`, { agencyId: AG, name: "Other", timezone: "UTC" });
  await w(`subAccounts/${SA}/subAccountMembers/admin1`, { status: "active", role: "admin", displayName: "Quiana" });
  await w(`subAccounts/${SA2}/subAccountMembers/outsider`, { status: "active", role: "admin" });
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
  const listRoute = await import("../src/app/api/sub-accounts/[id]/routines/route");
  const oneRoute = await import("../src/app/api/sub-accounts/[id]/routines/[routineId]/route");
  const completeRoute = await import("../src/app/api/sub-accounts/[id]/routines/[routineId]/complete/route");
  const historyRoute = await import("../src/app/api/sub-accounts/[id]/routines/[routineId]/history/route");
  const calendarRoute = await import("../src/app/api/sub-accounts/[id]/routines/calendar/route");
  const taskRoute = await import("../src/app/api/tasks/[id]/route");
  const taskCompleteRoute = await import("../src/app/api/tasks/[id]/complete/route");

  const today = sched.todayInTimeZone(TZ);
  const d = (n: number) => sched.addDaysYmd(today, n);
  const saCtx = (id = SA) => ({ params: Promise.resolve({ id }) });
  const rCtx = (routineId: string, id = SA) => ({ params: Promise.resolve({ id, routineId }) });
  const routineTasks = async (routineId: string, date?: string) => {
    const s = await db.collection("tasks").where("routineId", "==", routineId).get();
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
  await check("validation: missing name, no activities, weekly without days, time without clock, foreign project → 400", async () => {
    for (const bad of [
      { ...baseMorning, name: "  " },
      { ...baseMorning, activities: [{ title: " " }] },
      { ...baseMorning, schedule: { frequency: "weekly", days: [] } },
      { ...baseMorning, timeMode: "time", time: "25:00" },
      { ...baseMorning, projectId: "nope" },
    ]) {
      const res = await post(bad);
      assert.equal(res.status, 400, JSON.stringify(bad).slice(0, 80));
    }
    assert.equal((await db.collection("routines").get()).size, 0, "nothing written");
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
    const t = (await db.doc(`tasks/${svc.occurrenceTaskId(morning, today, aIds[0])}`).get()).data()!;
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
    const get = async (date: string, a: string) => (await db.doc(`tasks/${svc.occurrenceTaskId(morning, date, a)}`).get()).data();
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
    await svc.deleteRoutine({ subAccountId: SA, routineId: id });
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

  // ── project windows ────────────────────────────────────────────────────
  await check("project routine with 'stop when the project ends' follows the project's window; independent ones don't", async () => {
    await db.doc("projects/pWin").set({ agencyId: AG, subAccountId: SA, title: "Launch", status: "active", taskModel: "tasks", dueAt: Timestamp.fromDate(sched.zonedDateTimeToUtc(d(2), "17:00", TZ)) });
    const bound = (await (await post({ name: "Launch daily", activities: [{ title: "Post" }], schedule: { frequency: "daily" }, projectId: "pWin", endsWithProject: true })).json()).routine;
    const free = (await (await post({ name: "Keep going", activities: [{ title: "Post" }], schedule: { frequency: "daily" }, projectId: "pWin" })).json()).routine;
    assert.equal(bound.windowEnd, d(2));
    assert.equal(free.windowEnd, null);
    const cal = await (await calendarRoute.GET(req("admin1", "GET", undefined, `http://test.local/x?from=${today}&to=${d(6)}`), saCtx())).json();
    assert.equal(cal.entries.filter((e: { routineId: string }) => e.routineId === bound.id).length, 3);
    assert.equal(cal.entries.filter((e: { routineId: string }) => e.routineId === free.id).length, 7);
    const t = (await routineTasks(bound.id, today))[0].data();
    assert.equal(t.projectId, undefined, "occurrences never join the project's task list / portal");
    await db.doc("projects/pWin").update({ status: "completed" });
    const view = (await (await oneRoute.GET(req("admin1", "GET", undefined, `http://test.local/x?from=${today}&to=${today}`), rCtx(bound.id))).json()).routine;
    assert.equal(view.windowClosed, true);
    await db.doc(`tasks/${svc.occurrenceTaskId(bound.id, today, bound.activities[0].id)}`).delete();
    await svc.runRoutineGeneration();
    assert.equal((await routineTasks(bound.id, today)).length, 0, "closed window generates nothing");
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
    await db.doc(`tasks/${id}`).update({ completed: false, status: "todo" });
    const res = await taskCompleteRoute.POST(req("admin1", "POST", { completed: true }), { params: Promise.resolve({ id }) });
    assert.equal(res.status, 200, await res.clone().text());
    assert.equal((await db.doc(`tasks/${id}`).get()).data()!.completed, true);
    assert.equal((await db.collection("tasks").where("recurrenceSeriesId", "==", id).get()).size, 0, "no recurrence spawn");
  });
  await check("routine activity: date / repeat / rollover locked; title editable; not deletable; no subtasks", async () => {
    const id = svc.occurrenceTaskId(morning, today, aIds[1]);
    const res = await taskRoute.PATCH(req("admin1", "PATCH", { dueAt: new Date().toISOString() }), { params: Promise.resolve({ id }) });
    assert.equal(res.status, 400);
    const ok = await taskRoute.PATCH(req("admin1", "PATCH", { notes: "Did it early" }), { params: Promise.resolve({ id }) });
    assert.equal(ok.status, 200, await ok.clone().text());
    assert.equal((await taskRoute.DELETE(req("admin1", "DELETE"), { params: Promise.resolve({ id }) })).status, 400);
    await assert.rejects(
      full.createFullTask({ subAccountId: SA, agencyId: AG, actor: { kind: "staff", uid: "admin1" }, createdByUid: "admin1", body: { title: "sub", parentTaskId: id } }),
      /subtasks/
    );
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

  // ── rules ──────────────────────────────────────────────────────────────
  const browser = clientAs("admin1");
  const outsiderBrowser = clientAs("outsider");
  const tId = svc.occurrenceTaskId(morning, today, aIds[1]);
  await rule("member lists sub-account tasks incl. routine activities (My Tasks / Calendar query)", true, async () => {
    const s = await cGetDocs(cQuery(cCollection(browser, "tasks"), cWhere("subAccountId", "==", SA)));
    assert.ok(s.docs.some((x) => x.data().routineId === morning));
  });
  await rule("outsider reads a routine activity", false, () => cGet(cDoc(outsiderBrowser, `tasks/${tId}`)));
  await rule("browser creates a task claiming a routine", false, () => cSet(cDoc(browser, "tasks/forged"), { title: "x", completed: false, agencyId: AG, subAccountId: SA, territoryId: "global", routineId: morning, occurrenceDate: today }));
  await rule("browser edits a routine activity directly", false, () => cUpdate(cDoc(browser, `tasks/${tId}`), { title: "x" }));
  await rule("browser completes a routine activity directly (must use the server route)", false, () => cUpdate(cDoc(browser, `tasks/${tId}`), { completed: false }));
  await rule("browser deletes a routine activity", false, () => cDelete(cDoc(browser, `tasks/${tId}`)));
  await rule("browser reads a routine definition directly", false, () => cGet(cDoc(browser, `routines/${morning}`)));
  await rule("browser still creates + edits + deletes a plain standalone task", true, async () => {
    await cSet(cDoc(browser, "tasks/plain"), { title: "Call back", notes: "", completed: false, agencyId: AG, subAccountId: SA, territoryId: "global", createdByUid: "admin1" });
    await cUpdate(cDoc(browser, "tasks/plain"), { title: "Call back tomorrow" });
    await cDelete(cDoc(browser, "tasks/plain"));
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

/**
 * Projects & Tasks Phase 2 — end-to-end checks. EMULATOR ONLY (Firestore +
 * Auth, `demo-*` project, no production credentials). Runs the REAL
 * services and staff route handlers against isolated fixtures, plus the
 * firestore.rules under the client SDK:
 *
 *   compatibility (legacy tasks / step projects / v1 offer snapshots),
 *   project tasks + subtasks, updates + due-date history, dependencies
 *   (warn-only, loop rejection), recurrence idempotency, rollover,
 *   time tracking (one timer per person, duplicate protection, client
 *   corrections + audit, owner can't alter client time), Client Portal
 *   projection + permissions, system-template generation, v2 offer grants
 *   (idempotent), staff route tenancy, rules for the new fields.
 *
 * Run:
 *   echo '{"firestore":{"rules":"<repo>/firestore.rules"},
 *          "emulators":{"auth":{"port":9099},"firestore":{"port":8080}}}' > /tmp/emu/firebase.json
 *   firebase emulators:exec --config /tmp/emu/firebase.json --only firestore,auth \
 *     --project demo-projects-phase2 \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx scripts/check-projects-tasks-phase2.ts"
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

const PROJECT = process.env.GCLOUD_PROJECT || "demo-projects-phase2";
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
const DAY = 86_400_000;

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
  for (const [uid, claims] of [
    ["admin1", { status: "active", agencyId: AG, agencyRole: null }],
    ["admin2", { status: "active", agencyId: AG, agencyRole: null }],
    ["outsider", { status: "active", agencyId: AG, agencyRole: null }],
  ] as const) {
    await auth.createUser({ uid, email: `${uid}@example.test` });
    await auth.setCustomUserClaims(uid, claims);
    await db.doc(`users/${uid}`).set({ status: "active" });
  }
  const w = (p: string, d: Record<string, unknown>) => db.doc(p).set(d);
  await w(`subAccounts/${SA}`, { agencyId: AG, name: "Studio", timezone: "America/New_York" });
  await w(`subAccounts/${SA2}`, { agencyId: AG, name: "Other", timezone: "UTC" });
  await w(`subAccounts/${SA}/subAccountMembers/admin1`, { status: "active", role: "admin", displayName: "Quiana" });
  await w(`subAccounts/${SA}/subAccountMembers/admin2`, { status: "active", role: "admin", displayName: "Jordan" });
  await w(`subAccounts/${SA2}/subAccountMembers/outsider`, { status: "active", role: "admin" });
  await w(`contacts/cA`, { subAccountId: SA, agencyId: AG, name: "Client A", territoryId: "t1" });
  await w(`contacts/cB`, { subAccountId: SA, agencyId: AG, name: "Client B" });
  await w(`subAccounts/${SA}/members/mA`, { status: "active", contactId: "cA", displayName: "Client A" });
  await w(`subAccounts/${SA}/members/mB`, { status: "active", contactId: "cB", displayName: "Client B" });
  // Legacy (pre-Phase-2) records exactly as they exist today.
  await w(`projectTemplates/tLegacy`, { agencyId: AG, subAccountId: SA, title: "Legacy", category: "Content Workflow", durationDays: 14, description: "", steps: [{ title: "Outline", order: 0 }, { title: "Record", order: 1 }] });
  await w(`tasks/legacyTask`, { title: "Legacy follow-up", notes: "", dueAt: null, completed: false, completedAt: null, contactId: null, dealId: null, eventId: null, timeBlock: null, agencyId: AG, subAccountId: SA, createdByUid: "admin1", territoryId: "global" });
  await w(`tasks/otherTenant`, { title: "Other tenant", completed: false, agencyId: AG, subAccountId: SA2, territoryId: "global" });
}

function staffReq(uid: string, method = "GET", body?: unknown) {
  return new Request("http://test.local/x", {
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
  const projectSvc = await import("../src/lib/server/project-service");
  const tasksSvc = await import("../src/lib/server/tasks-service");
  const full = await import("../src/lib/server/project-tasks-service");
  const graph = await import("../src/lib/server/task-graph-service");
  const time = await import("../src/lib/server/time-tracking-service");
  const rollover = await import("../src/lib/server/task-rollover-service");
  const gen = await import("../src/lib/server/project-generation-service");
  const portal = await import("../src/lib/server/portal-tasks-service");
  const grants = await import("../src/lib/server/course-offer-purchase-service");
  const taskRoute = await import("../src/app/api/tasks/[id]/route");
  const timeRoute = await import("../src/app/api/tasks/[id]/time/route");
  const staff = { kind: "staff" as const, uid: "admin1" };
  const get = async (id: string) => (await db.doc(`tasks/${id}`).get()).data()!;

  // ── compatibility ───────────────────────────────────────────────────────
  let stepProjectId = "";
  await check("legacy createProject (no taskModel) still builds a STEP project", async () => {
    const p = await projectSvc.createProject({ agencyId: AG, subAccountId: SA, title: "Old style", description: "", startAt: null, dueAt: null, assignedContactId: null, assignedContactName: null, createdByUid: "admin1", createdByMemberId: null, templateId: "tLegacy" });
    stepProjectId = p.id;
    assert.equal(p.taskModel, undefined);
    assert.equal(p.stepCount, 2);
    assert.equal((await projectSvc.listSteps(p.id)).length, 2);
  });
  await check("adding a task to a step project is refused (steps stay steps)", async () => {
    await assert.rejects(full.createFullTask({ subAccountId: SA, agencyId: AG, actor: staff, createdByUid: "admin1", body: { title: "x", projectId: stepProjectId } }), /original step checklist/);
  });
  await check("legacy standalone task completes through the shared service (status + activity)", async () => {
    const r = await tasksSvc.setTaskCompletedServerSide({ taskId: "legacyTask", completed: true, userId: "admin1" });
    assert.ok(r);
    const t = await get("legacyTask");
    assert.equal(t.completed, true);
    assert.equal(t.status, "completed");
    const act = await db.collection("taskActivity").where("taskId", "==", "legacyTask").get();
    assert.equal(act.docs.filter((d) => d.data().type === "completed").length, 1);
  });
  await check("createTaskServerSide without extras writes exactly the pre-Phase-2 shape (workflows / API / AI)", async () => {
    const { id } = await tasksSvc.createTaskServerSide({ subAccountId: SA, agencyId: AG, createdByUid: "admin1", mode: "live", title: "Workflow task", notes: "", dueAt: null, contactId: null, dealId: null, eventId: null });
    const keys = Object.keys(await get(id)).sort();
    assert.deepEqual(keys, ["agencyId", "completed", "completedAt", "contactId", "createdAt", "createdByUid", "dealId", "dueAt", "eventId", "mode", "notes", "subAccountId", "territoryId", "timeBlock", "title", "updatedAt"]);
  });

  // ── task projects ───────────────────────────────────────────────────────
  let clientProjectId = "";
  await check("new task project from a workspace template creates CRM tasks (no steps)", async () => {
    const p = await projectSvc.createProject({ agencyId: AG, subAccountId: SA, title: "Client work", description: "", startAt: null, dueAt: new Date(Date.now() + 30 * DAY), assignedContactId: "cA", assignedContactName: "Client A", createdByUid: "admin1", createdByMemberId: null, templateId: "tLegacy", taskModel: "tasks" });
    clientProjectId = p.id;
    assert.equal(p.taskModel, "tasks");
    assert.equal(p.stepCount, 2);
    assert.equal((await projectSvc.listSteps(p.id)).length, 0);
    const tasks = await db.collection("tasks").where("projectId", "==", p.id).get();
    assert.equal(tasks.size, 2);
    for (const d of tasks.docs) {
      assert.equal(d.data().visibility, "client");
      assert.equal(d.data().territoryId, "t1"); // follows the client
    }
  });
  let t1 = "", t2 = "", sub1 = "", internalTask = "";
  await check("project task + one-level subtask; sub-subtask rejected", async () => {
    t1 = await full.createFullTask({ subAccountId: SA, agencyId: AG, actor: staff, createdByUid: "admin1", body: { title: "Design", projectId: clientProjectId, priority: "high", tags: ["design"] } });
    t2 = await full.createFullTask({ subAccountId: SA, agencyId: AG, actor: staff, createdByUid: "admin1", body: { title: "Build", projectId: clientProjectId } });
    sub1 = await full.createFullTask({ subAccountId: SA, agencyId: AG, actor: staff, createdByUid: "admin1", body: { title: "Wireframes", parentTaskId: t1 } });
    assert.equal((await get(sub1)).projectId, clientProjectId);
    await assert.rejects(full.createFullTask({ subAccountId: SA, agencyId: AG, actor: staff, createdByUid: "admin1", body: { title: "Too deep", parentTaskId: sub1 } }), /Subtasks can't/);
    internalTask = await full.createFullTask({ subAccountId: SA, agencyId: AG, actor: staff, createdByUid: "admin1", body: { title: "Internal pricing notes", projectId: clientProjectId, visibility: "internal" } });
    assert.equal((await get(internalTask)).visibility, "internal");
  });
  await check("project progress counts top-level tasks only (subtasks excluded)", async () => {
    const p = (await db.doc(`projects/${clientProjectId}`).get()).data()!;
    assert.equal(p.stepCount, 5); // 2 template + Design + Build + Internal
  });
  await check("due-date change records history (from → to) + one activity row", async () => {
    const task = await get(t1);
    const due = new Date(Date.now() + 5 * DAY);
    await full.updateFullTask({ taskId: t1, task, actor: staff, patch: { dueAt: due.toISOString(), priority: "urgent" } });
    const rows = (await db.collection("taskActivity").where("taskId", "==", t1).get()).docs.map((d) => d.data());
    const dueRow = rows.find((r) => r.type === "due_changed");
    assert.ok(dueRow);
    assert.equal(dueRow!.detail.to, due.toISOString());
    assert.equal(rows.filter((r) => r.type === "priority_changed").length, 1);
  });
  await check("dependencies: warning on completion, completion still happens", async () => {
    await full.updateFullTask({ taskId: t2, task: await get(t2), actor: staff, patch: { dependsOnTaskIds: [t1] } });
    const r = await tasksSvc.setTaskCompletedServerSide({ taskId: t2, completed: true, userId: "admin1" });
    assert.equal(r!.warnings.length, 1);
    assert.equal((await get(t2)).completed, true);
  });
  await check("dependency loop and cross-tenant dependency are rejected", async () => {
    await assert.rejects(full.updateFullTask({ taskId: t1, task: await get(t1), actor: staff, patch: { dependsOnTaskIds: [t2] } }), /loop/);
    await assert.rejects(full.updateFullTask({ taskId: t1, task: await get(t1), actor: staff, patch: { dependsOnTaskIds: ["otherTenant"] } }), /wasn't found/);
  });
  await check("status → completed via PATCH goes through completion (status in sync)", async () => {
    await full.updateFullTask({ taskId: t2, task: await get(t2), actor: staff, patch: { status: "in_progress" } });
    let t = await get(t2);
    assert.equal(t.completed, false);
    assert.equal(t.status, "in_progress");
    await full.updateFullTask({ taskId: t2, task: t, actor: staff, patch: { status: "completed" } });
    t = await get(t2);
    assert.equal(t.completed, true);
    assert.equal(t.status, "completed");
  });

  // ── recurrence ──────────────────────────────────────────────────────────
  await check("recurring task: one next occurrence, idempotent across repeat completions", async () => {
    const id = await full.createFullTask({ subAccountId: SA, agencyId: AG, actor: staff, createdByUid: "admin1", body: { title: "Daily check-in", recurrence: { type: "daily" }, dueAt: new Date("2026-10-01T13:00:00Z").toISOString() } });
    await tasksSvc.setTaskCompletedServerSide({ taskId: id, completed: true, userId: "admin1" });
    await tasksSvc.setTaskCompletedServerSide({ taskId: id, completed: false, userId: "admin1" });
    await tasksSvc.setTaskCompletedServerSide({ taskId: id, completed: true, userId: "admin1" });
    const next = await get(`${id}__1`);
    assert.equal(next.dueAt.toDate().toISOString(), "2026-10-02T13:00:00.000Z");
    assert.equal(next.completed, false);
    const series = await db.collection("tasks").where("recurrenceSeriesId", "==", id).get();
    assert.equal(series.size, 1);
    assert.equal((await get(id)).completed, true); // completion history kept
  });

  // ── rollover ────────────────────────────────────────────────────────────
  await check("rollover: only opted-in open tasks move; same doc; history kept; idempotent", async () => {
    const past = new Date(Date.now() - 3 * DAY);
    const on = await full.createFullTask({ subAccountId: SA, agencyId: AG, actor: staff, createdByUid: "admin1", body: { title: "Roll me", dueAt: past.toISOString(), autoRollover: true } });
    const off = await full.createFullTask({ subAccountId: SA, agencyId: AG, actor: staff, createdByUid: "admin1", body: { title: "Leave me", dueAt: past.toISOString() } });
    const before = (await db.collection("tasks").get()).size;
    await rollover.runRolloverSweep();
    await rollover.runRolloverSweep();
    const moved = await get(on);
    assert.equal(moved.rolledOverCount, 1);
    assert.equal(moved.originalDueAt.toDate().getTime(), past.getTime());
    assert.ok(moved.dueAt.toDate().getTime() > past.getTime());
    assert.equal((await get(off)).dueAt.toDate().getTime(), past.getTime());
    assert.equal((await db.collection("tasks").get()).size, before);
    const rows = await db.collection("taskActivity").where("taskId", "==", on).get();
    assert.equal(rows.docs.filter((d) => d.data().type === "rolled_over").length, 1);
  });

  // ── time tracking ───────────────────────────────────────────────────────
  const backdate = async (key: string, minutes: number) =>
    db.doc(`activeTimers/${key}`).update({ startedAt: Timestamp.fromDate(new Date(Date.now() - minutes * 60_000)) });
  await check("one timer per person: starting another stops the first (entry recorded)", async () => {
    const t1Doc = { id: t1, ...(await get(t1)) };
    await time.startTimer(staff, t1Doc);
    await backdate("u_admin1", 35);
    const internal = { id: internalTask, ...(await get(internalTask)) };
    const r = await time.startTimer(staff, internal);
    assert.equal(r.stopped?.taskId, t1);
    assert.ok(Math.abs(r.stopped!.seconds - 35 * 60) < 5);
    const timers = await db.collection("activeTimers").where("actorKey", "==", "u_admin1").get();
    assert.equal(timers.size, 1);
    assert.equal(timers.docs[0].data().taskId, internalTask);
    await backdate("u_admin1", 10);
    const stopped = await time.stopTimer(staff);
    assert.ok(stopped);
    assert.equal(await time.stopTimer(staff), null); // double stop is a no-op
  });
  await check("task + project totals move with entries", async () => {
    assert.ok(Math.abs(((await get(t1)).timeSpentSeconds ?? 0) - 35 * 60) < 5);
    const p = (await db.doc(`projects/${clientProjectId}`).get()).data()!;
    assert.ok(Math.abs((p.timeSpentSeconds ?? 0) - 45 * 60) < 10);
  });
  await check("activity shows one 'tracked' row per finished entry (no start/stop rows)", async () => {
    const rows = (await db.collection("taskActivity").where("taskId", "==", t1).get()).docs.map((d) => d.data());
    assert.equal(rows.filter((r) => r.type === "time_tracked").length, 1);
    assert.equal(rows.find((r) => r.type === "time_tracked")!.visibility, "internal"); // staff time private
  });
  const client = { kind: "client" as const, memberId: "mA", contactId: "cA" };
  let clientEntry = "";
  await check("manual entry: duplicate submit → one entry; bad durations rejected", async () => {
    const task = { id: t1, ...(await get(t1)) };
    const a = await time.addManualEntry({ actor: client, task, startedAt: new Date(Date.now() - DAY), durationSeconds: 1800, note: "Reviewed", requestId: "req-abc-12345" });
    const b = await time.addManualEntry({ actor: client, task, startedAt: new Date(Date.now() - DAY), durationSeconds: 1800, note: "Reviewed", requestId: "req-abc-12345" });
    clientEntry = a.entryId;
    assert.equal(a.entryId, b.entryId);
    assert.equal(b.duplicate, true);
    assert.equal((await get(t1)).clientTimeSeconds, 1800);
    await assert.rejects(time.addManualEntry({ actor: client, task, startedAt: new Date(), durationSeconds: 30, note: "", requestId: "req-small-123" }), /between 1 minute/);
  });
  await check("client corrects own entry → audited revision + exact total delta", async () => {
    await time.reviseEntry({ actor: client, entryId: clientEntry, action: "edit", durationSeconds: 2400, subAccountId: SA });
    const e = (await db.doc(`timeEntries/${clientEntry}`).get()).data()!;
    assert.equal(e.durationSeconds, 2400);
    assert.equal(e.revisions.length, 1);
    assert.equal(e.revisions[0].before.durationSeconds, 1800);
    assert.equal((await get(t1)).clientTimeSeconds, 2400);
  });
  await check("business owner cannot alter a client's entry", async () => {
    await assert.rejects(time.reviseEntry({ actor: staff, entryId: clientEntry, action: "edit", durationSeconds: 60, subAccountId: SA }), /only change your own/);
    await assert.rejects(time.reviseEntry({ actor: staff, entryId: clientEntry, action: "delete", subAccountId: SA }), /only change your own/);
  });
  await check("staff route lists client time read-only (canEdit false)", async () => {
    const res = await timeRoute.GET(staffReq("admin1"), { params: Promise.resolve({ id: t1 }) });
    const body = (await res.json()) as { entries: { actorKind: string; canEdit: boolean }[] };
    const c = body.entries.find((e) => e.actorKind === "client")!;
    assert.equal(c.canEdit, false);
    assert.ok(body.entries.some((e) => e.actorKind === "staff" && e.canEdit));
  });

  // ── Client Portal ───────────────────────────────────────────────────────
  let clientOwn = "", assigned = "";
  await check("portal: client-created task is theirs; business task assigned to client", async () => {
    clientOwn = await full.createFullTask({ subAccountId: SA, agencyId: AG, actor: client, createdByUid: "", body: { title: "Send logo files", projectId: clientProjectId, assigneeUid: "admin1", visibility: "internal", recurrence: { type: "daily" } }, fromClient: { memberId: "mA", contactId: "cA" } });
    const own = await get(clientOwn);
    assert.equal(own.createdByMemberId, "mA");
    assert.equal(own.visibility, "client"); // can't hide from themselves
    assert.equal(own.assigneeUid, null); // staff-only fields ignored
    assert.equal(own.recurrence, null);
    assigned = await full.createFullTask({ subAccountId: SA, agencyId: AG, actor: staff, createdByUid: "admin1", body: { title: "Approve homepage", projectId: clientProjectId, assigneeContactId: "cA" } });
  });
  await check("portal projection hides internal tasks and staff time; shows own time only", async () => {
    const project = { id: clientProjectId, ...(await db.doc(`projects/${clientProjectId}`).get()).data() } as never;
    const member = { id: "mA", contactId: "cA" } as never;
    const data = await portal.loadPortalTaskProject(project, member);
    const ids = data.tasks.map((t) => t.id);
    assert.ok(!ids.includes(internalTask));
    const design = data.tasks.find((t) => t.id === t1)!;
    assert.equal(design.myTimeSeconds, 2400); // not the 35m of staff time
    assert.ok(!("notes" in design) && !("assigneeUid" in design) && !("dealId" in design));
    const own = data.tasks.find((t) => t.id === clientOwn)!;
    assert.deepEqual([own.canEdit, own.canComplete], [true, true]);
    const a = data.tasks.find((t) => t.id === assigned)!;
    assert.deepEqual([a.canEdit, a.canComplete], [false, true]);
    assert.deepEqual([design.canEdit, design.canComplete], [false, false]);
  });
  await check("portal: another client can't reach the project; permissions unchanged", async () => {
    const res = await portal.requirePortalTaskProject(SA, clientProjectId, { id: "mB", contactId: "cB" } as never);
    assert.ok(res instanceof Response && res.status === 404);
    const p = (await projectSvc.getProject(clientProjectId))!;
    assert.equal(projectSvc.canActOnProject(p, { memberId: "mB", contactId: "cB" }), false);
  });
  await check("portal edit on own task only honors client-safe fields", async () => {
    await full.updateFullTask({ taskId: clientOwn, task: await get(clientOwn), actor: client, fromClient: true, patch: { title: "Send logo files (PNG)", assigneeUid: "admin2", visibility: "internal", estimateMinutes: 999 } });
    const t = await get(clientOwn);
    assert.equal(t.title, "Send logo files (PNG)");
    assert.equal(t.assigneeUid, null);
    assert.equal(t.visibility, "client");
    assert.equal(t.estimateMinutes, null);
  });

  // ── system template generation ─────────────────────────────────────────
  await check("Product Launch generates 14 tasks, 4 milestones, 1 routine with original scheduling", async () => {
    const start = new Date("2026-11-02T05:00:00Z");
    const r = await gen.generateProjectFromSystemTemplate({ subAccountId: SA, agencyId: AG, createdByUid: "admin1", templateKey: "sys_product_launch", title: "", startAt: start, endAt: null, autoSchedule: true, includeRoutines: true, includeMilestones: true, assignedContactId: null });
    assert.deepEqual([r.tasks, r.milestones, r.routines], [14, 4, 1]);
    const p = (await db.doc(`projects/${r.projectId}`).get()).data()!;
    assert.equal(p.title, "Product Launch");
    assert.equal(p.stepCount, 14); // routine excluded from progress
    assert.equal(p.dueAt.toDate().getTime(), start.getTime() + 30 * DAY);
    const tasks = (await db.collection("tasks").where("projectId", "==", r.projectId).get()).docs.map((d) => d.data());
    const sales = tasks.find((t) => t.title === "Write sales page copy")!;
    assert.equal(sales.dueAt.toDate().getTime(), start.getTime() + 3 * DAY + 17 * 3600_000);
    assert.deepEqual([sales.priority, sales.timeBlock, sales.estimateMinutes, sales.tags], ["high", "am", 180, ["copywriting"]]);
    const routine = tasks.find((t) => t.kind === "routine")!;
    assert.deepEqual([routine.title, routine.recurrence.type, routine.priority, routine.tags], ["Daily launch check-in", "daily", "medium", ["routine", "generated"]]);
    assert.equal(p.milestones[2].offsetLabel, "Launch day");
  });
  await check("generation without auto-schedule / milestones / routines", async () => {
    const start = new Date("2026-11-02T05:00:00Z");
    const r = await gen.generateProjectFromSystemTemplate({ subAccountId: SA, agencyId: AG, createdByUid: "admin1", templateKey: "sys_weekly_ceo_reset", title: "My week", startAt: start, endAt: null, autoSchedule: false, includeRoutines: false, includeMilestones: false, assignedContactId: null });
    assert.deepEqual([r.tasks, r.milestones, r.routines], [7, 0, 0]);
    const tasks = (await db.collection("tasks").where("projectId", "==", r.projectId).get()).docs.map((d) => d.data());
    assert.ok(tasks.every((t) => t.dueAt.toDate().getTime() === start.getTime() + 17 * 3600_000));
  });

  // ── offer grants ───────────────────────────────────────────────────────
  await check("v1 offer snapshot still grants a STEP project; v2 grants tasks; retries are no-ops", async () => {
    const base = { subAccountId: SA, agencyId: AG, offerId: "offer1", memberId: "mA" };
    const bundle = { templateId: "tLegacy", templateTitle: "Legacy", templateCategory: "", durationDays: 14, description: "", steps: [{ title: "Outline", order: 0 }, { title: "Record", order: 1 }] };
    const v1 = await grants.instantiateProjectEntitlements({ ...base, purchaseId: "p1", projectTemplates: [bundle] });
    assert.deepEqual([v1.created, v1.skipped], [1, 0]);
    const p1 = (await db.doc("projects/offer_p1_tLegacy").get()).data()!;
    assert.equal(p1.taskModel, undefined);
    assert.equal((await db.collection("projects/offer_p1_tLegacy/steps").get()).size, 2);
    const v2 = await grants.instantiateProjectEntitlements({ ...base, purchaseId: "p2", projectTemplates: [{ ...bundle, snapshotVersion: 2 }] });
    assert.equal(v2.created, 1);
    const again = await grants.instantiateProjectEntitlements({ ...base, purchaseId: "p2", projectTemplates: [{ ...bundle, snapshotVersion: 2 }] });
    assert.deepEqual([again.created, again.skipped], [0, 1]);
    const tasks = await db.collection("tasks").where("projectId", "==", "offer_p2_tLegacy").get();
    assert.deepEqual(tasks.docs.map((d) => d.id).sort(), ["offer_p2_tLegacy_t000", "offer_p2_tLegacy_t001"]);
    assert.ok(tasks.docs.every((d) => d.data().assigneeContactId === "cA" && d.data().visibility === "client"));
  });

  // ── staff route tenancy ────────────────────────────────────────────────
  await check("GET /api/tasks/[id]: member 200, other sub-account 403", async () => {
    const ok = await taskRoute.GET(staffReq("admin1"), { params: Promise.resolve({ id: t1 }) });
    assert.equal(ok.status, 200);
    const body = (await ok.json()) as { subtasks: unknown[]; project: { id: string } };
    assert.equal(body.project.id, clientProjectId);
    assert.equal(body.subtasks.length, 1);
    const denied = await taskRoute.GET(staffReq("outsider"), { params: Promise.resolve({ id: t1 }) });
    assert.equal(denied.status, 403);
    const patch = await taskRoute.PATCH(staffReq("outsider", "PATCH", { title: "hijack" }), { params: Promise.resolve({ id: t1 }) });
    assert.equal(patch.status, 403);
  });
  await check("DELETE removes task + subtask, unlinks dependents, recounts project", async () => {
    const res = await taskRoute.DELETE(staffReq("admin1", "DELETE"), { params: Promise.resolve({ id: t1 }) });
    assert.equal(res.status, 200);
    assert.equal((await db.doc(`tasks/${t1}`).get()).exists, false);
    assert.equal((await db.doc(`tasks/${sub1}`).get()).exists, false);
    assert.deepEqual((await get(t2)).dependsOnTaskIds, []);
    assert.equal((await db.collection("timeEntries").where("taskId", "==", t1).get()).size > 0, true); // audit kept
  });

  // ── rules ──────────────────────────────────────────────────────────────
  const browser = clientAs("admin1");
  const outsiderBrowser = clientAs("outsider");
  await rule("member lists sub-account tasks incl. project tasks (Calendar / My Tasks query)", true, async () => {
    const s = await cGetDocs(cQuery(cCollection(browser, "tasks"), cWhere("subAccountId", "==", SA)));
    assert.ok(s.docs.some((d) => d.data().projectId === clientProjectId));
  });
  await rule("member lists one project's tasks", true, () => cGetDocs(cQuery(cCollection(browser, "tasks"), cWhere("subAccountId", "==", SA), cWhere("projectId", "==", clientProjectId))));
  await rule("outsider lists sa1 project tasks", false, () => cGetDocs(cQuery(cCollection(outsiderBrowser, "tasks"), cWhere("subAccountId", "==", SA), cWhere("projectId", "==", clientProjectId))));
  await rule("browser creates a standalone task (existing TaskDialog path)", true, () => cSet(cDoc(browser, "tasks/browserTask"), { title: "Call back", notes: "", completed: false, agencyId: AG, subAccountId: SA, territoryId: "global", createdByUid: "admin1" }));
  await rule("browser edits a standalone task title", true, () => cUpdate(cDoc(browser, "tasks/browserTask"), { title: "Call back tomorrow" }));
  await rule("browser creates a task with projectId", false, () => cSet(cDoc(browser, "tasks/sneaky"), { title: "x", agencyId: AG, subAccountId: SA, territoryId: "global", projectId: clientProjectId }));
  await rule("browser inflates tracked time on a standalone task", false, () => cUpdate(cDoc(browser, "tasks/browserTask"), { timeSpentSeconds: 99999 }));
  await rule("browser edits a project task", false, () => cUpdate(cDoc(browser, `tasks/${t2}`), { title: "x" }));
  await rule("browser deletes a project task", false, () => cDelete(cDoc(browser, `tasks/${t2}`)));
  await rule("browser deletes a standalone task", true, () => cDelete(cDoc(browser, "tasks/browserTask")));
  await rule("browser reads timeEntries directly", false, () => cGet(cDoc(browser, `timeEntries/${clientEntry}`)));
  await rule("browser reads taskActivity directly", false, () => cGetDocs(cQuery(cCollection(browser, "taskActivity"), cWhere("taskId", "==", t2))));
  await rule("browser writes an activeTimer", false, () => cSet(cDoc(browser, "activeTimers/u_admin1"), { taskId: t2 }));

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

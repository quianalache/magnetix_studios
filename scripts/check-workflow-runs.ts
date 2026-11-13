/**
 * CRM Foundations Batch B — Workflow Runs, Contact Activity and Workflow
 * Testing, against the Firestore EMULATOR: run lifecycle activity (+ test
 * labels, dedupe), test-origin propagation (Start Workflow step, Workflow
 * Completed event, tag events), separate test statistics, no email history
 * on a failed send, the runs service (filters, paging, workspace failures,
 * detail timeline, missing contact / workflow, territory scope, tenant
 * isolation) and error scrubbing. QStash, email and SMS are blanked, so
 * nothing can be sent or scheduled. No network, no production credentials.
 *
 * Run (from the repo root):
 *   echo '{"emulators":{"firestore":{"port":8080}}}' > /tmp/emu/firebase.json
 *   firebase emulators:exec --config /tmp/emu/firebase.json --only firestore --project demo-runs \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx --tsconfig ./tsconfig.json scripts/check-workflow-runs.ts"
 */
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";

const PROJECT = process.env.GCLOUD_PROJECT ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !PROJECT.startsWith("demo-") || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Refusing to run: Firestore emulator + demo-* project only, no production credentials.");
  process.exit(1);
}
process.env.FIREBASE_ADMIN_PROJECT_ID ??= PROJECT;
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= PROJECT;
for (const k of ["RESEND_API_KEY", "EMAIL_FROM", "QSTASH_TOKEN", "QSTASH_URL", "STRIPE_SECRET_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "OPENROUTER_API_KEY"]) delete process.env[k];

const SA = "sa_runs";
const SA2 = "sa_runs_other";
const AG = "ag_runs";
const UID = "uid_runs";
let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${(err as Error).stack?.split("\n").slice(0, 3).join("\n       ")}`);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean, ms = 5000): Promise<T> {
  const end = Date.now() + ms;
  let v = await fn();
  while (!ok(v) && Date.now() < end) {
    await sleep(120);
    v = await fn();
  }
  return v;
}

async function main() {
  initializeApp({ projectId: PROJECT });
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const engine = await import("../src/lib/workflows/engine");
  const lifecycle = await import("../src/lib/workflows/run-lifecycle");
  const errors = await import("../src/lib/workflows/run-errors");
  const runs = await import("../src/lib/server/workflow-runs-service");
  const db = getAdminDb();

  await db.doc(`subAccounts/${SA}`).set({ name: "Runs QA", agencyId: AG });
  await db.doc(`subAccounts/${SA2}`).set({ name: "Other", agencyId: "ag_other" });
  await db.doc(`users/${UID}`).set({ displayName: "Owner Person", email: "owner@example.com" });
  const contact = (id: string, sa = SA, territoryId = "global") =>
    db.doc(`contacts/${id}`).set({ name: `TEST ${id}`, email: `${id}@example.com`, phone: "", tags: [], subAccountId: sa, agencyId: sa === SA ? AG : "ag_other", mode: "live", territoryId, createdAt: new Date(), updatedAt: new Date() });
  for (const id of ["c1", "c2", "c3", "c4", "c5"]) await contact(id);
  await contact("c_east", SA, "east");
  await contact("c_other", SA2);
  const wf = (id: string, data: Record<string, unknown>) =>
    db.doc(`workflows/${id}`).set({ id, name: id, status: "active", subAccountId: SA, agencyId: AG, createdByUid: UID, stats: { enrolled: 0, completed: 0 }, ...data });
  await wf("wf_a", { name: "Welcome", trigger: { type: "contact.created", filters: { all: [] } }, startNodeId: "n1", nodes: { n1: { id: "n1", type: "add_tag", config: { tag: "Welcomed" }, next: "n2" }, n2: { id: "n2", type: "goal", config: {}, next: null } } });
  await wf("wf_parent", { name: "Parent", status: "draft", trigger: { type: "contact.created", filters: { all: [] } }, startNodeId: "p1", nodes: { p1: { id: "p1", type: "start_workflow", config: { workflowId: "wf_child" }, next: null } } });
  await wf("wf_child", { name: "Child", trigger: null, startNodeId: "k1", nodes: { k1: { id: "k1", type: "goal", config: {}, next: null } } });
  await wf("wf_listener", { name: "After completion", trigger: { type: "workflow.completed", filters: { all: [] } }, startNodeId: "l1", nodes: { l1: { id: "l1", type: "goal", config: {}, next: null } } });
  await wf("wf_tagl", { name: "On Welcomed", trigger: { type: "contact.tag.added", filters: { all: [{ field: "tags", op: "has_tag", value: "welcomed" }] } }, startNodeId: "t1", nodes: { t1: { id: "t1", type: "goal", config: {}, next: null } } });
  await wf("wf_email", { name: "Email", trigger: null, startNodeId: "e1", nodes: { e1: { id: "e1", type: "send_email", config: { emailType: "transactional", subject: "Hi", bodyHtml: "<p>Hi</p>" }, next: null } } });
  await db.doc("workflows/wf_foreign").set({ id: "wf_foreign", name: "Foreign", status: "active", subAccountId: SA2, agencyId: "ag_other", startNodeId: "f1", nodes: { f1: { id: "f1", type: "goal", config: {}, next: null } } });

  const runsOf = async (wfId: string) => (await db.collection("workflowRuns").where("workflowId", "==", wfId).get()).docs.map((d) => d.data());
  const acts = async (cid: string) => (await db.collection(`contacts/${cid}/activities`).get()).docs.map((d) => ({ id: d.id, ...d.data() })) as Array<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const stats = async (wfId: string) => ((await db.doc(`workflows/${wfId}`).get()).get("stats") ?? {}) as Record<string, number>;
  const mkRun = (id: string, wfId: string, cid: string, context: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    db.doc(`workflowRuns/${id}`).set({ id, subAccountId: SA, agencyId: AG, workflowId: wfId, contactId: cid, status: "running", currentNodeId: null, history: [], context, qstashMessageId: null, enrolledAt: new Date(), updatedAt: new Date(), ...extra });

  console.log("Test runs");
  let testRunId = "";
  await check("Test starts the real engine: a run with test metadata + who started it", async () => {
    const res = await engine.enrollForTest({ subAccountId: SA, workflowId: "wf_a", contactId: "c1", startedByUid: UID });
    assert.equal(res.ok, true);
    testRunId = res.runId!;
    const run = (await db.doc(`workflowRuns/${testRunId}`).get()).data()!;
    assert.equal(run.context.test, true);
    assert.equal(run.context.startedByUid, UID);
    assert.equal(run.context.source, "workflow_test");
    // QStash is blanked here, so the first step can't be scheduled — the
    // run records that honestly as failed.
    assert.equal(run.status, "failed");
  });
  await check("test runs count separately from real enrollments", async () => {
    const s = await stats("wf_a");
    assert.equal(s.testEnrolled, 1);
    assert.equal(s.enrolled ?? 0, 0);
  });
  await check("Contact Activity: Workflow test started + failed, labelled test, linked to the run", async () => {
    const a = await waitFor(() => acts("c1"), (x) => x.filter((r) => r.type.startsWith("workflow_")).length >= 2);
    const started = a.find((r) => r.type === "workflow_started")!;
    const failedRow = a.find((r) => r.type === "workflow_failed")!;
    assert.equal(started.meta.test, true);
    assert.equal(started.meta.runId, testRunId);
    assert.equal(started.meta.workflowId, "wf_a");
    assert.match(started.content, /Workflow test “Welcome” started/);
    assert.match(failedRow.content, /couldn't be scheduled/);
  });
  await check("lifecycle activity is written once per run + kind (retry-safe)", async () => {
    await lifecycle.recordRunActivity(testRunId, "started");
    await lifecycle.recordRunActivity(testRunId, "started");
    assert.equal((await acts("c1")).filter((r) => r.type === "workflow_started").length, 1);
  });
  await check("a test run that completes: Workflow test completed + test completion count", async () => {
    await mkRun("run_done", "wf_a", "c2", { test: true, startedByUid: UID });
    await engine.runStep("run_done", "n2");
    assert.equal((await db.doc("workflowRuns/run_done").get()).get("status"), "completed");
    const a = await waitFor(() => acts("c2"), (x) => x.some((r) => r.type === "workflow_completed"));
    assert.equal(a.find((r) => r.type === "workflow_completed")!.meta.test, true);
    assert.equal((await stats("wf_a")).testCompleted, 1);
    assert.equal((await stats("wf_a")).completed ?? 0, 0);
  });

  console.log("Test origin travels down the chain (real actions still run)");
  await check("Start Workflow step from a test: child run keeps the test origin", async () => {
    await mkRun("run_parent", "wf_parent", "c3", { test: true });
    await engine.runStep("run_parent", "p1");
    const child = await waitFor(() => runsOf("wf_child"), (r) => r.length > 0);
    assert.equal(child.length, 1);
    assert.deepEqual(child[0].context.testOrigin, { rootRunId: "run_parent", rootWorkflowId: "wf_parent" });
    assert.notEqual(child[0].context.test, true, "the child is a real run of an active workflow, not a draft test");
    assert.equal((await stats("wf_child")).testEnrolled, 1);
  });
  await check("Workflow Completed event from a test: downstream run keeps the origin", async () => {
    const l = await waitFor(() => runsOf("wf_listener"), (r) => r.some((x) => x.contactId === "c3"));
    const run = l.find((x) => x.contactId === "c3")!;
    assert.equal(run.context.testOrigin.rootRunId, "run_parent");
  });
  await check("tag change made by a test step: tag-triggered run keeps the origin", async () => {
    await mkRun("run_tag", "wf_a", "c4", { test: true });
    await engine.runStep("run_tag", "n1");
    const t = await waitFor(() => runsOf("wf_tagl"), (r) => r.some((x) => x.contactId === "c4"));
    assert.equal(t.find((x) => x.contactId === "c4")!.context.testOrigin.rootRunId, "run_tag");
    const a = await waitFor(() => acts("c4"), (x) => x.some((r) => r.type === "workflow_started" && r.meta.workflowId === "wf_tagl"));
    assert.equal(a.find((r) => r.type === "workflow_started" && r.meta.workflowId === "wf_tagl")!.meta.testOriginRunId, "run_tag");
  });
  await check("real (live) runs stay unlabelled and count as enrollments", async () => {
    await engine.fireWorkflowTrigger({ subAccountId: SA, agencyId: AG, type: "contact.created", contactId: "c5" });
    const r = await waitFor(() => runsOf("wf_a"), (x) => x.some((y) => y.contactId === "c5"));
    const live = r.find((y) => y.contactId === "c5")!;
    assert.equal(lifecycle.isTestRelated(live.context), false);
    assert.equal((await stats("wf_a")).enrolled, 1);
  });

  console.log("Email history");
  await check("a failed workflow email records no 'Email sent' activity", async () => {
    await mkRun("run_mail", "wf_email", "c5", {});
    await engine.runStep("run_mail", "e1");
    const run = (await db.doc("workflowRuns/run_mail").get()).data()!;
    assert.equal(run.status, "failed");
    assert.equal((await acts("c5")).filter((r) => r.type === "email_sent").length, 0);
  });

  console.log("Runs service");
  for (let i = 0; i < 30; i++) {
    await mkRun(`bulk_${String(i).padStart(2, "0")}`, "wf_child", "c1", {}, { status: "completed", enrolledAt: new Date(Date.now() - i * 60000), updatedAt: new Date(Date.now() - i * 60000) });
  }
  await mkRun("old_run", "wf_child", "c2", {}, { status: "completed", enrolledAt: new Date(Date.now() - 60 * 86400000), updatedAt: new Date(Date.now() - 60 * 86400000) });
  await mkRun("wait_run", "wf_a", "c2", {}, {
    status: "waiting",
    currentNodeId: "n2",
    history: [{ nodeId: "n1", type: "wait", at: new Date(), result: "wait:3600s", execution: { actionId: "n1", attempt: 1, status: "success", errorCategory: null, errorMessage: null, referenceId: null, at: new Date() } }],
  });
  await mkRun("gone_contact", "wf_a", "c_missing", {}, { status: "failed" });
  await mkRun("gone_wf", "wf_deleted", "c1", {}, { status: "failed" });
  await mkRun("east_run", "wf_a", "c_east", {}, { status: "failed" });

  await check("per-workflow list: newest first, paged 25, total accurate, date range applies", async () => {
    const p1 = await runs.listRuns({ subAccountId: SA, territoryIds: null, workflowId: "wf_child", status: "all", range: "30d", q: "", page: 1 });
    assert.equal(p1.total, 31); // 30 bulk + the test-origin child run
    assert.equal(p1.runs.length, 25);
    assert.ok(p1.runs[0].enrolledAtMs >= p1.runs[1].enrolledAtMs);
    const p2 = await runs.listRuns({ subAccountId: SA, territoryIds: null, workflowId: "wf_child", status: "all", range: "30d", q: "", page: 2 });
    assert.equal(p2.runs.length, 6);
    const all = await runs.listRuns({ subAccountId: SA, territoryIds: null, workflowId: "wf_child", status: "all", range: "all", q: "", page: 1 });
    assert.equal(all.total, 32);
  });
  await check("status + contact search filters", async () => {
    const f = await runs.listRuns({ subAccountId: SA, territoryIds: null, workflowId: "wf_a", status: "failed", range: "30d", q: "", page: 1 });
    assert.ok(f.runs.every((r) => r.status === "failed"));
    const s = await runs.listRuns({ subAccountId: SA, territoryIds: null, workflowId: "wf_a", status: "all", range: "30d", q: "test c2", page: 1 });
    assert.ok(s.runs.length > 0 && s.runs.every((r) => r.contactName === "TEST c2"));
  });
  await check("workspace failed view: across workflows, failed step + plain error, workflow filter", async () => {
    const w = await runs.listRuns({ subAccountId: SA, territoryIds: null, workflowId: null, status: "failed", range: "30d", q: "", page: 1 });
    const wfIds = new Set(w.runs.map((r) => r.workflowId));
    assert.ok(wfIds.has("wf_a") && wfIds.has("wf_email"), JSON.stringify([...wfIds]));
    assert.ok(!w.runs.some((r) => r.workflowId === "wf_foreign"));
    const mail = w.runs.find((r) => r.workflowId === "wf_email")!;
    assert.equal(mail.failedStep?.label, "Send email");
    assert.match(mail.errorSummary ?? "", /Email isn't set up/);
    const only = await runs.listRuns({ subAccountId: SA, territoryIds: null, workflowId: null, status: "failed", range: "30d", q: "", page: 1, filterWorkflowId: "wf_email" });
    assert.ok(only.runs.length > 0 && only.runs.every((r) => r.workflowId === "wf_email"));
    assert.ok(w.workflows.some((x) => x.id === "wf_a") && !w.workflows.some((x) => x.id === "wf_foreign"));
    await assert.rejects(runs.listRuns({ subAccountId: SA, territoryIds: null, workflowId: null, status: "all", range: "30d", q: "", page: 1 }), /Choose a status/);
  });
  await check("detail: timeline, test info, started-by, plain error, step link data", async () => {
    const d = await runs.getRunDetail({ subAccountId: SA, territoryIds: null, runId: "run_mail" });
    assert.equal(d.timeline.length, 1);
    assert.equal(d.timeline[0].status, "failed");
    assert.equal(d.timeline[0].stepExists, true);
    assert.match(d.timeline[0].error!.message, /Email isn't set up/);
    const t = await runs.getRunDetail({ subAccountId: SA, territoryIds: null, runId: testRunId });
    assert.equal(t.test, true);
    assert.equal(t.startedBy, "Owner Person");
    assert.equal(t.trigger, "Test run");
    const child = (await runsOf("wf_child")).find((r) => r.context.testOrigin)!;
    const cd = await runs.getRunDetail({ subAccountId: SA, territoryIds: null, runId: child.id });
    assert.equal(cd.testRelated, true);
    assert.equal(cd.testOrigin?.rootWorkflowName, "Parent");
    assert.equal(cd.trigger, "Started by “Parent”");
  });
  await check("waiting run: shows the pending step with when it continues (not as done)", async () => {
    const d = await runs.getRunDetail({ subAccountId: SA, territoryIds: null, runId: "wait_run" });
    assert.equal(d.pending?.label, "End workflow");
    assert.equal(d.pending?.kind, "waiting");
    assert.ok(d.pending!.resumesAtMs! > Date.now());
    assert.ok(!d.timeline.some((t) => t.nodeId === "n2"));
  });
  await check("missing contact / deleted workflow: history kept, safe unavailable state", async () => {
    const gc = await runs.getRunDetail({ subAccountId: SA, territoryIds: null, runId: "gone_contact" });
    assert.equal(gc.contact, null);
    assert.equal(gc.contactName, null);
    const gw = await runs.getRunDetail({ subAccountId: SA, territoryIds: null, runId: "gone_wf" });
    assert.equal(gw.workflowExists, false);
    assert.equal(gw.workflowName, null);
  });
  await check("territory scope: only runs for contacts the member can see", async () => {
    const east = await runs.listRuns({ subAccountId: SA, territoryIds: ["east"], workflowId: null, status: "failed", range: "30d", q: "", page: 1 });
    assert.deepEqual(east.runs.map((r) => r.contactId), ["c_east"]);
    await assert.rejects(runs.getRunDetail({ subAccountId: SA, territoryIds: ["east"], runId: "run_mail" }), /Run not found/);
  });
  await check("tenant isolation: another workspace's run / workflow reads as not found", async () => {
    await db.doc("workflowRuns/foreign_run").set({ id: "foreign_run", subAccountId: SA2, agencyId: "ag_other", workflowId: "wf_foreign", contactId: "c_other", status: "failed", history: [], context: {}, enrolledAt: new Date(), updatedAt: new Date() });
    await assert.rejects(runs.getRunDetail({ subAccountId: SA, territoryIds: null, runId: "foreign_run" }), /Run not found/);
    await assert.rejects(runs.listRuns({ subAccountId: SA, territoryIds: null, workflowId: "wf_foreign", status: "all", range: "30d", q: "", page: 1 }), /Workflow not found/);
    await assert.rejects(runs.getRunDetail({ subAccountId: SA, territoryIds: null, runId: "run_mail", workflowId: "wf_a" }), /Run not found/);
    const t2 = await engine.enrollForTest({ subAccountId: SA, workflowId: "wf_foreign", contactId: "c1" });
    assert.equal(t2.ok, false);
    const t3 = await engine.enrollForTest({ subAccountId: SA, workflowId: "wf_a", contactId: "c_other" });
    assert.equal(t3.ok, false);
  });

  console.log("Error text");
  await check("errors are readable and never surface tokens / signed URLs", async () => {
    assert.match(errors.describeRunError("email_not_configured"), /Email isn't set up/);
    const fakeStripeKey = ["sk", "live", "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345"].join("_");
    const scrubbed = errors.scrubErrorText(`401 at https://hooks.example.com/x?token=abc123SECRET Bearer: ${fakeStripeKey}`);
    assert.ok(!scrubbed.includes("abc123SECRET") && !scrubbed.includes(fakeStripeKey), scrubbed);
    assert.match(scrubbed, /https:\/\/hooks\.example\.com\/x/);
    assert.equal(errors.describeRunError(null, null), "The step failed.");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

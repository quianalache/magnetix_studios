/**
 * Multiple Pipelines (2026-09-25) — end-to-end checks. EMULATOR ONLY: runs
 * the REAL route handlers, deal + pipeline services and the migration core
 * against the Firestore + Auth emulators with isolated fixtures. Refuses to
 * run unless both emulators are set, the project is `demo-*`, and no
 * production credential is in the environment.
 *
 *   echo '{"firestore":{"rules":"<repo>/firestore.rules"},
 *          "emulators":{"auth":{"port":9099},"firestore":{"port":8080}}}' > /tmp/emu/firebase.json
 *   firebase emulators:exec --config /tmp/emu/firebase.json --only firestore,auth \
 *     --project demo-pipelines \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx scripts/check-pipelines.ts"
 */
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT = process.env.GCLOUD_PROJECT ?? "";
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !PROJECT.startsWith("demo-") ||
  process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS
) {
  console.error("Refusing to run: needs the Firestore + Auth emulators, a demo-* project and no production credentials.");
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
const TS = new Date("2026-09-01T00:00:00Z");
let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

async function seed() {
  const w = (p: string, d: Record<string, unknown>) => db.doc(p).set(d);
  for (const [uid, claims] of [
    ["owner1", { status: "active", agencyId: AG, agencyRole: "owner" }],
    ["admin1", { status: "active", agencyId: AG, agencyRole: null }],
    ["collab1", { status: "active", agencyId: AG, agencyRole: null }],
    ["outsider", { status: "active", agencyId: AG, agencyRole: null }],
  ] as const) {
    await auth.createUser({ uid, email: `${uid}@example.test` });
    await auth.setCustomUserClaims(uid, claims);
  }
  await w(`agencies/${AG}`, { name: "Agency" });
  // sa1: renamed + reordered legacy stages, territory scoping on.
  await w("subAccounts/sa1", {
    agencyId: AG,
    name: "One",
    territoryScopingEnabled: true,
    pipelineStages: [
      { id: "new", label: "New Lead", order: 0 },
      { id: "qualified", label: "Qualified", order: 1 },
      { id: "contacted", label: "Discovery Call", order: 2 },
      { id: "proposal", label: "Proposal Sent", order: 3 },
      { id: "won", label: "Won", order: 4 },
      { id: "lost", label: "Lost", order: 5 },
    ],
  });
  await w("subAccounts/sa2", { agencyId: AG, name: "Two" });
  await w("subAccounts/sa1/subAccountMembers/admin1", { role: "admin", status: "active" });
  await w("subAccounts/sa1/subAccountMembers/collab1", {
    role: "collaborator",
    status: "active",
    assignedTerritoryIds: ["t1"],
  });
  await w("subAccounts/sa2/subAccountMembers/outsider", { role: "admin", status: "active" });

  const contact = (id: string, sa: string, territoryId: string) =>
    w(`contacts/${id}`, { agencyId: AG, subAccountId: sa, name: id, territoryId, createdAt: TS });
  await contact("c1", "sa1", "t1");
  await contact("c2", "sa1", "t2");
  await contact("c3", "sa2", "global");

  const deal = (id: string, sa: string, contactId: string, stageId: string, territoryId: string) =>
    w(`deals/${id}`, {
      agencyId: AG,
      subAccountId: sa,
      contactId,
      title: id,
      value: 100,
      currency: "USD",
      stageId,
      priority: "medium",
      territoryId,
      lostReason: null,
      createdByUid: "admin1",
      createdAt: TS,
      updatedAt: TS,
      stageChangedAt: TS,
    });
  await deal("d1", "sa1", "c1", "new", "t1");
  await deal("d2", "sa1", "c1", "proposal", "t1");
  await deal("d3", "sa1", "c2", "won", "t2");
  await deal("d4", "sa2", "c3", "new", "global");
  // A historical contact-timeline row for d1 (pre-feature shape).
  await w("contacts/c1/activities/legacy1", {
    type: "pipeline_moved",
    content: 'Deal "d1" created in New',
    createdBy: "admin1",
    meta: { dealId: "d1", toStageId: "new" },
    createdAt: TS,
  });
}

function req(uid: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  return new Request("http://test.local/x", {
    method,
    headers: { "x-user-uid": uid, "x-user-email": `${uid}@example.test`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const p = <T extends Record<string, string>>(v: T) => ({ params: Promise.resolve(v) });

async function main() {
  await seed();
  const core = await import("./pipelines-migration-core");
  const pipelinesRoute = await import("../src/app/api/sub-accounts/[id]/pipelines/route");
  const pipelineRoute = await import("../src/app/api/sub-accounts/[id]/pipelines/[pipelineId]/route");
  const stagesRoute = await import("../src/app/api/sub-accounts/[id]/pipelines/[pipelineId]/stages/route");
  const reassignRoute = await import("../src/app/api/sub-accounts/[id]/pipelines/[pipelineId]/stages/[stageId]/reassign/route");
  const legacyStagesRoute = await import("../src/app/api/sub-accounts/[id]/pipeline-stages/route");
  const dealsRoute = await import("../src/app/api/deals/route");
  const dealRoute = await import("../src/app/api/deals/[id]/route");
  const notesRoute = await import("../src/app/api/deals/[id]/notes/route");
  const noteRoute = await import("../src/app/api/deals/[id]/notes/[noteId]/route");
  const activityRoute = await import("../src/app/api/deals/[id]/activity/route");
  const contactNotesRoute = await import("../src/app/api/contacts/[id]/notes/route");
  const boardRoute = await import("../src/app/api/sub-accounts/[id]/pipelines/[pipelineId]/board/route");
  const listRoute = await import("../src/app/api/sub-accounts/[id]/pipelines/[pipelineId]/deals/route");
  const tasksRoute = await import("../src/app/api/tasks/route");
  const taskCompleteRoute = await import("../src/app/api/tasks/[id]/complete/route");
  const eventsRoute = await import("../src/app/api/events/route");
  const relatedRoute = await import("../src/app/api/deals/[id]/related/route");

  console.log("Compatibility (before migration)");
  await check("unmigrated sub-account reads one virtual default pipeline with its legacy stages", async () => {
    const res = await pipelinesRoute.GET(req("collab1"), p({ id: "sa1" }));
    const { pipelines } = await res.json();
    assert.equal(pipelines.length, 1);
    assert.equal(pipelines[0].id, "default");
    assert.equal(pipelines[0].virtual, true);
    assert.deepEqual(
      pipelines[0].stages.map((s: { id: string; name: string }) => `${s.id}:${s.name}`),
      ["new:New Lead", "qualified:Qualified", "contacted:Discovery Call", "proposal:Proposal Sent", "won:Won", "lost:Lost"],
    );
  });

  console.log("Migration");
  await check("dry-run plans without writing", async () => {
    const res = await core.runMigration(db, { apply: false, runId: "dry" });
    const sa1 = res.plans.find((x) => x.subAccountId === "sa1")!;
    assert.equal(sa1.defaultPipelineExists, false);
    assert.equal(sa1.dealsMissingPipelineId, 3);
    assert.equal(res.manifest.length, 0);
    assert.equal((await db.doc("subAccounts/sa1/pipelines/default").get()).exists, false);
    assert.equal((await db.doc("deals/d1").get()).get("pipelineId"), undefined);
  });
  await check("apply → rollback → apply on sa2 is recoverable", async () => {
    const first = await core.runMigration(db, { apply: true, subAccountIds: ["sa2"], runId: "r-sa2" });
    assert.equal(first.manifest.length, 2);
    const rb = await core.rollback(db, first.manifest, "r-sa2");
    assert.equal(rb.reverted.length, 2);
    assert.equal((await db.doc("deals/d4").get()).get("pipelineId"), undefined);
    assert.equal((await db.doc("subAccounts/sa2/pipelines/default").get()).exists, false);
  });
  await check("apply stamps only pipelineId and creates the default pipeline", async () => {
    const before = (await db.doc("deals/d2").get()).data()!;
    const res = await core.runMigration(db, { apply: true, runId: "r1" });
    assert.equal(res.manifest.filter((m) => m.kind === "pipeline_created").length, 2);
    const after = (await db.doc("deals/d2").get()).data()!;
    assert.equal(after.pipelineId, "default");
    assert.deepEqual({ ...after, pipelineId: undefined }, { ...before, pipelineId: undefined });
    const pl = (await db.doc("subAccounts/sa1/pipelines/default").get()).data()!;
    assert.equal(pl.stages[3].name, "Proposal Sent");
    assert.ok((await db.doc("pipelineMigrations/r1").get()).exists);
    const legacyRow = (await db.doc("contacts/c1/activities/legacy1").get()).data()!;
    assert.equal(legacyRow.content, 'Deal "d1" created in New');
  });
  await check("second apply is a no-op (idempotent) and reconcile is clean", async () => {
    const res = await core.runMigration(db, { apply: true, runId: "r2" });
    assert.equal(res.manifest.length, 0);
    const rows = await core.reconcile(db);
    assert.ok(rows.every((r) => r.ok), JSON.stringify(rows));
  });

  console.log("Pipelines + stages");
  let pid = "";
  await check("collaborator can't create a pipeline; admin can, with Won/Lost appended", async () => {
    const denied = await pipelinesRoute.POST(
      req("collab1", { name: "X", stageNames: ["A"] }),
      p({ id: "sa1" }),
    );
    assert.equal(denied.status, 403);
    const res = await pipelinesRoute.POST(
      req("admin1", { name: "Onboarding", description: "Post-sale", stageNames: ["Kickoff", "Setup", "Review", "Launch", "Handoff", "Done-ish", "Extra"] }),
      p({ id: "sa1" }),
    );
    assert.equal(res.status, 201);
    const { pipeline } = await res.json();
    pid = pipeline.id;
    assert.equal(pipeline.stages.length, 9);
    assert.deepEqual(pipeline.stages.slice(-2).map((s: { id: string }) => s.id), ["won", "lost"]);
  });
  const stageIds = async () =>
    ((await db.doc(`subAccounts/sa1/pipelines/${pid}`).get()).data()!.stages as { id: string; name: string; archived: boolean }[]);

  await check("deal create validates the stage against ITS pipeline + tenant", async () => {
    const [kickoff] = await stageIds();
    const bad = await dealsRoute.POST(
      req("admin1", { subAccountId: "sa1", title: "x", contactId: "c1", territoryId: "t1", pipelineId: pid, stageId: "proposal" }),
    );
    assert.equal(bad.status, 400);
    const foreign = await dealsRoute.POST(
      req("admin1", { subAccountId: "sa1", title: "x", contactId: "c1", territoryId: "t1", pipelineId: "nope", stageId: "new" }),
    );
    assert.equal(foreign.status, 404);
    const ok = await dealsRoute.POST(
      req("admin1", { subAccountId: "sa1", title: "New client", contactId: "c1", territoryId: "t1", pipelineId: pid, stageId: kickoff.id, expectedCloseDate: "2026-10-01", description: "Scope" }),
    );
    assert.equal(ok.status, 201);
    const { id } = await ok.json();
    const d = (await db.doc(`deals/${id}`).get()).data()!;
    assert.equal(d.pipelineId, pid);
    assert.equal(d.expectedCloseDate, "2026-10-01");
    const badDate = await dealsRoute.POST(
      req("admin1", { subAccountId: "sa1", title: "x", contactId: "c1", territoryId: "t1", stageId: "new", expectedCloseDate: "10/01/2026" }),
    );
    assert.equal(badDate.status, 400);
  });

  await check("cross-pipeline move requires an explicit destination stage", async () => {
    const noStage = await dealRoute.PATCH(req("admin1", { pipelineId: pid }, "PATCH"), p({ id: "d2" }));
    assert.equal(noStage.status, 400);
    assert.equal((await noStage.json()).code, "destination_stage_required");
    const [kickoff] = await stageIds();
    const ok = await dealRoute.PATCH(req("admin1", { pipelineId: pid, stageId: kickoff.id }, "PATCH"), p({ id: "d2" }));
    assert.equal(ok.status, 200);
    const d = (await db.doc("deals/d2").get()).data()!;
    assert.equal(d.pipelineId, pid);
    assert.equal(d.stageId, kickoff.id);
  });

  await check("territory: collaborator can't edit a deal outside their territories", async () => {
    const res = await dealRoute.PATCH(req("collab1", { title: "hack" }, "PATCH"), p({ id: "d3" }));
    assert.equal(res.status, 403);
    const own = await dealRoute.PATCH(req("collab1", { title: "d1 renamed" }, "PATCH"), p({ id: "d1" }));
    assert.equal(own.status, 200);
  });

  await check("cross-tenant: sa2 admin can't read sa1 pipelines or move sa1 deals", async () => {
    const res = await pipelineRoute.GET(req("outsider"), p({ id: "sa1", pipelineId: pid }));
    assert.equal(res.status, 403);
    const mv = await dealRoute.PATCH(req("outsider", { stageId: "won" }, "PATCH"), p({ id: "d1" }));
    assert.equal(mv.status, 403);
    const leak = await pipelineRoute.GET(req("outsider"), p({ id: "sa2", pipelineId: pid }));
    assert.equal(leak.status, 404);
  });

  await check("manage stages: no removal, Won/Lost fixed, archive needs reassignment", async () => {
    const stages = await stageIds();
    const put = (list: unknown[]) =>
      stagesRoute.PUT(req("admin1", { stages: list }, "PUT"), p({ id: "sa1", pipelineId: pid }));
    assert.equal((await put(stages.slice(1))).status, 400); // removed Kickoff
    assert.equal(
      (await put(stages.map((s) => (s.id === "won" ? { ...s, archived: true } : s)))).status,
      400,
    );
    const archiveKickoff = stages.map((s, i) => (i === 0 ? { ...s, archived: true } : s));
    const blocked = await put(archiveKickoff);
    assert.equal(blocked.status, 409);
    assert.equal((await blocked.json()).code, "stage_has_deals");
    const moved = await reassignRoute.POST(
      req("admin1", { toStageId: stages[1].id }),
      p({ id: "sa1", pipelineId: pid, stageId: stages[0].id }),
    );
    assert.deepEqual(await moved.json(), { moved: 2, remaining: 0 });
    const ok = await put([...archiveKickoff, { name: "Brand new stage" }]);
    assert.equal(ok.status, 200);
    const after = await stageIds();
    assert.equal(after.length, 10);
    assert.ok(after[0].archived && after[0].id === stages[0].id);
    const intoArchived = await dealsRoute.POST(
      req("admin1", { subAccountId: "sa1", title: "x", contactId: "c1", territoryId: "t1", pipelineId: pid, stageId: stages[0].id }),
    );
    assert.equal(intoArchived.status, 409);
  });

  await check("archive pipeline keeps its deals; blocks new deals; last active pipeline protected", async () => {
    const arch = await pipelineRoute.PATCH(req("admin1", { status: "archived" }, "PATCH"), p({ id: "sa1", pipelineId: pid }));
    assert.equal(arch.status, 200);
    assert.equal((await db.doc("deals/d2").get()).get("pipelineId"), pid);
    const stages = await stageIds();
    const blocked = await dealsRoute.POST(
      req("admin1", { subAccountId: "sa1", title: "x", contactId: "c1", territoryId: "t1", pipelineId: pid, stageId: stages[1].id }),
    );
    assert.equal(blocked.status, 409);
    const last = await pipelineRoute.PATCH(req("admin1", { status: "archived" }, "PATCH"), p({ id: "sa1", pipelineId: "default" }));
    assert.equal(last.status, 409);
    const restore = await pipelineRoute.PATCH(req("admin1", { status: "active" }, "PATCH"), p({ id: "sa1", pipelineId: pid }));
    assert.equal(restore.status, 200);
  });

  await check("legacy Settings stage editor keeps the stored default pipeline in step", async () => {
    const res = await legacyStagesRoute.PATCH(
      req("admin1", {
        stages: [
          { id: "new", label: "Inbound", order: 0 },
          { id: "contacted", label: "Contacted", order: 1 },
          { id: "qualified", label: "Qualified", order: 2 },
          { id: "proposal", label: "Proposal", order: 3 },
          { id: "won", label: "Won", order: 4 },
          { id: "lost", label: "Lost", order: 5 },
        ],
      }, "PATCH"),
      p({ id: "sa1" }),
    );
    assert.equal(res.status, 200);
    const pl = (await db.doc("subAccounts/sa1/pipelines/default").get()).data()!;
    assert.deepEqual(pl.stages.map((s: { name: string }) => s.name), ["Inbound", "Contacted", "Qualified", "Proposal", "Won", "Lost"]);
  });

  console.log("Deal Details: notes + activity");
  await check("deal notes are separate from contact notes and other deals", async () => {
    const created = await notesRoute.POST(req("collab1", { content: "Deal-only note" }), p({ id: "d1" }));
    assert.equal(created.status, 201);
    const { id: noteId } = await created.json();
    const d1 = await (await notesRoute.GET(req("collab1"), p({ id: "d1" }))).json();
    assert.equal(d1.notes.length, 1);
    const d2 = await (await notesRoute.GET(req("admin1"), p({ id: "d2" }))).json();
    assert.equal(d2.notes.length, 0);
    const contact = await (await contactNotesRoute.GET(req("admin1"), p({ id: "c1" }))).json();
    assert.equal(contact.notes.length, 0);
    const edit = await noteRoute.PATCH(req("admin1", { content: "x" }, "PATCH"), p({ id: "d1", noteId }));
    assert.equal(edit.status, 403);
    const denied = await notesRoute.GET(req("collab1"), p({ id: "d3" }));
    assert.equal(denied.status, 403);
  });

  await check("activity: deal-tagged history only, no duplicates, note markers content-free", async () => {
    const res = await (await activityRoute.GET(req("admin1"), p({ id: "d2" }))).json();
    const moves = res.items.filter((i: { type: string }) => i.type === "pipeline_moved");
    // d2: one cross-pipeline move + one reassignment move; each once.
    assert.equal(moves.length, 2, JSON.stringify(res.items));
    const d1 = await (await activityRoute.GET(req("admin1"), p({ id: "d1" }))).json();
    assert.ok(d1.items.some((i: { id: string }) => i.id === "contact:legacy1"));
    const note = d1.items.find((i: { kind: string }) => i.kind === "note");
    assert.ok(note && note.content === "");
  });

  await check("deleting a deal removes its notes + activity feed", async () => {
    const res = await dealRoute.DELETE(req("admin1", undefined, "DELETE"), p({ id: "d1" }));
    assert.equal(res.status, 200);
    assert.equal((await db.collection("deals/d1/notes").get()).size, 0);
    assert.equal((await db.collection("deals/d1/activities").get()).size, 0);
  });

  console.log("Board / List / Overview queries");
  const noFilters = { search: "", stageIds: [], priorities: [], minValue: null, maxValue: null, countries: [], territories: [] };
  // Fixture: 30 open deals in the default pipeline's "new" stage (paging),
  // one EUR deal (currency separation), all in territory t1.
  const batch = db.batch();
  for (let i = 0; i < 30; i++) {
    batch.set(db.doc(`deals/bulk${i}`), {
      agencyId: AG, subAccountId: "sa1", contactId: "c1", title: `Bulk ${i}`, value: 10,
      currency: "USD", pipelineId: "default", stageId: "new", priority: "low",
      territoryId: "t1", createdAt: TS, updatedAt: TS,
      stageChangedAt: new Date(TS.getTime() + i * 1000),
    });
  }
  batch.set(db.doc("deals/eur1"), {
    agencyId: AG, subAccountId: "sa1", contactId: "c2", title: "Euro deal", value: 500,
    currency: "EUR", pipelineId: "default", stageId: "proposal", priority: "high",
    territoryId: "t2", createdAt: TS, updatedAt: TS, stageChangedAt: TS,
  });
  await batch.commit();
  await db.doc("contacts/c2").update({ name: "Zed Unique", company: "Findable Co" });

  await check("overview stats per pipeline, currencies never summed", async () => {
    const res = await pipelinesRoute.GET(
      new Request("http://test.local/x?stats=1&fresh=1&includeArchived=1", { headers: { "x-user-uid": "admin1" } }),
      p({ id: "sa1" }),
    );
    const { summaries } = await res.json();
    const def = summaries.find((x: { pipeline: { id: string } }) => x.pipeline.id === "default");
    assert.equal(def.stats.openValue.USD, 300);
    assert.equal(def.stats.openValue.EUR, 500);
    assert.equal(def.stats.stageCounts.new, 30);
    assert.ok(summaries.some((x: { pipeline: { id: string } }) => x.pipeline.id === pid));
  });

  await check("board: exact counts, one page per stage, load more", async () => {
    const res = await boardRoute.POST(req("admin1", { filters: noFilters, fresh: true }), p({ id: "sa1", pipelineId: "default" }));
    const body = await res.json();
    const col = body.columns.find((c: { stageId: string }) => c.stageId === "new");
    assert.equal(col.count, 30);
    assert.equal(col.deals.length, 25);
    assert.equal(col.deals[0].title, "Bulk 29"); // most recently moved first
    assert.ok(col.deals[0].contact && col.deals[0].contact.id === "c1");
    const more = await boardRoute.POST(
      req("admin1", { filters: noFilters, offsets: { new: 25 }, onlyStageId: "new" }),
      p({ id: "sa1", pipelineId: "default" }),
    );
    const mb = await more.json();
    assert.equal(mb.columns.length, 1);
    assert.equal(mb.columns[0].deals.length, 5);
    // Other pipelines' deals never mix in.
    assert.ok(!body.columns.some((c: { deals: { pipelineId: string }[] }) => c.deals.some((d) => d.pipelineId !== "default")));
  });

  await check("board: territory-scoped collaborator only sees their deals", async () => {
    const res = await boardRoute.POST(req("collab1", { filters: noFilters, fresh: true }), p({ id: "sa1", pipelineId: "default" }));
    const body = await res.json();
    const ids = body.columns.flatMap((c: { deals: { id: string }[] }) => c.deals.map((d) => d.id));
    assert.ok(!ids.includes("eur1"), "t2 deal leaked to t1 collaborator");
    assert.equal(body.stats.openValue.EUR, undefined);
  });

  await check("search matches contact name/company; list sorts + pages the same set", async () => {
    const res = await boardRoute.POST(
      // fresh: the contact was renamed after the cached candidate set loaded.
      req("admin1", { filters: { ...noFilters, search: "findable" }, fresh: true }),
      p({ id: "sa1", pipelineId: "default" }),
    );
    const body = await res.json();
    const ids = body.columns.flatMap((c: { deals: { id: string }[] }) => c.deals.map((d) => d.id));
    // Both of c2's deals (open EUR + the Won one) match via the contact.
    assert.deepEqual([...ids].sort(), ["d3", "eur1"]);
    const list = await listRoute.POST(
      req("admin1", { filters: noFilters, sort: { field: "value", dir: "desc" }, page: 1 }),
      p({ id: "sa1", pipelineId: "default" }),
    );
    const lb = await list.json();
    assert.equal(lb.rows[0].id, "eur1");
    assert.equal(lb.rows.length, 25);
    assert.equal(lb.pageCount, 2);
    const boardTotal = body.columns.reduce((n: number, c: { count: number }) => n + c.count, 0);
    const listFiltered = await (await listRoute.POST(
      req("admin1", { filters: { ...noFilters, search: "findable" }, sort: { field: "updatedAt", dir: "desc" }, page: 1 }),
      p({ id: "sa1", pipelineId: "default" }),
    )).json();
    assert.equal(listFiltered.total, boardTotal);
  });

  console.log("Deal Details: tasks, appointments, next activity");
  await check("task/appointment links are tenant-checked", async () => {
    const bad = await tasksRoute.POST(req("admin1", { subAccountId: "sa1", title: "x", dealId: "d4" }));
    assert.equal(bad.status, 400); // d4 belongs to sa2
    const badEv = await eventsRoute.POST(req("admin1", {
      subAccountId: "sa1", title: "x", startAt: new Date(Date.now() + 864e5).toISOString(),
      endAt: new Date(Date.now() + 864e5 + 18e5).toISOString(), dealId: "d4",
    }));
    assert.equal(badEv.status, 400);
  });

  await check("linked tasks + appointments show in related, activity and board cards", async () => {
    const soon = Date.now() + 2 * 864e5;
    const t1 = await tasksRoute.POST(req("admin1", { subAccountId: "sa1", title: "Send contract", contactId: "c2", dealId: "eur1", dueAt: new Date(soon).toISOString() }));
    assert.equal(t1.status, 201);
    const t2 = await tasksRoute.POST(req("admin1", { subAccountId: "sa1", title: "Later step", contactId: "c2", dealId: "eur1", dueAt: new Date(soon + 5 * 864e5).toISOString() }));
    const { id: t2id } = await t2.json();
    const ev = await eventsRoute.POST(req("admin1", {
      subAccountId: "sa1", title: "Onboarding call", contactId: "c2", dealId: "eur1",
      startAt: new Date(soon).toISOString(), endAt: new Date(soon + 36e5).toISOString(),
    }));
    assert.equal(ev.status, 201);
    const rel = await (await relatedRoute.GET(req("admin1"), p({ id: "eur1" }))).json();
    assert.equal(rel.tasks.length, 2);
    assert.equal(rel.tasks[0].title, "Send contract");
    assert.equal(rel.upcoming.length, 1);
    const board = await (await boardRoute.POST(
      req("admin1", { filters: noFilters, include: ["nextTask", "nextAppointment"], fresh: true }),
      p({ id: "sa1", pipelineId: "default" }),
    )).json();
    const card = board.columns.flatMap((c: { deals: { id: string }[] }) => c.deals).find((d: { id: string }) => d.id === "eur1");
    assert.equal(card.nextTask.title, "Send contract");
    assert.equal(card.nextAppointment.title, "Onboarding call");
    const plain = await (await boardRoute.POST(req("admin1", { filters: noFilters }), p({ id: "sa1", pipelineId: "default" }))).json();
    const plainCard = plain.columns.flatMap((c: { deals: { id: string }[] }) => c.deals).find((d: { id: string }) => d.id === "eur1");
    assert.equal(plainCard.nextTask, undefined); // not requested → not read
    const done = await taskCompleteRoute.POST(req("admin1", { completed: true }), p({ id: t2id }));
    assert.equal(done.status, 200);
    const act = await (await activityRoute.GET(req("admin1"), p({ id: "eur1" }))).json();
    const types = act.items.map((i: { type: string }) => i.type);
    assert.ok(types.includes("task_created"));
    assert.ok(types.includes("task_completed"));
    assert.ok(types.includes("appointment_scheduled"));
  });

  await check("only admins can delete deals (matches the Firestore rule)", async () => {
    const res = await dealRoute.DELETE(req("collab1", undefined, "DELETE"), p({ id: "bulk0" }));
    assert.equal(res.status, 403);
    assert.ok((await db.doc("deals/bulk0").get()).exists);
  });

  console.log(`\n${passed} checks passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

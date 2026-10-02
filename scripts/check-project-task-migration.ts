/**
 * Legacy Project step conversion checks. EMULATOR ONLY.
 *
 * Run with:
 *   firebase emulators:exec --config /tmp/emu/magnetix-defects.json + *     --only firestore --project demo-project-task-migration + *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx scripts/check-project-task-migration.ts"
 */
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { auditLegacyProjects, convertLegacyProject, legacyProjectTaskId } from "../src/lib/server/project-task-migration-service";

const projectId = process.env.GCLOUD_PROJECT ?? "demo-project-task-migration";
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !projectId.startsWith("demo-") ||
  process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS
) {
  console.error("Refusing to run outside an isolated demo Firestore emulator.");
  process.exit(2);
}

initializeApp({ projectId });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

async function main() {
  const now = Timestamp.fromDate(new Date("2026-01-01T12:00:00Z"));
  await db.doc("subAccounts/sa1").set({ agencyId: "ag1", timezone: "UTC" });
  await db.doc("contacts/contact1").set({ agencyId: "ag1", subAccountId: "sa1", name: "Client" });
  await db.doc("projects/legacy1").set({
    agencyId: "ag1",
    subAccountId: "sa1",
    title: "Legacy client project",
    description: "Keep this project identity.",
    status: "active",
    startAt: null,
    dueAt: Timestamp.fromDate(new Date("2026-02-01T00:00:00Z")),
    assignedContactId: "contact1",
    assignedContactName: "Client",
    createdByUid: "staff1",
    stepCount: 2,
    stepsDoneCount: 1,
  });
  await db.doc("projects/legacy1/steps/step1").set({
    agencyId: "ag1",
    subAccountId: "sa1",
    title: "Completed legacy step",
    notes: "Keep notes",
    done: true,
    completedAt: now,
    order: 0,
    createdByUid: "staff1",
    createdAt: now,
    updatedAt: now,
  });
  await db.doc("projects/legacy1/steps/step2").set({
    agencyId: "ag1",
    subAccountId: "sa1",
    title: "Open legacy step",
    done: false,
    dueAt: Timestamp.fromDate(new Date("2026-01-20T00:00:00Z")),
    order: 1,
    createdByUid: "staff1",
    createdAt: now,
    updatedAt: now,
  });
  await db.doc("projects/empty").set({
    agencyId: "ag1",
    subAccountId: "sa1",
    title: "Empty legacy project",
    status: "active",
    stepCount: 0,
    stepsDoneCount: 0,
  });

  const audit = await auditLegacyProjects("sa1");
  assert.deepEqual(
    audit.map((p) => [p.projectId, p.stepCount]).sort(),
    [["legacy1", 2], ["empty", 0]].sort(),
  );

  const converted = await convertLegacyProject("legacy1");
  assert.equal(converted.taskCount, 2);
  const project = (await db.doc("projects/legacy1").get()).data()!;
  assert.equal(project.taskModel, "tasks");
  assert.equal(project.stepCount, 2);
  assert.equal(project.stepsDoneCount, 1);
  assert.equal(project.taskConversion.status, "completed");
  assert.equal((await db.collection("projects/legacy1/steps").get()).size, 2, "source steps remain recoverable");
  const preview = await (await import("../src/lib/server/project-service")).projectDeletePreview("legacy1");
  assert.deepEqual([preview.taskCount, preview.stepCount, preview.canDetach], [2, 0, true]);

  const completedTask = (await db.doc("tasks/" + legacyProjectTaskId("legacy1", "step1")).get()).data()!;
  const openTask = (await db.doc("tasks/" + legacyProjectTaskId("legacy1", "step2")).get()).data()!;
  assert.equal(completedTask.completed, true);
  assert.equal(completedTask.completedAt.toDate().toISOString(), now.toDate().toISOString());
  assert.equal(openTask.completed, false);
  assert.equal(openTask.dueAt.toDate().toISOString(), "2026-01-20T00:00:00.000Z");
  assert.equal(openTask.projectId, "legacy1");
  assert.equal(openTask.visibility, "client");
  assert.equal(openTask.legacyProjectStepOrder, 1);

  const repeated = await convertLegacyProject("legacy1");
  assert.equal(repeated.taskCount, 2);
  assert.equal((await db.collection("tasks").where("projectId", "==", "legacy1").get()).size, 2);

  const empty = await convertLegacyProject("empty");
  assert.equal(empty.taskCount, 0);
  assert.equal((await db.doc("projects/empty").get()).data()!.taskModel, "tasks");

  await db.doc("projects/recoverable").set({
    agencyId: "ag1", subAccountId: "sa1", title: "Recoverable", status: "active",
    stepCount: 1, stepsDoneCount: 0,
  });
  await db.doc("projects/recoverable/steps/conflict").set({
    agencyId: "ag1", subAccountId: "sa1", title: "Recover me", done: false, order: 0,
  });
  await db.doc("tasks/" + legacyProjectTaskId("recoverable", "conflict")).set({
    projectId: "different-project", subAccountId: "sa1", title: "Conflict",
  });
  await assert.rejects(() => convertLegacyProject("recoverable"), /conflict/);
  assert.equal((await db.doc("projects/recoverable").get()).data()!.taskConversion.status, "failed");
  await db.doc("tasks/" + legacyProjectTaskId("recoverable", "conflict")).delete();
  const recovered = await convertLegacyProject("recoverable");
  assert.equal(recovered.conversion?.status, "completed");
  assert.equal((await db.doc("projects/recoverable").get()).data()!.taskModel, "tasks");

  console.log("PASS  legacy project migration: preservation, idempotency, empty projects, and retryable conflicts");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

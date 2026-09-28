/**
 * Projects redesign (Phase 1) regression checks. EMULATOR ONLY — refuses to
 * run unless FIRESTORE_EMULATOR_HOST is set, the project is `demo-*`, and
 * no production credential is in the environment.
 *
 * Covers what the redesign reads/relies on and what it must not break:
 * 1. Firestore rules — projects / steps / projectTemplates stay member-read,
 *    tenant-isolated and client-write-denied; the new per-user template
 *    favorites doc (users/{uid}/settings/projectTemplateFavorites) is
 *    self-only.
 * 2. The REAL project-service (unchanged by the redesign) — template spawn
 *    from a legacy seeded template, step add/complete/delete + count
 *    recompute, archive/reactivate, Client Portal permission
 *    (canActOnProject) and portal listing (listProjectsForContact), and
 *    that the seeded template records are never modified.
 *
 * Run:
 *   echo '{"firestore":{"rules":"<repo>/firestore.rules"},
 *          "emulators":{"firestore":{"port":8080}}}' > /tmp/emu/firebase.json
 *   firebase emulators:exec --config /tmp/emu/firebase.json --only firestore \
 *     --project demo-projects-redesign \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx scripts/check-projects-redesign.ts"
 */
import assert from "node:assert/strict";
import { initializeApp as initAdmin } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  arrayUnion,
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";

const PROJECT = process.env.GCLOUD_PROJECT || "demo-projects-redesign";
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (
  !HOST ||
  !PROJECT.startsWith("demo-") ||
  process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS
) {
  console.error(
    "Refusing to run: needs FIRESTORE_EMULATOR_HOST, a demo-* project and no production credentials."
  );
  process.exit(2);
}
const [host, portStr] = HOST.split(":");

// The app's getAdminDb() reuses the first initialized app — this one has no
// credentials and talks only to the emulator.
initAdmin({ projectId: PROJECT });
const admin = getAdminFirestore();

const AG = "ag1";
const SA = "sa1";
const SA2 = "sa2";

const LEGACY_TEMPLATE = {
  agencyId: AG,
  subAccountId: SA,
  title: "YouTube Video Workflow",
  category: "Content Workflow",
  durationDays: 14,
  description: "",
  steps: [
    { title: "Outline", order: 0 },
    { title: "Record", order: 1 },
  ],
  // no `audience` — reads as internal, exactly like the 2026-08 seed
};
const CLIENT_TEMPLATE = {
  agencyId: AG,
  subAccountId: SA,
  title: "Client Onboarding",
  category: "Client Delivery",
  durationDays: 7,
  description: "",
  steps: [{ title: "Kickoff", order: 0 }],
  audience: "client",
};

async function seed() {
  const w = (p: string, d: Record<string, unknown>) => admin.doc(p).set(d);
  await w(`subAccounts/${SA}`, { agencyId: AG, name: "Main" });
  await w(`subAccounts/${SA2}`, { agencyId: AG, name: "Other" });
  await w(`subAccounts/${SA}/subAccountMembers/admin`, { status: "active", role: "admin" });
  await w(`subAccounts/${SA}/subAccountMembers/collab`, { status: "active", role: "collaborator" });
  await w(`subAccounts/${SA}/subAccountMembers/owner`, { status: "active", role: "admin" });
  await w(`subAccounts/${SA2}/subAccountMembers/outsider`, { status: "active", role: "admin" });
  await w(`projectTemplates/tLegacy`, LEGACY_TEMPLATE);
  await w(`projectTemplates/tClient`, CLIENT_TEMPLATE);
  await w(`projects/pSeed`, {
    agencyId: AG, subAccountId: SA, title: "Seed", description: "", status: "active",
    startAt: null, dueAt: null, assignedContactId: null, assignedContactName: null,
    createdByUid: "admin", createdByMemberId: null, templateId: null,
    stepCount: 1, stepsDoneCount: 0,
  });
  await w(`projects/pSeed/steps/s1`, {
    agencyId: AG, subAccountId: SA, title: "Step", done: false, order: 0,
    createdByUid: "admin", createdByMemberId: null,
  });
  // Offer-grant-shaped step (course-offer-purchase-service writes these).
  await w(`projects/pSeed/steps/step_000`, {
    agencyId: AG, subAccountId: SA, title: "Granted", done: false, order: 1,
    createdByUid: null, createdByMemberId: null,
  });
  await w(`projects/pOther`, {
    agencyId: AG, subAccountId: SA2, title: "Other tenant", status: "active",
    stepCount: 0, stepsDoneCount: 0, assignedContactId: null,
  });
}

let appN = 0;
function clientAs(uid: string, claims: Record<string, unknown>): Firestore {
  const app: FirebaseApp = initializeApp({ projectId: PROJECT }, `u${appN++}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, host, Number(portStr), {
    mockUserToken: { sub: uid, user_id: uid, ...claims },
  });
  return db;
}

let failures = 0;
let passes = 0;
async function expectRule(label: string, allowed: boolean, op: () => Promise<unknown>) {
  let ok: boolean;
  let detail = "";
  try {
    await op();
    ok = allowed;
    if (!ok) detail = "was ALLOWED";
  } catch (err) {
    const code = (err as { code?: string }).code;
    ok = !allowed && code === "permission-denied";
    if (!ok) detail = `threw ${code ?? String(err)}`;
  }
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${allowed ? "allow" : "deny "}  ${label}${detail ? ` — ${detail}` : ""}`);
}
async function expectOk(label: string, fn: () => Promise<void>) {
  try {
    await fn();
    passes++;
    console.log(`PASS  ${label}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${label} — ${(err as Error).message}`);
  }
}

async function main() {
  await seed();
  const member = { status: "active", agencyId: AG, agencyRole: null };
  const adminC = clientAs("admin", member);
  const collab = clientAs("collab", member);
  const outsider = clientAs("outsider", member);
  const owner = clientAs("owner", { status: "active", agencyId: AG, agencyRole: "owner" });

  // ── 1. Rules ────────────────────────────────────────────────────────────
  await expectRule("collab lists projects (where subAccountId ==)", true, () =>
    getDocs(query(collection(collab, "projects"), where("subAccountId", "==", SA))));
  // The pre-redesign client steps query had no tenancy filter — the rules
  // can't prove an unfiltered list, so it was denied (empty step list).
  await expectRule("UNFILTERED steps list (old query) is denied", false, () =>
    getDocs(collection(collab, "projects/pSeed/steps")));
  const stepsQ = (db: Firestore, sa: string) =>
    getDocs(query(collection(db, "projects/pSeed/steps"), where("subAccountId", "==", sa)));
  await expectRule("collab lists steps (fixed query, subAccountId filter)", true, () => stepsQ(collab, SA));
  await expectRule("admin lists steps (fixed query)", true, () => stepsQ(adminC, SA));
  await expectRule("agency owner lists projects (owner has member row)", true, () =>
    getDocs(query(collection(owner, "projects"), where("subAccountId", "==", SA))));
  await expectRule("agency owner lists steps (fixed query)", true, () => stepsQ(owner, SA));
  // Pre-existing platform behavior, unchanged: an owner with NO membership
  // row on a sub-account can't list by subAccountId alone (the owner
  // shortcut needs agencyId). Steps must behave exactly like projects.
  await expectRule("PARITY: owner without member row lists projects", false, () =>
    getDocs(query(collection(owner, "projects"), where("subAccountId", "==", SA2))));
  await expectRule("PARITY: owner without member row lists steps", false, () =>
    getDocs(query(collection(owner, "projects/pOther/steps"), where("subAccountId", "==", SA2))));
  await expectRule("outsider lists sa1 steps (fixed query)", false, () => stepsQ(outsider, SA));
  await expectRule("collab reads offer-grant step (deterministic id)", true, () =>
    getDoc(doc(collab, "projects/pSeed/steps/step_000")));
  await expectRule("collab lists templates (where subAccountId ==)", true, () =>
    getDocs(query(collection(collab, "projectTemplates"), where("subAccountId", "==", SA))));
  await expectRule("outsider lists sa1 projects", false, () =>
    getDocs(query(collection(outsider, "projects"), where("subAccountId", "==", SA))));
  await expectRule("outsider reads a sa1 project by id (workspace URL)", false, () =>
    getDoc(doc(outsider, "projects/pSeed")));
  await expectRule("outsider reads sa1 steps", false, () =>
    getDoc(doc(outsider, "projects/pSeed/steps/s1")));
  await expectRule("admin reads another tenant's project", false, () =>
    getDoc(doc(adminC, "projects/pOther")));
  await expectRule("owner edits a project from the browser", false, () =>
    updateDoc(doc(owner, "projects/pSeed"), { title: "x" }));
  await expectRule("admin toggles a step from the browser", false, () =>
    updateDoc(doc(adminC, "projects/pSeed/steps/s1"), { done: true }));
  await expectRule("owner edits a seeded template from the browser", false, () =>
    updateDoc(doc(owner, "projectTemplates/tLegacy"), { title: "x" }));
  await expectRule("admin writes a system template into projectTemplates", false, () =>
    setDoc(doc(adminC, "projectTemplates/sys_youtube_video"), { subAccountId: SA, title: "x" }));

  const favPath = "users/collab/settings/projectTemplateFavorites";
  await expectRule("user saves own template favorites", true, () =>
    setDoc(doc(collab, favPath), { bySubAccount: { [SA]: arrayUnion("sys_youtube_video", "ws:tLegacy") } }, { merge: true }));
  await expectRule("user reads own template favorites", true, () => getDoc(doc(collab, favPath)));
  await expectRule("another user reads someone's favorites", false, () => getDoc(doc(adminC, favPath)));
  await expectRule("another user writes someone's favorites", false, () =>
    setDoc(doc(adminC, favPath), { bySubAccount: {} }, { merge: true }));
  await expectRule("user deletes own favorites doc", true, () => deleteDoc(doc(collab, favPath)));

  // ── 2. Existing project-service behavior (unchanged) ────────────────────
  const svc = await import("../src/lib/server/project-service");

  let spawnedId = "";
  await expectOk("spawn from legacy seeded template copies its steps", async () => {
    const p = await svc.createProject({
      agencyId: AG, subAccountId: SA, title: "From template", description: "",
      startAt: null, dueAt: null, assignedContactId: null, assignedContactName: null,
      createdByUid: "admin", createdByMemberId: null, templateId: "tLegacy",
    });
    spawnedId = p.id;
    const steps = await svc.listSteps(p.id);
    assert.deepEqual(steps.map((s) => s.title), ["Outline", "Record"]);
    const fresh = await svc.getProject(p.id);
    assert.equal(fresh?.stepCount, 2);
    assert.equal(fresh?.templateId, "tLegacy");
  });

  await expectOk("add / complete / delete step recomputes counts", async () => {
    const added = await svc.addStep(spawnedId, {
      agencyId: AG, subAccountId: SA, title: "Publish", createdByUid: "admin", createdByMemberId: null,
    });
    await svc.updateStep(spawnedId, added.id, { done: true });
    let p = await svc.getProject(spawnedId);
    assert.equal(p?.stepCount, 3);
    assert.equal(p?.stepsDoneCount, 1);
    await svc.deleteStep(spawnedId, added.id);
    p = await svc.getProject(spawnedId);
    assert.equal(p?.stepCount, 2);
    assert.equal(p?.stepsDoneCount, 0);
  });

  await expectOk("archive / reactivate", async () => {
    await svc.updateProject(spawnedId, { status: "archived" });
    assert.equal((await svc.getProject(spawnedId))?.status, "archived");
    await svc.updateProject(spawnedId, { status: "active" });
    assert.equal((await svc.getProject(spawnedId))?.status, "active");
  });

  await expectOk("Client Portal permission (canActOnProject) unchanged", async () => {
    const clientProject = await svc.createProject({
      agencyId: AG, subAccountId: SA, title: "Client deliverable", description: "",
      startAt: null, dueAt: null, assignedContactId: "cA", assignedContactName: "Client A",
      createdByUid: "admin", createdByMemberId: null, templateId: "tClient",
    });
    const internal = (await svc.getProject(spawnedId))!;
    assert.equal(svc.canActOnProject(clientProject, { uid: "admin" }), true);
    assert.equal(svc.canActOnProject(clientProject, { memberId: "m1", contactId: "cA" }), true);
    assert.equal(svc.canActOnProject(clientProject, { memberId: "m2", contactId: "cB" }), false);
    assert.equal(svc.canActOnProject(clientProject, { memberId: "m3", contactId: null }), false);
    assert.equal(svc.canActOnProject(internal, { memberId: "m1", contactId: "cA" }), false);
    const portal = await svc.listProjectsForContact(SA, "cA");
    assert.deepEqual(portal.map((p) => p.id), [clientProject.id]);
    assert.equal((await svc.listProjectsForContact(SA2, "cA")).length, 0);
  });

  await expectOk("seeded template records were never modified", async () => {
    const legacy = (await admin.doc("projectTemplates/tLegacy").get()).data();
    const client = (await admin.doc("projectTemplates/tClient").get()).data();
    assert.deepEqual(legacy, LEGACY_TEMPLATE);
    assert.deepEqual(client, CLIENT_TEMPLATE);
    const all = await admin.collection("projectTemplates").get();
    assert.deepEqual(all.docs.map((d) => d.id).sort(), ["tClient", "tLegacy"]);
  });

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

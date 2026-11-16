/**
 * Pages & Funnels security hardening (2026-11-16) — EMULATOR ONLY.
 *
 * Storage (`storage.rules`, cross-service reads from Firestore): who may add,
 * overwrite, delete and read files under pages-funnels/{workspace}/{page}/.
 * Firestore (`firestore.rules`): the browser can't create or update
 * pages/{id} at all (design, publish state, settings are server-owned); read
 * and admin delete unchanged. Server: the two operations that moved off the
 * browser — create page and Reading Result settings — with tenant checks.
 *
 * Run (from the repo root):
 *   echo '{"emulators":{"firestore":{"port":8098},"storage":{"port":9198}},"firestore":{"rules":"firestore.rules"},"storage":{"rules":"storage.rules"}}' > firebase.rules-test.json
 *   firebase emulators:exec --config firebase.rules-test.json --only firestore,storage --project demo-pages-security \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx --tsconfig ./tsconfig.json scripts/check-pages-security-rules.ts"
 */
import assert from "node:assert/strict";
import { initializeApp as initAdmin } from "firebase-admin/app";
import { getStorage as getAdminStorage } from "firebase-admin/storage";
import { initializeApp, type FirebaseApp } from "firebase/app";
import { connectFirestoreEmulator, deleteDoc, doc, getDoc, getFirestore, setDoc, updateDoc, type Firestore } from "firebase/firestore";
import { connectStorageEmulator, deleteObject, getBytes, getStorage, ref, uploadBytes, type FirebaseStorage } from "firebase/storage";

const PROJECT = process.env.GCLOUD_PROJECT ?? "";
const FS = process.env.FIRESTORE_EMULATOR_HOST;
const ST = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
if (!FS || !ST || !PROJECT.startsWith("demo-") || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Refusing to run: Firestore + Storage emulators and a demo-* project only, no production credentials.");
  process.exit(1);
}
process.env.FIREBASE_ADMIN_PROJECT_ID ??= PROJECT;
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= PROJECT;
const BUCKET = `${PROJECT}.appspot.com`;
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = BUCKET;

const AG = "ag_main", AG2 = "ag_other", SA = "sa_main", SA2 = "sa_other";
let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${(err as Error).message}`);
  }
}
const denied = async (p: Promise<unknown>) => {
  let err: unknown = null;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  assert.ok(err, "expected the rules to deny this");
  assert.match(String((err as { code?: string }).code ?? err), /permission|unauthorized|denied/i);
};

const [fsHost, fsPort] = FS.split(":");
const [stHost, stPort] = ST.split(":");
let n = 0;
type Who = { uid: string; claims: Record<string, unknown> } | null;
function as(who: Who): { db: Firestore; storage: FirebaseStorage } {
  const app: FirebaseApp = initializeApp({ projectId: PROJECT, storageBucket: BUCKET, apiKey: "demo" }, `c${n++}`);
  const db = getFirestore(app);
  const storage = getStorage(app);
  const token = who ? { sub: who.uid, user_id: who.uid, ...who.claims } : undefined;
  connectFirestoreEmulator(db, fsHost, Number(fsPort), token ? { mockUserToken: token } : undefined);
  connectStorageEmulator(storage, stHost, Number(stPort), token ? { mockUserToken: token } : undefined);
  return { db, storage };
}
const active = (uid: string, agencyId: string, agencyRole: string | null = null) => ({ uid, claims: { status: "active", role: "admin", agencyId, agencyRole } });

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const put = (s: FirebaseStorage, path: string, type = "image/png", bytes = png) => uploadBytes(ref(s, path), bytes, { contentType: type });

async function main() {
  initAdmin({ projectId: PROJECT, storageBucket: BUCKET });
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const db = getAdminDb();
  const w = (path: string, data: Record<string, unknown>) => db.doc(path).set(data);
  await w(`subAccounts/${SA}`, { agencyId: AG, name: "Main" });
  await w(`subAccounts/${SA2}`, { agencyId: AG2, name: "Other" });
  await w(`subAccounts/${SA}/subAccountMembers/admin1`, { status: "active", role: "admin" });
  await w(`subAccounts/${SA}/subAccountMembers/collab1`, { status: "active", role: "collaborator" });
  await w(`subAccounts/${SA}/subAccountMembers/removed1`, { status: "removed", role: "admin" });
  await w(`subAccounts/${SA2}/subAccountMembers/outsider`, { status: "active", role: "admin" });
  const page = (id: string, sa: string, status = "draft") =>
    w(`pages/${id}`, { name: id, pageType: "landing", goal: "other", status, subAccountId: sa, agencyId: sa === SA ? AG : AG2, puckDraftData: { encoding: "puck-json-v1", json: "{}" }, blocks: [] });
  await page("pg1", SA);
  await page("pg_live", SA, "published");
  await page("pg_other", SA2);
  await page("pg_del_ok", SA);
  await getAdminStorage().bucket(BUCKET).file(`pages-funnels/${SA}/pg1/existing.png`).save(Buffer.from(png), { contentType: "image/png" });
  await getAdminStorage().bucket(BUCKET).file(`media-library/${SA}/asset1/private.png`).save(Buffer.from(png), { contentType: "image/png" });

  const anon = as(null);
  const owner = as(active("owner1", AG, "owner"));
  const admin = as(active("admin1", AG));
  const collab = as({ uid: "collab1", claims: { status: "active", role: "collaborator", agencyId: AG, agencyRole: null } });
  const removed = as({ uid: "removed1", claims: { status: "active", role: "admin", agencyId: AG, agencyRole: null } });
  const outsider = as(active("outsider", AG2));
  const otherOwner = as(active("owner2", AG2, "owner"));
  const inactiveAdmin = as({ uid: "admin1", claims: { status: "removed", role: "admin", agencyId: AG, agencyRole: null } });

  console.log("\nStorage — pages-funnels/{workspace}/{page}/");
  await check("S1 anonymous can't upload", () => denied(put(anon.storage, `pages-funnels/${SA}/pg1/a.png`)));
  await check("S2 an admin of another workspace can't upload", () => denied(put(outsider.storage, `pages-funnels/${SA}/pg1/b.png`)));
  await check("S2 another agency's owner can't upload", () => denied(put(otherOwner.storage, `pages-funnels/${SA}/pg1/b2.png`)));
  await check("S2 a page from another workspace can't be uploaded under this workspace's id (or vice versa)", async () => {
    await denied(put(outsider.storage, `pages-funnels/${SA2}/pg1/c.png`));
    await denied(put(admin.storage, `pages-funnels/${SA}/pg_other/c.png`));
    await denied(put(admin.storage, `pages-funnels/${SA}/no_such_page/c.png`));
  });
  await check("S3 nobody can overwrite an existing file from the browser (outsider or admin)", async () => {
    await denied(put(outsider.storage, `pages-funnels/${SA}/pg1/existing.png`));
    await denied(put(admin.storage, `pages-funnels/${SA}/pg1/existing.png`));
  });
  await check("S4 nobody can delete from the browser (outsider or admin)", async () => {
    await denied(deleteObject(ref(outsider.storage, `pages-funnels/${SA}/pg1/existing.png`)));
    await denied(deleteObject(ref(admin.storage, `pages-funnels/${SA}/pg1/existing.png`)));
  });
  await check("S5 a workspace admin can add a new image", async () => {
    await put(admin.storage, `pages-funnels/${SA}/pg1/image-1.png`);
  });
  await check("S5 the agency owner can add a new image", async () => {
    await put(owner.storage, `pages-funnels/${SA}/pg1/image-2.jpg`, "image/jpeg");
  });
  await check("S6 a collaborator can't upload (page editing is admin-only, unchanged)", () => denied(put(collab.storage, `pages-funnels/${SA}/pg1/d.png`)));
  await check("S6 a removed member or an inactive account can't upload", async () => {
    await denied(put(removed.storage, `pages-funnels/${SA}/pg1/e.png`));
    await denied(put(inactiveAdmin.storage, `pages-funnels/${SA}/pg1/e2.png`));
  });
  await check("type and size limits still apply", async () => {
    await denied(put(admin.storage, `pages-funnels/${SA}/pg1/f.html`, "text/html"));
    await denied(put(admin.storage, `pages-funnels/${SA}/pg1/g.png`, "image/png", new Uint8Array(5 * 1024 * 1024 + 10)));
  });
  await check("S7 published page images stay publicly readable", async () => {
    const bytes = await getBytes(ref(anon.storage, `pages-funnels/${SA}/pg1/existing.png`));
    assert.equal(bytes.byteLength, png.length);
  });
  await check("S8 private files stay private (Media Library path)", () => denied(getBytes(ref(anon.storage, `media-library/${SA}/asset1/private.png`))));

  console.log("\nFirestore — pages/{id}");
  await check("F1 another workspace's admin can't update a page", () => denied(updateDoc(doc(outsider.db, "pages/pg1"), { name: "x" })));
  await check("F2 a workspace admin can't overwrite the draft design", () => denied(updateDoc(doc(admin.db, "pages/pg1"), { puckDraftData: { encoding: "puck-json-v1", json: "{\"content\":[]}" } })));
  await check("F3 … or the published design / popups", async () => {
    await denied(updateDoc(doc(admin.db, "pages/pg1"), { puckPublishedData: { encoding: "puck-json-v1", json: "{}" } }));
    await denied(updateDoc(doc(admin.db, "pages/pg1"), { puckDraftPopups: {}, puckPublishedPopups: {} }));
    await denied(updateDoc(doc(admin.db, "pages/pg1"), { blocks: [] }));
  });
  await check("F4 … or the publish state and timestamps", async () => {
    await denied(updateDoc(doc(admin.db, "pages/pg1"), { status: "published" }));
    await denied(updateDoc(doc(admin.db, "pages/pg1"), { puckPublishedAt: new Date(), publishedAt: new Date() }));
  });
  await check("F15/F16 an allowed-looking change can't carry a design change (and metadata is server-only too)", async () => {
    await denied(updateDoc(doc(admin.db, "pages/pg1"), { name: "Renamed", puckDraftData: { encoding: "puck-json-v1", json: "{}" } }));
    await denied(updateDoc(doc(admin.db, "pages/pg1"), { name: "Renamed" }));
    await denied(updateDoc(doc(admin.db, "pages/pg1"), { readingResult: { chartDesignSetId: null, sample: "projector" } }));
    await denied(updateDoc(doc(owner.db, "pages/pg1"), { puckDraftData: { encoding: "puck-json-v1", json: "{}" } }));
  });
  await check("F9 the browser can't create pages directly (creation is server-side)", () =>
    denied(setDoc(doc(admin.db, "pages/new_from_client"), { name: "x", subAccountId: SA, agencyId: AG, status: "draft", puckDraftData: { encoding: "puck-json-v1", json: "{}" } })),
  );
  await check("reads unchanged: members read drafts, the public reads published pages only", async () => {
    assert.equal((await getDoc(doc(admin.db, "pages/pg1"))).exists(), true);
    assert.equal((await getDoc(doc(collab.db, "pages/pg1"))).exists(), true);
    assert.equal((await getDoc(doc(anon.db, "pages/pg_live"))).exists(), true);
    await denied(getDoc(doc(anon.db, "pages/pg1")));
    await denied(getDoc(doc(outsider.db, "pages/pg1")));
  });
  await check("F17 page deletion unchanged: admins can, collaborators and outsiders can't", async () => {
    await denied(deleteDoc(doc(collab.db, "pages/pg_del_ok")));
    await denied(deleteDoc(doc(outsider.db, "pages/pg_del_ok")));
    await deleteDoc(doc(admin.db, "pages/pg_del_ok"));
    assert.equal((await db.doc("pages/pg_del_ok").get()).exists, false);
  });

  console.log("\nServer — operations moved off the browser");
  const svc = await import("../src/lib/server/pages-funnels-puck-service");
  await check("F9 server create: a Draft in the caller's workspace with the agency from the workspace record", async () => {
    const r = await svc.createPuckPage({ subAccountId: SA, uid: "admin1", name: "Spring sale", pageType: "sales", goal: "sales" });
    assert.ok(r.ok);
    const p = (await db.doc(`pages/${r.pageId}`).get()).data()!;
    assert.equal(p.subAccountId, SA);
    assert.equal(p.agencyId, AG);
    assert.equal(p.status, "draft");
    assert.equal(p.origin, "blank");
    assert.equal(p.slug, "spring-sale");
    assert.deepEqual(p.seo, { title: "Spring sale", description: "", ogImage: "" });
    assert.equal(p.puckDraftData, undefined);
  });
  await check("F9 server create: a Reading Result Page starts from its ready-made layout", async () => {
    const r = await svc.createPuckPage({ subAccountId: SA, uid: "admin1", name: "Results", pageType: "reading_result", goal: "confirmation" });
    assert.ok(r.ok);
    const p = (await db.doc(`pages/${r.pageId}`).get()).data()!;
    assert.ok(p.puckDraftData?.json?.includes("content"));
    assert.deepEqual(p.readingResult, { chartDesignSetId: null, sample: "projector" });
  });
  await check("server create refuses bad input and unknown workspaces", async () => {
    for (const bad of [{ name: "", pageType: "sales", goal: "sales" }, { name: "x", pageType: "nope", goal: "sales" }, { name: "x", pageType: "sales", goal: "nope" }]) {
      const r = await svc.createPuckPage({ subAccountId: SA, uid: "admin1", ...bad });
      assert.equal(r.ok, false);
    }
    const r = await svc.createPuckPage({ subAccountId: "sa_missing", uid: "admin1", name: "x", pageType: "sales", goal: "sales" });
    assert.equal(r.ok, false);
  });
  await check("F11 Reading settings: saved for this workspace's Reading Result Page; foreign Chart Designs and pages refused", async () => {
    const r = await svc.createPuckPage({ subAccountId: SA, uid: "admin1", name: "Results 2", pageType: "reading_result", goal: "confirmation" });
    assert.ok(r.ok);
    await db.doc("chartDesignSets/cds_main").set({ subAccountId: SA, agencyId: AG, name: "Main", isDefault: false, members: {} });
    await db.doc("chartDesignSets/cds_other").set({ subAccountId: SA2, agencyId: AG2, name: "Other", isDefault: false, members: {} });
    assert.deepEqual(await svc.updateReadingResultPageSettings(SA, r.pageId, { chartDesignSetId: "cds_main", sample: "generator" }), { ok: true });
    assert.deepEqual((await db.doc(`pages/${r.pageId}`).get()).data()!.readingResult, { chartDesignSetId: "cds_main", sample: "generator" });
    assert.equal((await svc.updateReadingResultPageSettings(SA, r.pageId, { chartDesignSetId: "cds_other", sample: "generator" })).ok, false);
    assert.equal((await svc.updateReadingResultPageSettings(SA, r.pageId, { chartDesignSetId: null, sample: "not-a-sample" })).ok, false);
    assert.equal((await svc.updateReadingResultPageSettings(SA, "pg1", { chartDesignSetId: null, sample: "projector" })).ok, false, "not a Reading Result Page");
    assert.equal((await svc.updateReadingResultPageSettings(SA2, r.pageId, { chartDesignSetId: null, sample: "projector" })).ok, false, "another workspace");
    assert.deepEqual(await svc.updateReadingResultPageSettings(SA, r.pageId, { chartDesignSetId: null, sample: "projector" }), { ok: true });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

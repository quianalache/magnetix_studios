/**
 * Wave 2 Storage hardening (2026-11-16) — EMULATOR ONLY. For Broadcasts,
 * Community, Standalone Courses, Course Offers and Forms: who may add,
 * overwrite, delete and read files, per the module's real access model, and
 * that the agency-scope folders are server-only.
 *
 * Run (from the repo root):
 *   echo '{"emulators":{"firestore":{"port":8098},"storage":{"port":9198}},"firestore":{"rules":"firestore.rules"},"storage":{"rules":"storage.rules"}}' > firebase.rules-test.json
 *   firebase emulators:exec --config firebase.rules-test.json --only firestore,storage --project demo-storage-modules \
 *     "pnpm exec tsx scripts/check-storage-modules-rules.ts"
 */
import assert from "node:assert/strict";
import { initializeApp as initAdmin } from "firebase-admin/app";
import { getFirestore as getAdminDb } from "firebase-admin/firestore";
import { getStorage as getAdminStorage } from "firebase-admin/storage";
import { initializeApp } from "firebase/app";
import { connectStorageEmulator, deleteObject, getBytes, getStorage, ref, uploadBytes, type FirebaseStorage } from "firebase/storage";

const PROJECT = process.env.GCLOUD_PROJECT ?? "";
const ST = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
if (!process.env.FIRESTORE_EMULATOR_HOST || !ST || !PROJECT.startsWith("demo-") || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Refusing to run: Firestore + Storage emulators and a demo-* project only, no production credentials.");
  process.exit(1);
}
const BUCKET = `${PROJECT}.appspot.com`;
const AG = "ag_main", AG2 = "ag_other", SA = "sa_main", SA2 = "sa_other", SA3 = "sa_other_agency";
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
async function denied(p: Promise<unknown>) {
  let err: unknown = null;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  assert.ok(err, "expected the rules to deny this");
  assert.match(String((err as { code?: string }).code ?? err), /unauthorized|permission/i);
}
const [host, port] = ST.split(":");
let n = 0;
function as(uid: string | null, claims: Record<string, unknown> = {}): FirebaseStorage {
  const app = initializeApp({ projectId: PROJECT, storageBucket: BUCKET, apiKey: "demo" }, `s${n++}`);
  const st = getStorage(app);
  connectStorageEmulator(st, host, Number(port), uid ? { mockUserToken: { sub: uid, user_id: uid, ...claims } } : undefined);
  return st;
}
const active = (agencyId: string, agencyRole: string | null = null) => ({ status: "active", role: "admin", agencyId, agencyRole });
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7]);
const put = (s: FirebaseStorage, path: string, type = "image/png") => uploadBytes(ref(s, path), png, { contentType: type });

async function main() {
  initAdmin({ projectId: PROJECT, storageBucket: BUCKET });
  const db = getAdminDb();
  const bucket = getAdminStorage().bucket(BUCKET);
  const w = (path: string, data: Record<string, unknown>) => db.doc(path).set(data);
  await w(`subAccounts/${SA}`, { agencyId: AG, name: "Main" });
  await w(`subAccounts/${SA2}`, { agencyId: AG, name: "Sibling (same agency)" });
  await w(`subAccounts/${SA3}`, { agencyId: AG2, name: "Other agency" });
  await w(`subAccounts/${SA}/subAccountMembers/admin1`, { status: "active", role: "admin" });
  await w(`subAccounts/${SA}/subAccountMembers/collab1`, { status: "active", role: "collaborator" });
  await w(`subAccounts/${SA}/subAccountMembers/removed1`, { status: "removed", role: "admin" });
  await w(`subAccounts/${SA2}/subAccountMembers/sibling`, { status: "active", role: "admin" });
  await w(`subAccounts/${SA3}/subAccountMembers/foreign`, { status: "active", role: "admin" });
  await w(`subAccounts/${SA}/communityGroups/g1`, { name: "Group" });
  await w(`subAccounts/${SA}/standaloneCourses/c1`, { title: "Course" });
  await w(`subAccounts/${SA}/courseOffers/o1`, { title: "Offer" });
  await w(`subAccounts/${SA2}/communityGroups/g2`, { name: "Sibling group" });
  await w(`forms/f1`, { subAccountId: SA, agencyId: AG, name: "Form" });
  await w(`forms/f2`, { subAccountId: SA2, agencyId: AG, name: "Sibling form" });

  const anon = as(null);
  const noAccess = as("nobody", active(AG));
  const sibling = as("sibling", active(AG));
  const foreignAdmin = as("foreign", active(AG2));
  const foreignOwner = as("owner2", active(AG2, "owner"));
  const admin = as("admin1", active(AG));
  const owner = as("owner1", active(AG, "owner"));
  const collab = as("collab1", { status: "active", role: "collaborator", agencyId: AG, agencyRole: null });
  const removed = as("removed1", active(AG));
  const inactive = as("admin1", { status: "removed", role: "admin", agencyId: AG, agencyRole: null });

  // Module table: folder of a REAL record in SA, a fabricated record, a real record of another workspace,
  // and whether collaborators may add (broadcasts: yes — any member can send broadcasts).
  const modules = [
    { name: "Broadcasts", dir: `broadcasts/${SA}/draft-123`, fake: null, otherWs: `broadcasts/${SA2}/draft-9`, collabCan: true },
    { name: "Community", dir: `community/${SA}/g1`, fake: `community/${SA}/no_such_group`, otherWs: `community/${SA}/g2`, collabCan: false },
    { name: "Standalone Courses", dir: `standalone-courses/${SA}/c1`, fake: `standalone-courses/${SA}/no_such_course`, otherWs: `standalone-courses/${SA2}/c1`, collabCan: false },
    { name: "Course Offers", dir: `course-offers/${SA}/o1`, fake: `course-offers/${SA}/no_such_offer`, otherWs: `course-offers/${SA2}/o1`, collabCan: false },
    { name: "Forms", dir: `forms/${SA}/f1`, fake: `forms/${SA}/no_such_form`, otherWs: `forms/${SA}/f2`, collabCan: false },
  ];

  for (const m of modules) {
    console.log(`\n${m.name}`);
    const existing = `${m.dir}/existing.png`;
    const original = Buffer.from([1, 2, 3, 4, 5]);
    await bucket.file(existing).save(original, { contentType: "image/png" });
    let k = 0;
    const fresh = () => `${m.dir}/new-${k++}.png`;
    await check("1 anonymous can't add", () => denied(put(anon, fresh())));
    await check("2 signed-in account with no workspace access can't add", () => denied(put(noAccess, fresh())));
    await check("3 admin of another workspace (same agency) can't add", () => denied(put(sibling, fresh())));
    await check("4 admin of another agency, and another agency's owner, can't add", async () => {
      await denied(put(foreignAdmin, fresh()));
      await denied(put(foreignOwner, fresh()));
    });
    await check("5 workspace admin can add", () => put(admin, fresh()).then(() => undefined));
    await check("6 agency owner can add", () => put(owner, fresh()).then(() => undefined));
    await check(`7 collaborator ${m.collabCan ? "can" : "can't"} add (matches who can edit this module)`, () =>
      m.collabCan ? put(collab, fresh()).then(() => undefined) : denied(put(collab, fresh())),
    );
    await check("8 removed member or inactive account can't add", async () => {
      await denied(put(removed, fresh()));
      await denied(put(inactive, fresh()));
    });
    if (m.fake) await check("9 a fabricated record folder is refused", () => denied(put(admin, `${m.fake}/x.png`)));
    await check("9 another workspace's folder is refused for this workspace's admin", () => denied(put(admin, `${m.otherWs}/x.png`)));
    await check("10 nobody can overwrite or delete an existing file from the browser (file unchanged)", async () => {
      await denied(put(admin, existing));
      await denied(put(sibling, existing));
      await denied(deleteObject(ref(admin, existing)));
      await denied(deleteObject(ref(foreignAdmin, existing)));
      const [after] = await bucket.file(existing).download();
      assert.deepEqual(after, original);
    });
    await check("public read unchanged", async () => {
      const bytes = await getBytes(ref(anon, existing));
      assert.equal(bytes.byteLength, original.length);
    });
    await check("non-image types refused", () => denied(put(admin, fresh().replace(".png", ".html"), "text/html")));
  }

  console.log("\nModule specifics");
  await check("Standalone Courses: PDFs allowed (lesson resources), other types not", async () => {
    await put(admin, `standalone-courses/${SA}/c1/resource.pdf`, "application/pdf");
    await denied(put(admin, `standalone-courses/${SA}/c1/x.zip`, "application/zip"));
  });
  await check("Agency-scope folders are server-only (even the agency owner can't write from the browser)", async () => {
    for (const p of [`broadcasts/agency/${AG}/d/x.png`, `community/agency/${AG}/g/x.png`, `standalone-courses/agency/${AG}/c/x.png`, `course-offers/agency/${AG}/o/x.png`]) {
      await denied(put(owner, p));
    }
  });
  await check("Agency-scope files stay publicly readable", async () => {
    await bucket.file(`community/agency/${AG}/g/logo.png`).save(Buffer.from([9, 9]), { contentType: "image/png" });
    assert.equal((await getBytes(ref(anon, `community/agency/${AG}/g/logo.png`))).byteLength, 2);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Content Library + QR Code image uploads (2026-11-17 repair) — EMULATOR ONLY.
 * These folders had no Storage rule, so every browser upload failed. Checks
 * the new create-only, workspace-scoped rules with the real client SDK:
 * roles, record ownership, the two "not saved yet" draft folders, file type and
 * size limits, no overwrite / delete, and staff-only reads.
 *
 * Run (from the repo root):
 *   echo '{"emulators":{"firestore":{"port":8098},"storage":{"port":9198}},"firestore":{"rules":"firestore.rules"},"storage":{"rules":"storage.rules"}}' > firebase.rules-test.json
 *   firebase emulators:exec --config firebase.rules-test.json --only firestore,storage --project demo-content-qr \
 *     "pnpm exec tsx scripts/check-content-qr-storage-rules.ts"
 */
import assert from "node:assert/strict";
import { initializeApp as initAdmin } from "firebase-admin/app";
import { getFirestore as getAdminDb } from "firebase-admin/firestore";
import { getStorage as getAdminStorage } from "firebase-admin/storage";
import { initializeApp } from "firebase/app";
import { connectStorageEmulator, deleteObject, getBytes, getDownloadURL, getStorage, ref, uploadBytes, type FirebaseStorage } from "firebase/storage";

const PROJECT = process.env.GCLOUD_PROJECT ?? "";
const ST = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
if (!process.env.FIRESTORE_EMULATOR_HOST || !ST || !PROJECT.startsWith("demo-") || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Refusing to run: Firestore + Storage emulators and a demo-* project only, no production credentials.");
  process.exit(1);
}
const BUCKET = `${PROJECT}.appspot.com`;
const AG = "ag_main", AG2 = "ag_other", SA = "sa_main", SA2 = "sa_sibling", SA3 = "sa_other_agency";
const UUID = "3f2c8a1e-9b7d-4c2e-8f1a-0d6b5e4c3a21";
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
const img = (size = 12) => { const b = new Uint8Array(size); b.set([0x89, 0x50, 0x4e, 0x47]); return b; };
const put = (s: FirebaseStorage, path: string, type = "image/png", bytes = img()) => uploadBytes(ref(s, path), bytes, { contentType: type });
const MB = 1024 * 1024;

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
  await w(`contentTemplates/tpl1`, { subAccountId: SA, agencyId: AG, name: "Template" });
  await w(`contentTemplates/tpl_sibling`, { subAccountId: SA2, agencyId: AG, name: "Sibling template" });
  await w(`qrCodes/qr1`, { subAccountId: SA, agencyId: AG, name: "QR" });
  await w(`qrCodes/qr_sibling`, { subAccountId: SA2, agencyId: AG, name: "Sibling QR" });

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

  const areas = [
    {
      name: "Content Library (saved template)", dir: `content-library/${SA}/tpl1`, file: (k: number) => `image-${k}.png`,
      fake: `content-library/${SA}/no_such_template`, spoof: `content-library/${SA}/tpl_sibling`, otherWs: `content-library/${SA2}/tpl1`, max: 5,
    },
    {
      name: "Content Library (unsaved template → draft-template)", dir: `content-library/${SA}/draft-template`, file: (k: number) => `image-${k}.png`,
      fake: null, spoof: null, otherWs: `content-library/${SA2}/draft-template`, max: 5,
    },
    {
      name: "QR logo (saved QR)", dir: `qr-codes/${SA}/qr1`, file: (k: number) => `logo-${k}.png`,
      fake: `qr-codes/${SA}/no_such_qr`, spoof: `qr-codes/${SA}/qr_sibling`, otherWs: `qr-codes/${SA2}/qr1`, max: 2,
    },
    {
      name: "QR background (saved QR)", dir: `qr-codes/${SA}/qr1`, file: (k: number) => `background-${k}.png`,
      fake: `qr-codes/${SA}/no_such_qr`, spoof: `qr-codes/${SA}/qr_sibling`, otherWs: `qr-codes/${SA2}/qr1`, max: 5,
    },
    {
      name: "QR logo + background (New QR page → UUID draft folder)", dir: `qr-codes/${SA}/${UUID}`, file: (k: number) => (k % 2 ? `logo-${k}.png` : `background-${k}.png`),
      fake: null, spoof: null, otherWs: `qr-codes/${SA2}/${UUID}`, max: 2,
    },
  ];

  for (const a of areas) {
    console.log(`\n${a.name}`);
    let k = 0;
    const fresh = () => `${a.dir}/${a.file(k++)}`;
    const existing = `${a.dir}/${a.file(9000)}`;
    const original = Buffer.from([1, 2, 3, 4]);
    await bucket.file(existing).save(original, { contentType: "image/png" });
    await check("1 anonymous can't upload", () => denied(put(anon, fresh())));
    await check("2 signed-in account with no workspace access can't upload", () => denied(put(noAccess, fresh())));
    await check("3 admin of another workspace (same agency) can't upload", () => denied(put(sibling, fresh())));
    await check("4 admin and owner of another agency can't upload", async () => {
      await denied(put(foreignAdmin, fresh()));
      await denied(put(foreignOwner, fresh()));
    });
    await check("5 removed member or inactive account can't upload", async () => {
      await denied(put(removed, fresh()));
      await denied(put(inactive, fresh()));
    });
    await check("6 workspace admin can upload (and get the download link)", async () => {
      const p = fresh();
      await put(admin, p);
      assert.match(await getDownloadURL(ref(admin, p)), /token=/);
    });
    await check("7 agency owner can upload", () => put(owner, fresh()).then(() => undefined));
    await check("8 collaborator can't upload (templates / QR codes are admin-edited)", () => denied(put(collab, fresh())));
    if (a.fake) await check("9 made-up record folder refused", () => denied(put(admin, `${a.fake}/${a.file(1)}`)));
    if (a.spoof) await check("20 another workspace's record named under this workspace is refused", () => denied(put(admin, `${a.spoof}/${a.file(2)}`)));
    await check("20 this workspace's admin can't write into another workspace's folder", () => denied(put(admin, `${a.otherWs}/${a.file(3)}`)));
    await check("11 JPEG / WebP / GIF accepted", async () => {
      for (const [ext, type] of [["jpg", "image/jpeg"], ["webp", "image/webp"], ["gif", "image/gif"]]) await put(admin, fresh().replace(/\.png$/, `.${ext}`), type);
    });
    await check("12 non-image refused", () => denied(put(admin, fresh().replace(/\.png$/, ".html"), "text/html")));
    await check(`13 file at or over ${a.max} MB refused`, () => denied(put(admin, `${a.dir}/${a.file(1)}`, "image/png", img(a.max * MB))));
    await check("14/15 overwrite and delete refused (file unchanged)", async () => {
      await denied(put(admin, existing));
      await denied(deleteObject(ref(admin, existing)));
      await denied(deleteObject(ref(sibling, existing)));
      const [after] = await bucket.file(existing).download();
      assert.deepEqual(after, original);
    });
    await check("17 staff of the workspace can read; anonymous and other workspaces can't", async () => {
      assert.equal((await getBytes(ref(admin, existing))).byteLength, original.length);
      assert.equal((await getBytes(ref(collab, existing))).byteLength, original.length);
      await denied(getBytes(ref(anon, existing)));
      await denied(getBytes(ref(sibling, existing)));
      await denied(getBytes(ref(foreignOwner, existing)));
    });
  }

  console.log("\nSpecifics");
  await check("QR: a 3 MB logo is refused but the same size background is accepted", async () => {
    await denied(put(admin, `qr-codes/${SA}/qr1/logo-big.png`, "image/png", img(3 * MB)));
    await put(admin, `qr-codes/${SA}/qr1/background-big.png`, "image/png", img(3 * MB));
  });
  await check("QR: only logo-* / background-* files; Content Library: only image-* files", async () => {
    await denied(put(admin, `qr-codes/${SA}/qr1/other-1.png`));
    await denied(put(admin, `content-library/${SA}/tpl1/other-1.png`));
  });
  await check("QR: a non-UUID made-up folder (Firestore-style id) is refused", () => denied(put(admin, `qr-codes/${SA}/AbCdEfGhIjKlMnOpQrSt/logo-1.png`)));
  await check("16 the stored download link (token URL) still serves the image to anyone", async () => {
    const url = await getDownloadURL(ref(admin, `qr-codes/${SA}/qr1/logo-9000.png`));
    const res = await fetch(url);
    assert.equal(res.status, 200);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

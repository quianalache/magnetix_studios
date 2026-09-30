/**
 * Social Planner ↔ Media Library regression checks. EMULATOR ONLY.
 *
 * Run with Firestore + Auth + Storage emulators and a demo-* project:
 *   NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' ./node_modules/.bin/tsx scripts/check-social-media.ts
 */
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { POST } from "../src/app/api/sub-accounts/[id]/social/posts/route";
import { PATCH } from "../src/app/api/sub-accounts/[id]/social/posts/[postId]/route";

const project = process.env.GCLOUD_PROJECT ?? "";
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
  !project.startsWith("demo-") ||
  process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  process.env.QSTASH_TOKEN
) {
  console.error("Refusing to run: needs Firestore, Auth and Storage emulators, a demo-* project, no production credentials and no QStash token.");
  process.exit(2);
}

initializeApp({ projectId: project, storageBucket: `${project}.appspot.com` });
const db = getFirestore();
const auth = getAuth();
const SA = "sa-social";
const OTHER_SA = "sa-other";
const AG = "ag-social";
const PUBLIC_URL = "https://firebasestorage.googleapis.com/v0/b/demo/o/media-public/sa-social/approved.jpg?token=approved";
const FOREIGN_URL = "https://firebasestorage.googleapis.com/v0/b/demo/o/media-public/sa-other/foreign.jpg?token=foreign";
const now = Timestamp.now();

function request(body: unknown, method = "POST", subAccountId = SA) {
  return new Request(`http://test.local/api/sub-accounts/${subAccountId}/social/posts`, {
    method,
    headers: { "content-type": "application/json", "x-user-uid": "admin", "x-user-email": "admin@example.test" },
    body: JSON.stringify(body),
  });
}

async function body(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

async function main() {
  await auth.createUser({ uid: "admin", email: "admin@example.test" });
  await auth.setCustomUserClaims("admin", { status: "active", agencyId: AG, agencyRole: null });
  await db.doc(`subAccounts/${SA}`).set({ agencyId: AG, socialPlannerEnabledByAgency: true });
  await db.doc(`subAccounts/${OTHER_SA}`).set({ agencyId: AG, socialPlannerEnabledByAgency: true });
  await db.doc(`subAccounts/${SA}/subAccountMembers/admin`).set({ role: "admin", status: "active" });
  await db.doc(`subAccounts/${OTHER_SA}/subAccountMembers/admin`).set({ role: "admin", status: "active" });

  const asset = (id: string, subAccountId: string, publicUrl: string | null, status = "ready") =>
    db.doc(`subAccounts/${subAccountId}/mediaAssets/${id}`).set({
      agencyId: AG,
      subAccountId,
      uploadedByPersonId: "admin",
      mediaType: "image",
      source: { type: "other", id: "media-library" },
      storage: { provider: "firebase", key: `media-library/${subAccountId}/${id}/approved.jpg`, bucket: `${project}.appspot.com`, mimeType: "image/jpeg", fileSizeBytes: 128 },
      status,
      access: { type: "tenant" },
      metadata: { originalFilename: `${id}.jpg`, durationMs: null, width: 10, height: 10 },
      library: { title: id, tags: [] },
      publicImage: publicUrl ? { key: `media-public/${subAccountId}/${id}/approved.jpg`, url: publicUrl, publishedAt: now, publishedByUid: "admin" } : null,
      references: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

  await asset("approved", SA, PUBLIC_URL);
  await asset("private", SA, null);
  await asset("revoked", SA, null);
  await asset("foreign", OTHER_SA, FOREIGN_URL);

  const approved = await POST(request({ caption: "approved", imageUrl: PUBLIC_URL, targets: [], status: "draft" }), { params: Promise.resolve({ id: SA }) });
  assert.equal(approved.status, 200);
  const approvedData = await body(approved);
  assert.equal(typeof approvedData.id, "string");

  const privateImage = await POST(request({ caption: "private", imageUrl: "https://firebasestorage.googleapis.com/private", targets: [], status: "draft" }), { params: Promise.resolve({ id: SA }) });
  assert.equal(privateImage.status, 400, JSON.stringify(await body(privateImage)));

  const external = await POST(request({ caption: "external", imageUrl: "https://example.com/image.jpg", targets: [], status: "draft" }), { params: Promise.resolve({ id: SA }) });
  assert.equal(external.status, 400, JSON.stringify(await body(external)));

  const foreign = await POST(request({ caption: "foreign", imageUrl: FOREIGN_URL, targets: [], status: "draft" }), { params: Promise.resolve({ id: SA }) });
  assert.equal(foreign.status, 400, JSON.stringify(await body(foreign)));

  const revoked = await POST(request({ caption: "revoked", imageUrl: "https://firebasestorage.googleapis.com/v0/b/demo/o/media-public/sa-social/revoked.jpg?token=revoked", targets: [], status: "draft" }), { params: Promise.resolve({ id: SA }) });
  assert.equal(revoked.status, 400, JSON.stringify(await body(revoked)));

  const postId = approvedData.id as string;
  const edited = await PATCH(request({ caption: "edited", imageUrl: PUBLIC_URL, targets: ["facebook"], status: "draft" }), { params: Promise.resolve({ id: SA, postId }) });
  assert.equal(edited.status, 200, JSON.stringify(await body(edited)));
  const stored = await db.doc(`socialPosts/${postId}`).get();
  assert.equal(stored.data()?.imageUrl, PUBLIC_URL);
  assert.equal(stored.data()?.status, "draft");

  console.log("Social Planner media checks: 7 passed, 0 failed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

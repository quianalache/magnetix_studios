/**
 * Assets (Resource Library · CRM Resources · Media Library · Affiliate
 * Library · replay links) — end-to-end checks. EMULATOR ONLY (Firestore +
 * Auth + Storage, `demo-*` project, no production credentials, no Bunny
 * API calls). Runs the REAL route handlers + services against isolated
 * fixtures, plus firestore.rules under the client SDK.
 *
 * Run:
 *   echo '{"firestore":{"rules":"<repo>/firestore.rules"},"storage":{"rules":"<repo>/storage.rules"},
 *          "emulators":{"auth":{"port":9099},"firestore":{"port":8080},"storage":{"port":9199}}}' > /tmp/emu/firebase.json
 *   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-assets.appspot.com AUTOMATIONS_TOKEN_SECRET=test-secret \
 *   BUNNY_STREAM_TOKEN_KEY=test-token-key NEXT_PUBLIC_APP_URL=https://app.test \
 *   firebase emulators:exec --config /tmp/emu/firebase.json --only firestore,auth,storage --project demo-assets \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' ./node_modules/.bin/tsx scripts/check-assets.ts"
 */
import assert from "node:assert/strict";
import { viaDispatcher } from "./_via-dispatcher";
import { createHash } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { initializeApp as initClient, type FirebaseApp } from "firebase/app";
import {
  connectStorageEmulator,
  getBytes as cGetBytes,
  getStorage as cStorage,
  ref as cRef,
  uploadBytes as cUploadBytes,
  uploadBytesResumable as cUploadResumable,
  type FirebaseStorage as ClientStorage,
} from "firebase/storage";
import {
  collection as cCollection,
  connectFirestoreEmulator,
  doc as cDoc,
  getDoc as cGet,
  getDocs as cGetDocs,
  getFirestore as cFirestore,
  query as cQuery,
  where as cWhere,
  type Firestore as ClientDb,
} from "firebase/firestore";

const PROJECT = process.env.GCLOUD_PROJECT || "demo-assets";
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
  !PROJECT.startsWith("demo-") ||
  process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  process.env.BUNNY_STREAM_API_KEY
) {
  console.error("Refusing to run: needs Firestore + Auth + Storage emulators, a demo-* project, no production credentials and no Bunny API key.");
  process.exit(2);
}
for (const k of ["RESEND_API_KEY", "QSTASH_TOKEN", "QSTASH_URL", "OPENROUTER_API_KEY", "VAPID_PRIVATE_KEY", "STRIPE_SECRET_KEY"]) delete process.env[k];
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||= `${PROJECT}.appspot.com`;
process.env.AUTOMATIONS_TOKEN_SECRET ||= "test-secret";
process.env.BUNNY_STREAM_TOKEN_KEY ||= "test-token-key";
process.env.NEXT_PUBLIC_APP_URL ||= "https://app.test";

initializeApp({ projectId: PROJECT, storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
const auth = getAuth();
const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);

const AG = "ag1";
const AG2 = "ag2";
const SA = "sa1";
const SA2 = "sa2";

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

function req(uid: string, method = "GET", body?: unknown, url = "http://test.local/x") {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  return new Request(url, {
    method,
    headers: isForm
      ? { "x-user-uid": uid, "x-user-email": `${uid}@example.test` }
      : { "x-user-uid": uid, "x-user-email": `${uid}@example.test`, "content-type": "application/json" },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
}

let appN = 0;
function clientAs(uid: string, agencyId = AG): ClientDb {
  const app: FirebaseApp = initClient({ projectId: PROJECT }, `c${appN++}`);
  const cdb = cFirestore(app);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(":");
  connectFirestoreEmulator(cdb, host, Number(port), { mockUserToken: { sub: uid, user_id: uid, status: "active", agencyId, agencyRole: null } });
  return cdb;
}

function storageAs(uid: string | null): ClientStorage {
  const app: FirebaseApp = initClient({ projectId: PROJECT, storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET }, `s${appN++}`);
  const st = cStorage(app);
  const [host, port] = process.env.FIREBASE_STORAGE_EMULATOR_HOST!.split(":");
  connectStorageEmulator(st, host, Number(port), uid ? { mockUserToken: { sub: uid, user_id: uid } } : undefined);
  return st;
}
async function storageRule(label: string, allowed: boolean, op: () => Promise<unknown>) {
  await check(`${allowed ? "allow" : "deny "}  storage: ${label}`, async () => {
    try {
      await op();
      assert.ok(allowed, "was ALLOWED");
    } catch (err) {
      if (allowed) throw err;
      assert.equal((err as { code?: string }).code, "storage/unauthorized", String(err));
    }
  });
}

const bunnyVideo = (sa: string, ag: string, guid: string, status: string, refs: unknown[] = []) => ({
  agencyId: ag, subAccountId: sa, ownerScope: { kind: "tenant", agencyId: ag, subAccountId: sa }, uploadedByPersonId: "admin1",
  mediaType: "video", source: { type: "course", id: "c1" },
  storage: { provider: "bunny", key: guid, bucket: null, mimeType: "video/mp4", fileSizeBytes: 5_000_000 },
  status, access: { type: "course", courseId: "c1" }, metadata: { originalFilename: `${guid}.mp4`, durationMs: 390_000, width: 1920, height: 1080 },
  bunny: { libraryId: "lib1", videoGuid: guid, title: `Video ${guid}`, lifecycleStatus: status, durationSeconds: 390, storageBytes: 48_000_000, width: 1920, height: 1080, thumbnailFileName: null, providerStatus: 4, providerUpdatedAt: null, deletedAt: null },
  references: refs, createdAt: Timestamp.now(), updatedAt: Timestamp.now(), deletedAt: null,
});

async function seed() {
  for (const [uid, agencyId, agencyRole] of [["admin1", AG, null], ["member2", AG, null], ["outsider", AG2, null]] as const) {
    await auth.createUser({ uid, email: `${uid}@example.test` });
    await auth.setCustomUserClaims(uid, { status: "active", agencyId, agencyRole });
    await db.doc(`users/${uid}`).set({ status: "active" });
  }
  const w = (p: string, d: Record<string, unknown>) => db.doc(p).set(d);
  await w(`subAccounts/${SA}`, { agencyId: AG, name: "Studio", timezone: "UTC" });
  await w(`subAccounts/${SA2}`, { agencyId: AG2, name: "Other Co", timezone: "UTC" });
  await w(`subAccounts/${SA}/subAccountMembers/admin1`, { status: "active", role: "admin", displayName: "Quiana" });
  await w(`subAccounts/${SA}/subAccountMembers/member2`, { status: "active", role: "collaborator", displayName: "Jordan" });
  await w(`subAccounts/${SA2}/subAccountMembers/outsider`, { status: "active", role: "admin" });

  // Media: a lesson video (referenced), a free video, a processing video, an image, the usage doc, and another tenant's video.
  await w(`subAccounts/${SA}/mediaAssets/v1`, bunnyVideo(SA, AG, "guid-v1", "ready", [{ type: "course_lesson", courseId: "c1", lessonId: "l1", createdAt: Timestamp.now() }]));
  await w(`subAccounts/${SA}/mediaAssets/v2`, bunnyVideo(SA, AG, "guid-v2", "ready"));
  await w(`subAccounts/${SA}/mediaAssets/v3`, bunnyVideo(SA, AG, "guid-v3", "processing"));
  await w(`subAccounts/${SA}/mediaAssets/__usage`, { hostedVideoCount: 3 });
  await w(`subAccounts/${SA2}/mediaAssets/vX`, bunnyVideo(SA2, AG2, "guid-vx", "ready"));
  await w(`subAccounts/${SA}/standaloneCourses/c1`, { title: "Video Editing Masterclass", published: true, updatedAt: Timestamp.now() });
  await w(`subAccounts/${SA}/standaloneCourses/c1/lessons/l1`, { title: "Intro", hostedVideoId: "v1", order: 0 });
  await w(`subAccounts/${SA}/standaloneCourses/c1/lessons/l2`, { title: "Second lesson", hostedVideoId: null, order: 1 });

  // CRM modules (SA) + one foreign record per collection (SA2).
  await w(`subAccounts/${SA}/courseOffers/o1`, { title: "Brand Audit Offer", visibility: "published", updatedAt: Timestamp.now() });
  await w(`subAccounts/${SA}/communityGroups/g1`, { name: "Launch Party Community", slug: "launch", status: "published", tagline: "For students" });
  await w(`forms/f1`, { subAccountId: SA, agencyId: AG, name: "Podcast Guest Intake", updatedAt: Timestamp.now() });
  await w(`forms/fX`, { subAccountId: SA2, agencyId: AG2, name: "Foreign form" });
  await w(`pages/p1`, { subAccountId: SA, agencyId: AG, name: "Webinar page", status: "draft", pageType: "webinar" });
  await w(`subAccounts/${SA}/webinars/w1`, { title: "Monthly Q&A", status: "scheduled", slug: "qa" });
  await w(`subAccounts/${SA}/bookingPages/strategy`, { name: "Strategy call", status: "published", slug: "strategy" });
  await w(`products/pr1`, { subAccountId: SA, agencyId: AG, name: "Coaching session", active: true });
  await w(`products/prX`, { subAccountId: SA2, agencyId: AG2, name: "Foreign product", active: true });
  await w(`subAccounts/${SA}/website/main`, { status: "ready", liveUrl: "https://studio.example", config: { business_name: "Studio site" } });

  // Legacy Assets records.
  await w(`assets/rLegacy`, { subAccountId: SA, agencyId: AG, name: "Old guide", type: "Guide", description: "", status: "active", tags: [], accessLevel: "Public", includedIn: null, directLink: "https://example.com/g", communitySafeLink: "", landingPageLink: "", checkoutLink: "", linkedProjectId: null, linkedContentId: null, linkedGoalId: null, linkedOfferId: "o1", internalNotes: "" });
  await w(`assets/rForeign`, { subAccountId: SA2, agencyId: AG2, name: "Foreign resource", type: "Guide", directLink: "https://x.test" });
  await w(`affiliateLinks/aLegacy`, { subAccountId: SA, agencyId: AG, programName: "ConvertKit", companyName: "ConvertKit", category: "Software", status: "active", affiliateLink: "https://ck.test/ref", commissionType: "Recurring", commissionAmount: 30, payoutStructure: "Recurring", cookieWindow: "90 days", bestFitAudience: "Creators" });
  await w(`affiliateLinks/aForeign`, { subAccountId: SA2, agencyId: AG2, programName: "Foreign program", affiliateLink: "https://f.test" });
  await w(`offerBundles/bLegacy`, { subAccountId: SA, agencyId: AG, name: "Starter bundle", description: "", assetIds: ["rLegacy"], linkedOfferId: null });
  await w(`offerBundles/bForeign`, { subAccountId: SA2, agencyId: AG2, name: "Foreign bundle", assetIds: [] });
  await w(`subAccounts/${SA}/courseOffers/o1/purchases/pu1`, { status: "paid", amountCents: 12500 });
}

async function main() {
  await seed();
  const mediaRoute = viaDispatcher(await import("../src/app/api/sub-accounts/[id]/media-library/[[...path]]/route"), "");
  const mediaItemRoute = viaDispatcher(await import("../src/app/api/sub-accounts/[id]/media-library/[[...path]]/route"), "[assetId]");
  const mediaUrlRoute = viaDispatcher(await import("../src/app/api/sub-accounts/[id]/media-library/[[...path]]/route"), "[assetId]/url");
  const shareRoute = viaDispatcher(await import("../src/app/api/sub-accounts/[id]/media-library/[[...path]]/route"), "[assetId]/share");
  const resourcesRoute = await import("../src/app/api/sub-accounts/[id]/assets/route");
  const resourceRoute = await import("../src/app/api/sub-accounts/[id]/assets/[assetId]/route");
  const affiliatesRoute = await import("../src/app/api/sub-accounts/[id]/affiliate-links/route");
  const affiliateRoute = await import("../src/app/api/sub-accounts/[id]/affiliate-links/[linkId]/route");
  const bundleRoute = await import("../src/app/api/sub-accounts/[id]/offer-bundles/[bundleId]/route");
  const crmRoute = await import("../src/app/api/sub-accounts/[id]/crm-resources/route");
  const summaryRoute = await import("../src/app/api/sub-accounts/[id]/assets/summary/route");
  const shares = await import("../src/lib/server/assets/media-share-service");
  const courses = await import("../src/lib/server/standalone-course-service");
  const presentation = await import("../src/lib/server/course-lesson-presentation");
  const types = await import("../src/types/assets");

  const saCtx = (id = SA) => ({ params: Promise.resolve({ id }) });
  const aCtx = (assetId: string, id = SA) => ({ params: Promise.resolve({ id, assetId }) });
  const lCtx = (linkId: string, id = SA) => ({ params: Promise.resolve({ id, linkId }) });
  const bCtx = (bundleId: string, id = SA) => ({ params: Promise.resolve({ id, bundleId }) });
  const json = async (r: Response) => (await r.json()) as Record<string, unknown>;
  const list = async (uid = "admin1", query = "") =>
    (await json(await mediaRoute.GET(req(uid, "GET", undefined, `http://test.local/x${query}`), saCtx()))).items as { id: string; kind: string; usage: { kind: string; label: string }[]; share: { url: string } | null }[];

  // ── Media Library: listing + tenant isolation ───────────────────────────
  await check("media list: this sub-account's files only (no __usage doc, no other tenant's video)", async () => {
    const ids = (await list()).map((i) => i.id).sort();
    assert.deepEqual(ids, ["v1", "v2", "v3"]);
    const v1 = (await list()).find((i) => i.id === "v1")!;
    assert.ok(v1.usage.some((u) => u.kind === "course_lesson" && u.label.includes("Video Editing Masterclass")), "course usage reference");
  });
  await check("existing-file picker: ?kind=video&ready=1 lists only ready videos", async () => {
    assert.deepEqual((await list("member2", "?kind=video&ready=1")).map((i) => i.id).sort(), ["v1", "v2"]);
  });
  await check("tenant isolation: another agency's admin can't list, read, open, rename, share or delete this media", async () => {
    assert.equal((await mediaRoute.GET(req("outsider"), saCtx())).status, 403);
    assert.equal((await mediaUrlRoute.GET(req("outsider"), aCtx("v1"))).status, 403);
    assert.equal((await mediaItemRoute.PATCH(req("outsider", "PATCH", { title: "x" }), aCtx("v1"))).status, 403);
    assert.equal((await shareRoute.POST(req("outsider", "POST", {}), aCtx("v2"))).status, 403);
    assert.equal((await mediaItemRoute.DELETE(req("outsider", "DELETE"), aCtx("v2"))).status, 403);
  });
  await check("tenant isolation: a foreign asset id through your own sub-account path reads as missing", async () => {
    assert.equal((await mediaUrlRoute.GET(req("admin1"), aCtx("vX"))).status, 404);
    assert.equal((await mediaItemRoute.GET(req("admin1"), aCtx("vX"))).status, 404);
    assert.equal((await shareRoute.POST(req("admin1", "POST", {}), aCtx("vX"))).status, 404);
    assert.equal((await mediaUrlRoute.GET(req("admin1"), aCtx("__usage"))).status, 404);
    assert.equal((await mediaUrlRoute.GET(req("admin1"), aCtx("a/b"))).status, 404);
  });
  await check("media authorization: a member previews through a 5-minute token-signed Bunny embed", async () => {
    const r = await mediaUrlRoute.GET(req("member2"), aCtx("v2"));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    const b = await json(r);
    const url = new URL(b.url as string);
    assert.equal(url.hostname, "iframe.mediadelivery.net");
    assert.ok(url.pathname.endsWith("/guid-v2"));
    const expires = url.searchParams.get("expires")!;
    assert.equal(url.searchParams.get("token"), createHash("sha256").update(`test-token-key${"guid-v2"}${expires}`).digest("hex"));
    assert.ok(Number(expires) - Date.now() / 1000 <= 301);
    assert.equal((await mediaUrlRoute.GET(req("member2"), aCtx("v3"))).status, 409, "processing video has no playback");
  });

  // ── uploads ──────────────────────────────────────────────────────────────
  let imgId = "";
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
  await check("upload: admin uploads an image → private MediaAsset (tenant access, media-library path, no public token)", async () => {
    const form = new FormData();
    form.append("file", new File([png], "hero-coaching.png", { type: "image/png" }));
    const r = await mediaRoute.POST(req("admin1", "POST", form), saCtx());
    assert.equal(r.status, 201, JSON.stringify(await r.clone().json()));
    imgId = ((await json(r)).item as { id: string }).id;
    const doc = (await db.doc(`subAccounts/${SA}/mediaAssets/${imgId}`).get()).data()!;
    assert.equal(doc.storage.provider, "firebase");
    assert.ok((doc.storage.key as string).startsWith(`media-library/${SA}/${imgId}/`));
    assert.deepEqual(doc.access, { type: "tenant" });
    assert.equal(doc.status, "ready");
    const [meta] = await bucket.file(doc.storage.key).getMetadata();
    assert.equal(meta.metadata?.firebaseStorageDownloadTokens, undefined, "no public download token");
  });
  await check("upload: collaborators can't upload; disallowed types and videos are refused", async () => {
    const f1 = new FormData();
    f1.append("file", new File([png], "x.png", { type: "image/png" }));
    assert.equal((await mediaRoute.POST(req("member2", "POST", f1), saCtx())).status, 403);
    const f2 = new FormData();
    f2.append("file", new File([png], "x.exe", { type: "application/x-msdownload" }));
    assert.equal((await mediaRoute.POST(req("admin1", "POST", f2), saCtx())).status, 400);
    const f3 = new FormData();
    f3.append("file", new File([png], "clip.mp4", { type: "video/mp4" }));
    const r3 = await mediaRoute.POST(req("admin1", "POST", f3), saCtx());
    assert.equal(r3.status, 400);
    assert.match(String((await json(r3)).error), /Bunny/);
  });
  await check("rename + tags: admins only", async () => {
    const r = await mediaItemRoute.PATCH(req("admin1", "PATCH", { title: "Hero", tags: ["Website", "website", "Offers"] }), aCtx(imgId));
    assert.equal(r.status, 200);
    const item = (await json(r)).item as { title: string; tags: string[] };
    assert.equal(item.title, "Hero");
    assert.deepEqual(item.tags, ["Website", "website", "Offers"]);
    assert.equal((await mediaItemRoute.PATCH(req("member2", "PATCH", { title: "x" }), aCtx(imgId))).status, 403);
  });

  // ── Resource Library ─────────────────────────────────────────────────────
  let internalRes = "";
  await check("resources: create external + internal; unsafe links and foreign files are refused", async () => {
    const bad = await resourcesRoute.POST(req("member2", "POST", { name: "x", directLink: "javascript:alert(1)", relatedArea: "Branding", description: "d" }), saCtx());
    assert.equal(bad.status, 400);
    assert.equal((await resourcesRoute.POST(req("member2", "POST", { name: "x", relatedArea: "Branding", description: "d" }), saCtx())).status, 400, "external needs a link");
    const foreign = await resourcesRoute.POST(req("member2", "POST", { name: "x", sourceKind: "internal", mediaAssetId: "vX", relatedArea: "Branding", description: "d" }), saCtx());
    assert.equal(foreign.status, 400);
    const ext = await resourcesRoute.POST(req("member2", "POST", { name: "Brand Messaging Guide", type: "Guide", directLink: "https://docs.google.com/d/1", relatedArea: "Branding", tags: ["brand"], description: "Voice guidelines" }), saCtx());
    assert.equal(ext.status, 201);
    const intr = await resourcesRoute.POST(req("admin1", "POST", { name: "Hero image", type: "Design Asset", sourceKind: "internal", mediaAssetId: imgId, relatedArea: "Branding", description: "Hero" }), saCtx());
    assert.equal(intr.status, 201);
    internalRes = ((await json(intr)).asset as { id: string }).id;
    const d = (await db.doc(`assets/${internalRes}`).get()).data()!;
    assert.equal(d.createdByUid, "admin1");
    assert.equal(d.directLink, "");
  });
  await check("resources: list is this sub-account only, with who updated it and the legacy bundles", async () => {
    const b = await json(await resourcesRoute.GET(req("member2"), saCtx()));
    const names = (b.assets as { name: string; updatedByName: string | null }[]).map((a) => a.name);
    assert.ok(names.includes("Old guide") && !names.includes("Foreign resource"));
    assert.equal((b.assets as { name: string; updatedByName: string | null }[]).find((a) => a.name === "Hero image")!.updatedByName, "Quiana");
    assert.deepEqual((b.legacyBundles as { name: string }[]).map((x) => x.name), ["Starter bundle"]);
  });
  await check("resources: editing/deleting another tenant's resource through your path is 404 and changes nothing", async () => {
    assert.equal((await resourceRoute.PATCH(req("admin1", "PATCH", { name: "pwned" }), aCtx("rForeign"))).status, 404);
    assert.equal((await resourceRoute.DELETE(req("admin1", "DELETE"), aCtx("rForeign"))).status, 404);
    assert.equal((await db.doc("assets/rForeign").get()).data()!.name, "Foreign resource");
    assert.equal((await resourceRoute.PATCH(req("admin1", "PATCH", { name: "x" }), aCtx("does-not-exist"))).status, 404);
    assert.equal((await db.doc("assets/does-not-exist").get()).exists, false, "no record created by an edit");
  });
  await check("resources: legacy fields + relationships survive an edit (offer link, access level)", async () => {
    assert.equal((await resourceRoute.PATCH(req("member2", "PATCH", { name: "Old guide v2", relatedArea: "Launches" }), aCtx("rLegacy"))).status, 200);
    const d = (await db.doc("assets/rLegacy").get()).data()!;
    assert.deepEqual([d.name, d.relatedArea, d.linkedOfferId, d.accessLevel, d.updatedByUid], ["Old guide v2", "Launches", "o1", "Public", "member2"]);
  });

  // ── safe deletion ────────────────────────────────────────────────────────
  await check("safe delete: refused while a course lesson or a resource uses the file", async () => {
    const r1 = await mediaItemRoute.DELETE(req("admin1", "DELETE"), aCtx("v1"));
    assert.equal(r1.status, 409);
    assert.match(String((await json(r1)).error), /Video Editing Masterclass/);
    const r2 = await mediaItemRoute.DELETE(req("admin1", "DELETE"), aCtx(imgId));
    assert.equal(r2.status, 409);
    assert.match(String((await json(r2)).error), /Hero image/);
    assert.equal((await mediaItemRoute.DELETE(req("member2", "DELETE"), aCtx(imgId))).status, 403, "collaborators can't delete");
  });
  await check("safe delete: once unused, the file and its stored object are removed", async () => {
    assert.equal((await resourceRoute.DELETE(req("admin1", "DELETE"), aCtx(internalRes))).status, 200);
    const key = (await db.doc(`subAccounts/${SA}/mediaAssets/${imgId}`).get()).data()!.storage.key;
    assert.equal((await mediaItemRoute.DELETE(req("admin1", "DELETE"), aCtx(imgId))).status, 200);
    const d = (await db.doc(`subAccounts/${SA}/mediaAssets/${imgId}`).get()).data()!;
    assert.equal(d.status, "deleted");
    assert.equal((await bucket.file(key).exists())[0], false);
    assert.equal((await list()).some((i) => i.id === imgId), false);
  });

  // ── existing-file reuse in course lessons ───────────────────────────────
  await check("lesson reuse: a lesson can pick an existing hosted video; the reference is tracked; playback works", async () => {
    const r = await courses.updateStandaloneLessonServerSide({ subAccountId: SA, courseId: "c1", lessonId: "l2", patch: { hostedVideoId: "v2" } as never });
    assert.ok(!r.videoError);
    assert.equal((await db.doc(`subAccounts/${SA}/standaloneCourses/c1/lessons/l2`).get()).data()!.hostedVideoId, "v2");
    const refs = (await db.doc(`subAccounts/${SA}/mediaAssets/v2`).get()).data()!.references as { lessonId: string }[];
    assert.deepEqual(refs.map((x) => x.lessonId), ["l2"]);
    const lesson = { id: "l2", title: "Second lesson", order: 1, sectionId: null, hostedVideoId: "v2" } as never;
    const p = await presentation.presentStandaloneLesson(lesson, { kind: "tenant", agencyId: "", subAccountId: SA });
    assert.match(String(p.embedUrl), /guid-v2\?token=/);
  });
  await check("lesson reuse: another tenant's video id is refused and the lesson keeps its video", async () => {
    const r = await courses.updateStandaloneLessonServerSide({ subAccountId: SA, courseId: "c1", lessonId: "l2", patch: { hostedVideoId: "vX" } as never });
    assert.equal(r.videoError, true);
    assert.equal((await db.doc(`subAccounts/${SA}/standaloneCourses/c1/lessons/l2`).get()).data()!.hostedVideoId, "v2");
  });
  await check("existing course playback unchanged for the original lesson video", async () => {
    const lesson = { id: "l1", title: "Intro", order: 0, sectionId: null, hostedVideoId: "v1" } as never;
    const p = await presentation.presentStandaloneLesson(lesson, { kind: "tenant", agencyId: "", subAccountId: SA });
    assert.match(String(p.embedUrl), /iframe\.mediadelivery\.net\/embed\/lib1\/guid-v1\?token=/);
  });

  // ── replay links ─────────────────────────────────────────────────────────
  let token = "";
  let shareId = "";
  await check("replay: protected by default — no share exists until an admin turns it on", async () => {
    assert.equal((await db.collection("mediaShares").get()).size, 0);
    assert.equal((await list()).find((i) => i.id === "v1")!.share, null);
  });
  await check("replay: only admins, only ready hosted videos", async () => {
    assert.equal((await shareRoute.POST(req("member2", "POST", {}), aCtx("v1"))).status, 403);
    assert.equal((await shareRoute.POST(req("admin1", "POST", {}), aCtx("v3"))).status, 409, "processing");
    assert.equal((await shareRoute.POST(req("admin1", "POST", { expiresAt: "2001-01-01T00:00:00Z" }), aCtx("v1"))).status, 400, "past expiry");
  });
  await check("replay: enabling on ONE lesson video creates a share record + Magnetix link (idempotent)", async () => {
    const r = await shareRoute.POST(req("admin1", "POST", {}), aCtx("v1"));
    assert.equal(r.status, 200);
    const share = (await json(r)).share as { id: string; url: string };
    shareId = share.id;
    assert.match(share.url, /^https:\/\/app\.test\/replay\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    token = share.url.split("/replay/")[1];
    const again = (await json(await shareRoute.POST(req("admin1", "POST", {}), aCtx("v1")))).share as { id: string };
    assert.equal(again.id, shareId, "no second link");
    const doc = (await db.doc(`mediaShares/${shareId}`).get()).data()!;
    assert.deepEqual([doc.subAccountId, doc.mediaAssetId, doc.kind, doc.status, doc.recipient], [SA, "v1", "public_replay", "active", null]);
    assert.equal(JSON.stringify(doc).includes(token.split(".")[1]), false, "the signed token is never stored");
  });
  await check("replay: the public link mints a fresh 5-minute token for that video only — never the course", async () => {
    const r = await shares.resolveReplay(token);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.match(r.embedUrl, /\/embed\/lib1\/guid-v1\?token=[0-9a-f]{64}&expires=\d+$/);
    assert.deepEqual(Object.keys(r).sort(), ["brandName", "embedUrl", "expiresInSeconds", "ok", "title"]);
    // Strip the random token/expiry first — a 64-hex token can contain "c1" by chance.
    const scrubbed = JSON.stringify({ ...r, embedUrl: r.embedUrl.split("?")[0] });
    assert.equal(/\bc1\b|standaloneCourses|lessons/.test(scrubbed), false, "no course reference leaks");
    const course = await db.doc(`subAccounts/${SA}/standaloneCourses/c1`).get();
    assert.equal(course.data()!.published, true, "course untouched");
    await new Promise((res) => setTimeout(res, 150));
    assert.equal((await db.doc(`mediaShares/${shareId}`).get()).data()!.viewCount, 1);
  });
  await check("replay: forged / tampered / unknown tokens are refused", async () => {
    const [id, sig] = token.split(".");
    for (const bad of [`${id}.${sig.slice(0, -2)}xx`, `${id}x.${sig}`, "nope", "", `${id}.${sig}.extra`]) {
      const r = await shares.resolveReplay(bad);
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.reason, "invalid", bad);
    }
    const unknown = shares.shareToken("AAAAAAAAAAAAAAAAAAAAAA");
    const r = await shares.resolveReplay(unknown);
    assert.equal(!r.ok && r.reason, "invalid");
  });
  await check("replay: expiration — set via API, and an expired link issues no token", async () => {
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const r = await shareRoute.POST(req("admin1", "POST", { expiresAt: future }), aCtx("v1"));
    assert.equal(((await json(r)).share as { id: string }).id, shareId, "same link, new expiry");
    assert.ok((await shares.resolveReplay(token)).ok);
    await db.doc(`mediaShares/${shareId}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    const res = await shares.resolveReplay(token);
    assert.equal(!res.ok && res.reason, "expired");
    await db.doc(`mediaShares/${shareId}`).update({ expiresAt: null });
  });
  await check("replay: revocation stops new tokens; re-enabling makes a NEW link and the old one stays dead", async () => {
    assert.equal((await shareRoute.DELETE(req("member2", "DELETE"), aCtx("v1"))).status, 403);
    assert.equal((await shareRoute.DELETE(req("admin1", "DELETE"), aCtx("v1"))).status, 200);
    const res = await shares.resolveReplay(token);
    assert.equal(!res.ok && res.reason, "revoked");
    const again = (await json(await shareRoute.POST(req("admin1", "POST", {}), aCtx("v1")))).share as { id: string; url: string };
    assert.notEqual(again.id, shareId);
    assert.ok((await shares.resolveReplay(again.url.split("/replay/")[1])).ok);
    assert.equal(!(await shares.resolveReplay(token)).ok, true);
  });
  await check("replay: a share whose record points across tenants, or at a deleted video, never plays", async () => {
    await db.doc("mediaShares/crossTenant000000000").set({ agencyId: AG, subAccountId: SA, mediaAssetId: "vX", kind: "public_replay", status: "active", recipient: null, expiresAt: null, createdByUid: "admin1", createdAt: Timestamp.now(), revokedAt: null, revokedByUid: null, viewCount: 0, lastViewedAt: null });
    const r1 = await shares.resolveReplay(shares.shareToken("crossTenant000000000"));
    assert.equal(!r1.ok && r1.reason, "unavailable");
    const s2 = (await json(await shareRoute.POST(req("admin1", "POST", {}), aCtx("v2")))).share as { url: string };
    await db.doc(`subAccounts/${SA}/mediaAssets/v2`).update({ status: "deleted", deletedAt: Timestamp.now() });
    const r2 = await shares.resolveReplay(s2.url.split("/replay/")[1]);
    assert.equal(!r2.ok && r2.reason, "unavailable");
    await db.doc(`subAccounts/${SA}/mediaAssets/v2`).update({ status: "ready", deletedAt: null });
  });
  await check("delete order: when Bunny can't delete, nothing changes — the replay link keeps working", async () => {
    await db.doc(`subAccounts/${SA}/mediaAssets/v9`).set(bunnyVideo(SA, AG, "guid-v9", "ready"));
    const s = (await json(await shareRoute.POST(req("admin1", "POST", {}), aCtx("v9")))).share as { url: string };
    // Bunny isn't configured here, so the provider delete fails.
    const del = await mediaItemRoute.DELETE(req("admin1", "DELETE"), aCtx("v9"));
    assert.equal(del.status, 502);
    assert.match(String((await json(del)).error), /replay links still work/);
    const r = await shares.resolveReplay(s.url.split("/replay/")[1]);
    assert.ok(r.ok, `link still resolves (${!r.ok && r.reason})`);
    const d = (await db.doc(`subAccounts/${SA}/mediaAssets/v9`).get()).data()!;
    assert.equal(d.status, "ready");
    assert.equal(d.deletedAt, null);
    assert.equal(d.bunny.deletionStartedAt, undefined, "in-flight mark cleared");
  });

  // ── Affiliate Library ────────────────────────────────────────────────────
  await check("affiliates: create with commission details; 'Best fit for' is never written", async () => {
    const r = await affiliatesRoute.POST(req("member2", "POST", { programName: "Canva Pro", companyName: "Canva", category: "Software", affiliateLink: "https://canva.test/ref", commissionRecurrence: "recurring", commissionAmount: 30, commissionUnit: "percent", cookieWindow: "30 days", payoutThreshold: 50, bestFitAudience: "should be ignored" }), saCtx());
    assert.equal(r.status, 201);
    const id = ((await json(r)).link as { id: string }).id;
    const d = (await db.doc(`affiliateLinks/${id}`).get()).data()!;
    assert.deepEqual([d.commissionRecurrence, d.commissionUnit, d.payoutThreshold, d.bestFitAudience, d.createdByUid], ["recurring", "percent", 50, "", "member2"]);
    assert.equal(types.affiliatePayoutSummary(d as never), "30% recurring");
    assert.equal((await affiliatesRoute.POST(req("member2", "POST", { programName: "X", affiliateLink: "ftp://x" }), saCtx())).status, 400);
  });
  await check("affiliates: legacy records read correctly and keep their stored 'Best fit for' value", async () => {
    const legacy = (await db.doc("affiliateLinks/aLegacy").get()).data()!;
    assert.equal(types.affiliateRecurrenceOf(legacy as never), "recurring");
    assert.equal(types.affiliatePayoutSummary(legacy as never), "30% recurring");
    assert.equal((await affiliateRoute.PATCH(req("member2", "PATCH", { cookieWindow: "60 days", bestFitAudience: "changed" }), lCtx("aLegacy"))).status, 200);
    const after = (await db.doc("affiliateLinks/aLegacy").get()).data()!;
    assert.deepEqual([after.cookieWindow, after.bestFitAudience], ["60 days", "Creators"]);
  });
  await check("affiliates (security fix): editing/deleting another tenant's program is 404 and never writes", async () => {
    assert.equal((await affiliateRoute.PATCH(req("admin1", "PATCH", { programName: "pwned" }), lCtx("aForeign"))).status, 404);
    assert.equal((await db.doc("affiliateLinks/aForeign").get()).data()!.programName, "Foreign program");
    assert.equal((await affiliateRoute.DELETE(req("admin1", "DELETE"), lCtx("aForeign"))).status, 404);
    assert.ok((await db.doc("affiliateLinks/aForeign").get()).exists);
    assert.equal((await affiliateRoute.PATCH(req("admin1", "PATCH", { programName: "x" }), lCtx("ghost"))).status, 404);
    assert.equal((await db.doc("affiliateLinks/ghost").get()).exists, false, "the old merge-write would have created this");
    assert.equal((await affiliatesRoute.GET(req("outsider"), saCtx())).status, 403);
  });
  await check("offer bundles (security fix): deleting another tenant's bundle is 404; legacy bundles are never auto-deleted", async () => {
    assert.equal((await bundleRoute.DELETE(req("admin1", "DELETE"), bCtx("bForeign"))).status, 404);
    assert.ok((await db.doc("offerBundles/bForeign").get()).exists);
    assert.ok((await db.doc("offerBundles/bLegacy").get()).exists);
  });

  // ── CRM Resources ────────────────────────────────────────────────────────
  await check("CRM resources: every supported module, read live, this tenant only, linked to its source", async () => {
    const b = await json(await crmRoute.GET(req("member2"), saCtx()));
    const items = b.items as { type: string; title: string; href: string; publicUrl: string | null }[];
    const types2 = [...new Set(items.map((i) => i.type))].sort();
    assert.deepEqual(types2, ["booking_page", "community", "course", "form", "offer", "page", "product", "webinar", "website"]);
    assert.equal(items.some((i) => i.title.startsWith("Foreign")), false);
    const byType = Object.fromEntries(items.map((i) => [i.type, i]));
    assert.equal(byType.course.href, "/courses/c1");
    assert.equal(byType.offer.publicUrl, `/offer/${SA}/o1`);
    assert.equal(byType.page.publicUrl, null, "draft page has no public link");
    assert.equal(byType.booking_page.publicUrl, `/b/${SA}/strategy`);
    assert.deepEqual(b.unavailable, []);
    assert.equal((await crmRoute.GET(req("outsider"), saCtx())).status, 403);
  });
  await check("summary tiles: real counts (resources, CRM resources, media files, affiliate programs)", async () => {
    const s = await json(await summaryRoute.GET(req("member2"), saCtx()));
    assert.equal(s.crmResources, 9);
    assert.equal(s.affiliatePrograms, 2);
    assert.equal(s.mediaFiles, 4, "v1, v2, v3, v9 — not __usage, not the deleted image");
  });

  // ── Corrections (2026-09-29): video deletion order ──────────────────────
  const bunnySvc = await import("../src/lib/server/bunny-stream-service");
  const legacyMediaRoute = await import("../src/app/api/media/[...path]/route");
  const realFetch = globalThis.fetch;
  const bunnyCalls: string[] = [];
  let bunnyStatus = 200;
  const withBunny = async (fn: () => Promise<void>) => {
    // Fake Bunny config + a fetch stub that answers ONLY the Bunny API host —
    // no request ever leaves this machine.
    const saved = { lib: process.env.BUNNY_STREAM_LIBRARY_ID, key: process.env.BUNNY_STREAM_API_KEY, cdn: process.env.BUNNY_STREAM_CDN_HOSTNAME };
    process.env.BUNNY_STREAM_LIBRARY_ID = "lib1";
    process.env.BUNNY_STREAM_API_KEY = "stub-key-not-real";
    process.env.BUNNY_STREAM_CDN_HOSTNAME = "stub.b-cdn.test";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input instanceof Request ? input.url : input);
      if (u.startsWith("https://video.bunnycdn.com")) {
        bunnyCalls.push(`${init?.method ?? "GET"} ${u.replace("https://video.bunnycdn.com", "")}`);
        return new Response(bunnyStatus < 300 ? "" : "error", { status: bunnyStatus });
      }
      return realFetch(input as RequestInfo, init);
    }) as typeof fetch;
    try {
      await fn();
    } finally {
      globalThis.fetch = realFetch;
      if (saved.lib === undefined) delete process.env.BUNNY_STREAM_LIBRARY_ID; else process.env.BUNNY_STREAM_LIBRARY_ID = saved.lib;
      if (saved.key === undefined) delete process.env.BUNNY_STREAM_API_KEY; else process.env.BUNNY_STREAM_API_KEY = saved.key;
      if (saved.cdn === undefined) delete process.env.BUNNY_STREAM_CDN_HOSTNAME; else process.env.BUNNY_STREAM_CDN_HOSTNAME = saved.cdn;
      bunnyStatus = 200;
    }
  };
  const tenantScope = { kind: "tenant" as const, agencyId: AG, subAccountId: SA };

  await check("delete order: Bunny error (500) → record, playback and replay link untouched; retry later succeeds", async () => {
    await db.doc(`subAccounts/${SA}/mediaAssets/v10`).set(bunnyVideo(SA, AG, "guid-v10", "ready"));
    const s = (await json(await shareRoute.POST(req("admin1", "POST", {}), aCtx("v10")))).share as { url: string };
    const token = s.url.split("/replay/")[1];
    await withBunny(async () => {
      bunnyStatus = 500;
      bunnyCalls.length = 0;
      assert.equal((await mediaItemRoute.DELETE(req("admin1", "DELETE"), aCtx("v10"))).status, 502);
      assert.deepEqual(bunnyCalls, ["DELETE /library/lib1/videos/guid-v10"]);
      assert.ok((await shares.resolveReplay(token)).ok, "link still works after a failed delete");
      assert.ok(await bunnySvc.getBunnyPlaybackUrl(tenantScope, "v10"), "playback still issued");
      const d = (await db.doc(`subAccounts/${SA}/mediaAssets/v10`).get()).data()!;
      assert.equal(d.status, "ready");
      assert.equal(d.bunny.deletionStartedAt, undefined);
      const share = (await db.collection("mediaShares").where("mediaAssetId", "==", "v10").get()).docs[0].data();
      assert.equal(share.status, "active");

      bunnyStatus = 200;
      bunnyCalls.length = 0;
      assert.equal((await mediaItemRoute.DELETE(req("admin1", "DELETE"), aCtx("v10"))).status, 200);
      assert.deepEqual(bunnyCalls, ["DELETE /library/lib1/videos/guid-v10"], "one provider delete, no duplicate video calls");
    });
    const d = (await db.doc(`subAccounts/${SA}/mediaAssets/v10`).get()).data()!;
    assert.equal(d.status, "deleted");
    assert.equal(d.bunny.lifecycleStatus, "deleted");
    assert.equal(d.bunny.deletionStartedAt, null);
    const r = await shares.resolveReplay(token);
    assert.equal(!r.ok && r.reason, "revoked", "links revoked only after the confirmed delete");
    assert.equal(await bunnySvc.getBunnyPlaybackUrl(tenantScope, "v10"), null, "no new token for a deleted video");
    assert.equal((await mediaUrlRoute.GET(req("admin1"), aCtx("v10"))).status, 404);
  });
  await check("delete order: Bunny says the video is already gone (404) → the record is completed, not left half-deleted", async () => {
    await db.doc(`subAccounts/${SA}/mediaAssets/v11`).set(bunnyVideo(SA, AG, "guid-v11", "ready"));
    await withBunny(async () => {
      bunnyStatus = 404;
      assert.equal((await mediaItemRoute.DELETE(req("admin1", "DELETE"), aCtx("v11"))).status, 200);
    });
    assert.equal((await db.doc(`subAccounts/${SA}/mediaAssets/v11`).get()).data()!.status, "deleted");
  });
  await check("delete in flight: no NEW playback token (replay or course) while Bunny is deleting; a stale mark expires", async () => {
    await db.doc(`subAccounts/${SA}/mediaAssets/v12`).set(bunnyVideo(SA, AG, "guid-v12", "ready"));
    const s = (await json(await shareRoute.POST(req("admin1", "POST", {}), aCtx("v12")))).share as { url: string };
    const token = s.url.split("/replay/")[1];
    await db.doc(`subAccounts/${SA}/mediaAssets/v12`).update({ "bunny.deletionStartedAt": Timestamp.now() });
    assert.equal(await bunnySvc.getBunnyPlaybackUrl(tenantScope, "v12"), null);
    assert.equal((await shares.resolveReplay(token)).ok, false);
    assert.equal((await mediaUrlRoute.GET(req("member2"), aCtx("v12"))).status, 409);
    // A crashed delete (mark older than the guard window) no longer blocks playback.
    await db.doc(`subAccounts/${SA}/mediaAssets/v12`).update({ "bunny.deletionStartedAt": Timestamp.fromMillis(Date.now() - bunnySvc.BUNNY_DELETE_GUARD_MS - 1000) });
    assert.ok(await bunnySvc.getBunnyPlaybackUrl(tenantScope, "v12"));
    assert.ok((await shares.resolveReplay(token)).ok);
  });
  await check("delete dependencies: a lesson or Resource using a video blocks the delete before Bunny is called", async () => {
    await db.doc(`subAccounts/${SA}/mediaAssets/v13`).set(bunnyVideo(SA, AG, "guid-v13", "ready"));
    await db.doc("assets/rVid").set({ subAccountId: SA, agencyId: AG, name: "Replay resource", type: "Video", sourceKind: "internal", mediaAssetId: "v13", status: "active" });
    await withBunny(async () => {
      bunnyCalls.length = 0;
      assert.equal((await mediaItemRoute.DELETE(req("admin1", "DELETE"), aCtx("v1"))).status, 409, "lesson video");
      assert.equal((await mediaItemRoute.DELETE(req("admin1", "DELETE"), aCtx("v13"))).status, 409, "resource video");
      // The course editor's hosted-video DELETE now applies the same checks for sub-account videos.
      const legacy = await legacyMediaRoute.DELETE(
        req("admin1", "DELETE", { ownerScope: tenantScope }),
        { params: Promise.resolve({ path: ["hosted-videos", "v13"] }) }
      );
      assert.equal(legacy.status, 409);
      assert.deepEqual(bunnyCalls, [], "Bunny never called");
    });
    for (const id of ["v1", "v13"]) {
      const d = (await db.doc(`subAccounts/${SA}/mediaAssets/${id}`).get()).data()!;
      assert.equal(d.status, "ready");
      assert.equal(d.bunny.deletionStartedAt, undefined);
    }
    await db.doc("assets/rVid").delete();
  });
  await check("delete authorization: collaborators and other tenants can't delete (via either route)", async () => {
    assert.equal((await mediaItemRoute.DELETE(req("member2", "DELETE"), aCtx("v13"))).status, 403);
    assert.equal((await mediaItemRoute.DELETE(req("outsider", "DELETE"), aCtx("v13"))).status, 403);
    const legacy = await legacyMediaRoute.DELETE(
      req("outsider", "DELETE", { ownerScope: tenantScope }),
      { params: Promise.resolve({ path: ["hosted-videos", "v13"] }) }
    );
    assert.equal(legacy.status, 403);
  });

  // ── Corrections: direct-to-storage uploads (files over the ~4.5 MB server cap) ──
  const uploadsRoute = viaDispatcher(await import("../src/app/api/sub-accounts/[id]/media-library/[[...path]]/route"), "uploads");
  const completeRoute = viaDispatcher(await import("../src/app/api/sub-accounts/[id]/media-library/[[...path]]/route"), "uploads/[intakeId]/complete");
  const intakeSvc = await import("../src/lib/server/assets/media-upload-intake-service");
  const iCtx = (intakeId: string, id = SA) => ({ params: Promise.resolve({ id, intakeId }) });
  const MB = 1024 * 1024;
  const pngBytes = (size: number) => {
    const b = new Uint8Array(size);
    b.set([137, 80, 78, 71, 13, 10, 26, 10]);
    return b;
  };
  const pdfBytes = (size: number) => {
    const b = new Uint8Array(size);
    b.set(Buffer.from("%PDF-1.7\n"));
    return b;
  };
  const start = async (uid: string, body: Record<string, unknown>, sa = SA) => uploadsRoute.POST(req(uid, "POST", body), saCtx(sa));

  await check("upload intake: admins only; type + size validated before anything is written", async () => {
    assert.equal((await start("member2", { filename: "a.pdf", mimeType: "application/pdf", sizeBytes: 10 })).status, 403);
    assert.equal((await start("outsider", { filename: "a.pdf", mimeType: "application/pdf", sizeBytes: 10 })).status, 403);
    assert.equal((await start("admin1", { filename: "a.pdf", mimeType: "application/pdf", sizeBytes: 15 * MB + 1 })).status, 400, "document cap");
    assert.equal((await start("admin1", { filename: "a.png", mimeType: "image/png", sizeBytes: 5 * MB + 1 })).status, 400, "image cap");
    assert.equal((await start("admin1", { filename: "a.exe", mimeType: "application/x-msdownload", sizeBytes: 10 })).status, 400);
    assert.equal((await start("admin1", { filename: "a.mp4", mimeType: "video/mp4", sizeBytes: 10 })).status, 400, "videos use Bunny");
    assert.equal((await start("admin1", { filename: "a.pdf", mimeType: "application/pdf", sizeBytes: 0 })).status, 400);
    const r = await start("admin1", { filename: "Brand Guide.pdf", mimeType: "application/pdf", sizeBytes: 100 });
    assert.equal(r.status, 201);
    const b = await json(r);
    assert.match(String(b.objectKey), /^media-uploads\/admin1\/[^/]+\/[0-9a-f-]+\.pdf$/);
  });

  const admStorage = storageAs("admin1");
  const intake1 = await json(await start("admin1", { filename: "rules.pdf", mimeType: "application/pdf", sizeBytes: 64 }));
  const key1 = String(intake1.objectKey);
  await storageRule("signed-out browser writes an intake object", false, () => cUploadBytes(cRef(storageAs(null), key1), pdfBytes(64), { contentType: "application/pdf" }));
  await storageRule("another person writes into admin1's intake folder", false, () => cUploadBytes(cRef(storageAs("member2"), key1), pdfBytes(64), { contentType: "application/pdf" }));
  await storageRule("disallowed content type", false, () => cUploadBytes(cRef(admStorage, key1), pdfBytes(64), { contentType: "text/html" }));
  await storageRule("over the 15 MB cap", false, () => cUploadBytes(cRef(admStorage, key1), new Uint8Array(15 * MB + 1), { contentType: "application/pdf" }));
  await storageRule("own intake folder, allowed type + size", true, () => cUploadBytes(cRef(admStorage, key1), pdfBytes(64), { contentType: "application/pdf" }));
  await storageRule("overwrite an existing intake object", false, () => cUploadBytes(cRef(admStorage, key1), pdfBytes(64), { contentType: "application/pdf" }));
  await storageRule("read back an intake object", false, () => cGetBytes(cRef(admStorage, key1)));
  await storageRule("read a private Media Library object", false, async () => {
    const d = (await db.collection(`subAccounts/${SA}/mediaAssets`).where("mediaType", "==", "image").limit(1).get()).docs[0];
    return cGetBytes(cRef(admStorage, (d?.data().storage.key as string) ?? `media-library/${SA}/x/y.png`));
  });
  await storageRule("write directly into the private media-library path", false, () => cUploadBytes(cRef(admStorage, `media-library/${SA}/evil/x.pdf`), pdfBytes(64), { contentType: "application/pdf" }));

  let bigDocId = "";
  await check("large document (12 MB, over the app-server cap): browser → Storage resumable upload → private MediaAsset", async () => {
    const size = 12 * MB;
    const intake = await json(await start("admin1", { filename: "Workbook.pdf", mimeType: "application/pdf", sizeBytes: size, title: "Launch Workbook" }));
    await new Promise<void>((resolve, reject) => {
      const t = cUploadResumable(cRef(admStorage, String(intake.objectKey)), pdfBytes(size), { contentType: "application/pdf" });
      t.on("state_changed", undefined, reject, () => resolve());
    });
    const r = await completeRoute.POST(req("admin1", "POST"), iCtx(String(intake.intakeId)));
    assert.equal(r.status, 201, JSON.stringify(await r.clone().json()));
    const item = (await json(r)).item as { id: string; title: string; sizeBytes: number; kind: string; publicUrl: string | null };
    bigDocId = item.id;
    assert.equal(item.title, "Launch Workbook");
    assert.equal(item.sizeBytes, size);
    assert.equal(item.kind, "document");
    assert.equal(item.publicUrl, null);
    const doc = (await db.doc(`subAccounts/${SA}/mediaAssets/${item.id}`).get()).data()!;
    assert.ok((doc.storage.key as string).startsWith(`media-library/${SA}/${item.id}/`));
    assert.deepEqual(doc.access, { type: "tenant" });
    const [meta] = await bucket.file(doc.storage.key).getMetadata();
    assert.equal(meta.metadata?.firebaseStorageDownloadTokens, undefined, "private: no download token");
    assert.equal(Number(meta.size), size);
    assert.equal((await bucket.file(String(intake.objectKey)).exists())[0], false, "intake object removed");
    // Retrying completion returns the same file — no duplicate.
    const again = await json(await completeRoute.POST(req("admin1", "POST"), iCtx(String(intake.intakeId))));
    assert.equal((again.item as { id: string }).id, item.id);
  });
  await check("large image (4.9 MB) uploads directly and passes the image check", async () => {
    const size = Math.floor(4.9 * MB);
    const intake = await json(await start("admin1", { filename: "banner.png", mimeType: "image/png", sizeBytes: size }));
    await cUploadBytes(cRef(admStorage, String(intake.objectKey)), pngBytes(size), { contentType: "image/png" });
    const r = await completeRoute.POST(req("admin1", "POST"), iCtx(String(intake.intakeId)));
    assert.equal(r.status, 201);
    assert.equal(((await json(r)).item as { kind: string }).kind, "image");
  });
  await check("completion refuses: another person / tenant, missing object, size mismatch, fake image, expired intake", async () => {
    const intake = await json(await start("admin1", { filename: "a.pdf", mimeType: "application/pdf", sizeBytes: 64 }));
    const id = String(intake.intakeId);
    assert.equal((await completeRoute.POST(req("member2", "POST"), iCtx(id))).status, 403);
    assert.equal((await completeRoute.POST(req("outsider", "POST"), iCtx(id, SA2))).status, 404, "other tenant's path");
    assert.equal((await completeRoute.POST(req("admin1", "POST"), iCtx(id))).status, 409, "nothing uploaded yet");

    await cUploadBytes(cRef(admStorage, String(intake.objectKey)), pdfBytes(80), { contentType: "application/pdf" });
    const mism = await completeRoute.POST(req("admin1", "POST"), iCtx(id));
    assert.equal(mism.status, 400, "size doesn't match the intake");
    assert.equal((await bucket.file(String(intake.objectKey)).exists())[0], false, "rejected object deleted");
    assert.equal((await completeRoute.POST(req("admin1", "POST"), iCtx(id))).status, 409, "failed intake can't be reused");

    const fake = await json(await start("admin1", { filename: "x.png", mimeType: "image/png", sizeBytes: 64 }));
    await cUploadBytes(cRef(admStorage, String(fake.objectKey)), pdfBytes(64), { contentType: "image/png" });
    const fr = await completeRoute.POST(req("admin1", "POST"), iCtx(String(fake.intakeId)));
    assert.equal(fr.status, 400);
    assert.match(String((await json(fr)).error), /valid image/);

    const old = await json(await start("admin1", { filename: "o.pdf", mimeType: "application/pdf", sizeBytes: 64 }));
    await cUploadBytes(cRef(admStorage, String(old.objectKey)), pdfBytes(64), { contentType: "application/pdf" });
    await db.doc(`${intakeSvc.INTAKE_COLLECTION}/${old.intakeId}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 2 * 60 * 60 * 1000) });
    assert.equal((await completeRoute.POST(req("admin1", "POST"), iCtx(String(old.intakeId)))).status, 410);
    const sweep = await intakeSvc.sweepExpiredUploadIntakes();
    assert.ok(sweep.deleted >= 1);
    assert.equal((await db.doc(`${intakeSvc.INTAKE_COLLECTION}/${old.intakeId}`).get()).exists, false);
    assert.equal((await bucket.file(String(old.objectKey)).exists())[0], false, "abandoned object swept");
  });
  await check("small-file multipart route still works and now rejects a fake image", async () => {
    const f = new FormData();
    f.append("file", new File([pdfBytes(40)], "not-really.png", { type: "image/png" }));
    assert.equal((await mediaRoute.POST(req("admin1", "POST", f), saCtx())).status, 400);
  });

  // ── Corrections: Media Library images reused on public surfaces ──────────
  const publicRoute = viaDispatcher(await import("../src/app/api/sub-accounts/[id]/media-library/[[...path]]/route"), "[assetId]/public-image");
  let pubImgId = "";
  await check("public image: collaborators can't make a private image public; nothing is created", async () => {
    const f = new FormData();
    f.append("file", new File([pngBytes(2048)], "logo.png", { type: "image/png" }));
    pubImgId = ((await json(await mediaRoute.POST(req("admin1", "POST", f), saCtx()))).item as { id: string }).id;
    const r = await publicRoute.POST(req("member2", "POST", {}), aCtx(pubImgId));
    assert.equal(r.status, 403);
    assert.match(String((await json(r)).error), /Ask a sub-account admin/);
    assert.equal((await db.doc(`subAccounts/${SA}/mediaAssets/${pubImgId}`).get()).data()!.publicImage, null);
    const [files] = await bucket.getFiles({ prefix: `media-public/${SA}/${pubImgId}/` });
    assert.equal(files.length, 0);
  });
  let publicUrl = "";
  await check("public image: an admin publishes a separate public copy; the original stays private", async () => {
    const r = await publicRoute.POST(req("admin1", "POST", {}), aCtx(pubImgId));
    assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
    const b = await json(r);
    publicUrl = String(b.url);
    assert.equal(b.created, true);
    const doc = (await db.doc(`subAccounts/${SA}/mediaAssets/${pubImgId}`).get()).data()!;
    assert.ok((doc.publicImage.key as string).startsWith(`media-public/${SA}/${pubImgId}/`));
    assert.notEqual(doc.publicImage.key, doc.storage.key, "separate object");
    assert.deepEqual(doc.access, { type: "tenant" }, "asset access unchanged");
    const [origMeta] = await bucket.file(doc.storage.key).getMetadata();
    assert.equal(origMeta.metadata?.firebaseStorageDownloadTokens, undefined, "original still has no public token");
    const res = await realFetch(publicUrl);
    assert.equal(res.status, 200, "public URL loads without signing in");
    assert.equal(Buffer.from(await res.arrayBuffer()).length, 2048);
  });
  await check("public image: reuse returns the same copy (no duplicates) — for admins and collaborators", async () => {
    const a = await json(await publicRoute.POST(req("admin1", "POST", {}), aCtx(pubImgId)));
    const m = await json(await publicRoute.POST(req("member2", "POST", {}), aCtx(pubImgId)));
    assert.equal(a.url, publicUrl);
    assert.equal(a.created, false);
    assert.equal(m.url, publicUrl);
    const [files] = await bucket.getFiles({ prefix: `media-public/${SA}/${pubImgId}/` });
    assert.equal(files.length, 1);
    const item = (await list()).find((i) => i.id === pubImgId) as unknown as { publicUrl: string; usage: { kind: string }[] };
    assert.equal(item.publicUrl, publicUrl);
    assert.ok(item.usage.some((u) => u.kind === "public_image"));
  });
  await check("public image: documents, videos and foreign or unknown ids can never be made public", async () => {
    assert.equal((await publicRoute.POST(req("admin1", "POST", {}), aCtx(bigDocId))).status, 400, "document");
    assert.equal((await publicRoute.POST(req("admin1", "POST", {}), aCtx("v2"))).status, 400, "video");
    assert.equal((await publicRoute.POST(req("admin1", "POST", {}), aCtx("vX"))).status, 404, "other tenant's asset");
    assert.equal((await publicRoute.POST(req("outsider", "POST", {}), aCtx(pubImgId))).status, 403, "other tenant's admin");
    assert.equal((await db.doc(`subAccounts/${SA}/mediaAssets/${bigDocId}`).get()).data()!.publicImage, null);
  });
  await check("public image: can't delete a published image; turning the link off (admins only) removes only the copy", async () => {
    const del = await mediaItemRoute.DELETE(req("admin1", "DELETE"), aCtx(pubImgId));
    assert.equal(del.status, 409);
    assert.match(String((await json(del)).error), /public link/);
    assert.equal((await publicRoute.DELETE(req("member2", "DELETE"), aCtx(pubImgId))).status, 403);
    assert.equal((await publicRoute.DELETE(req("admin1", "DELETE"), aCtx(pubImgId))).status, 200);
    const doc = (await db.doc(`subAccounts/${SA}/mediaAssets/${pubImgId}`).get()).data()!;
    assert.equal(doc.publicImage, null);
    assert.equal((await bucket.file(doc.storage.key).exists())[0], true, "private original kept");
    const [files] = await bucket.getFiles({ prefix: `media-public/${SA}/${pubImgId}/` });
    assert.equal(files.length, 0);
    assert.equal((await mediaItemRoute.DELETE(req("admin1", "DELETE"), aCtx(pubImgId))).status, 200);
  });

  // ── rules ────────────────────────────────────────────────────────────────
  const browser = clientAs("admin1");
  await rule("browser reads a replay share record", false, () => cGet(cDoc(browser, `mediaShares/${shareId}`)));
  await rule("browser lists replay shares", false, () => cGetDocs(cQuery(cCollection(browser, "mediaShares"), cWhere("subAccountId", "==", SA))));
  await rule("browser reads a MediaAsset directly", false, () => cGet(cDoc(browser, `subAccounts/${SA}/mediaAssets/v1`)));
  await rule("member still reads Resource Library records (existing rule)", true, () => cGetDocs(cQuery(cCollection(browser, "assets"), cWhere("subAccountId", "==", SA))));
  await rule("another agency can't read this tenant's resources", false, () => cGetDocs(cQuery(cCollection(clientAs("outsider", AG2), "assets"), cWhere("subAccountId", "==", SA))));

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

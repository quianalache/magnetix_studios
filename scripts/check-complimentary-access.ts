/**
 * End-to-end entitlement checks for complimentary course / community access
 * from the Contact profile (owner-approved 2026-09-25). EMULATOR ONLY: runs
 * the REAL grant / revoke route handlers, access service, classroom guard
 * and Stripe subscription-cancel handler against the Firestore + Auth
 * emulators with isolated fixtures. Refuses to run unless both emulators
 * are set, the project is `demo-*`, and no production credential is in the
 * environment.
 *
 * Run (the repo's firebase.json has no emulator block, so point at a
 * throwaway config enabling the Auth emulator):
 *   echo '{"firestore":{"rules":"<repo>/firestore.rules"},
 *          "emulators":{"auth":{"port":9099},"firestore":{"port":8080}}}' > /tmp/emu/firebase.json
 *   firebase emulators:exec --config /tmp/emu/firebase.json --only firestore,auth \
 *     --project demo-contacts-access \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx scripts/check-complimentary-access.ts"
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
// No outbound side effects from the code under test (email, queues, AI).
for (const k of ["RESEND_API_KEY", "QSTASH_TOKEN", "QSTASH_URL", "OPENROUTER_API_KEY", "VAPID_PRIVATE_KEY", "STRIPE_SECRET_KEY"]) {
  delete process.env[k];
}

// The app's getAdminDb() reuses the first initialized app — this one has no
// credentials and talks only to the emulators.
initializeApp({ projectId: PROJECT });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
const auth = getAuth();

const AG = "ag1";
const SA = "sa1";
const SA2 = "sa2";
const TS = new Date("2026-09-01T00:00:00Z");

async function seed() {
  const w = (p: string, d: Record<string, unknown>) => db.doc(p).set(d);
  for (const [uid, claims] of [
    ["owner1", { status: "active", agencyId: AG, agencyRole: "owner" }],
    ["admin1", { status: "active", agencyId: AG, agencyRole: null }],
    ["collab1", { status: "active", agencyId: AG, agencyRole: null }],
    ["outsider", { status: "active", agencyId: AG, agencyRole: null }],
    ["otherOwner", { status: "active", agencyId: "ag2", agencyRole: "owner" }],
  ] as const) {
    await auth.createUser({ uid, email: `${uid}@example.test` });
    await auth.setCustomUserClaims(uid, claims);
  }
  await w(`subAccounts/${SA}`, { agencyId: AG, name: "Studio", standaloneCoursesEnabledByAgency: true });
  await w(`subAccounts/${SA2}`, { agencyId: AG, name: "Other studio" });
  await w(`subAccounts/${SA}/subAccountMembers/admin1`, { status: "active", role: "admin", displayName: "Admin One" });
  await w(`subAccounts/${SA}/subAccountMembers/collab1`, { status: "active", role: "collaborator" });
  await w(`subAccounts/${SA2}/subAccountMembers/outsider`, { status: "active", role: "admin" });

  const course = (id: string, sa: string, extra: Record<string, unknown>) =>
    w(`subAccounts/${sa}/standaloneCourses/${id}`, {
      subAccountId: sa, agencyId: AG, title: id, published: true, enrollmentCount: 0,
      linkedCommunityGroupIds: [], createdAt: TS, ...extra,
    });
  await course("paidCourse", SA, { access: "purchase", priceCents: 19900, currency: "USD", linkedCommunityGroupIds: ["linkedGroup"] });
  await course("freeCourse", SA, { access: "open", priceCents: null });
  await course("foreignCourse", SA2, { access: "purchase", priceCents: 5000 });
  await w(`subAccounts/${SA}/communityGroups/paidGroup`, {
    subAccountId: SA, agencyId: AG, name: "Paid Circle", status: "published", access: "paid", memberCount: 0,
  });
  await w(`subAccounts/${SA}/communityGroups/linkedGroup`, {
    subAccountId: SA, agencyId: AG, name: "Course Community", status: "published", access: "free", memberCount: 0,
  });

  const contact = (id: string, sa: string, email: string) =>
    w(`contacts/${id}`, { subAccountId: sa, agencyId: AG, name: id, email, phone: "", tags: [], createdByUid: "owner1" });
  await contact("cNew", SA, "new@example.test"); // no Member yet
  await contact("cBoth", SA, "both@example.test"); // has a Member + a real paid purchase
  await contact("cForeign", SA2, "foreign@example.test");

  await w(`subAccounts/${SA}/members/mBoth`, {
    subAccountId: SA, agencyId: AG, email: "both@example.test", contactId: "cBoth", status: "active", displayName: "Both",
  });
  // A legitimate paid (subscription) purchase + the enrollment it created.
  await w(`subAccounts/${SA}/standaloneCourses/paidCourse/purchases/realPurchase`, {
    subAccountId: SA, agencyId: AG, memberId: "mBoth", status: "paid", amountCents: 19900, currency: "USD",
    method: "stripe", stripeSubscriptionId: "sub_real", requestedAt: TS, paidAt: TS,
  });
  await w(`subAccounts/${SA}/standaloneCourses/paidCourse/enrollments/mBoth`, {
    memberId: "mBoth", courseId: "paidCourse", status: "enrolled", completedLessonIds: ["l1"], progressPct: 50, enrolledAt: TS, completedAt: null,
  });
}

let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  await seed();
  const { POST: grantRoute } = await import("../src/app/api/contacts/[id]/access/grant/route");
  const { POST: revokeRoute } = await import("../src/app/api/contacts/[id]/access/revoke/route");
  const { checkStandaloneCourseEntitlementForMember } = await import("../src/lib/standalone-courses/course-access");
  const { getStandaloneCourse } = await import("../src/lib/server/standalone-course-service");
  const { handleStandaloneCourseSubscriptionDeleted } = await import("../src/lib/server/standalone-course-purchase-service");
  const { getContactAccessSummary } = await import("../src/lib/server/contact-access-service");

  const call = async (route: typeof grantRoute, uid: string, contactId: string, key: string) => {
    const req = new Request("http://test.local/x", {
      method: "POST",
      headers: { "x-user-uid": uid, "x-user-email": `${uid}@example.test`, "content-type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const res = await route(req, { params: Promise.resolve({ id: contactId }) });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const grant = (uid: string, c: string, k: string) => call(grantRoute, uid, c, k);
  const revoke = (uid: string, c: string, k: string) => call(revokeRoute, uid, c, k);
  const memberOf = async (contactId: string) => {
    const s = await db.collection(`subAccounts/${SA}/members`).where("contactId", "==", contactId).get();
    assert.equal(s.size, 1, "exactly one member linked to the contact");
    return s.docs[0].id;
  };
  const entitled = async (courseId: string, memberId: string) =>
    checkStandaloneCourseEntitlementForMember((await getStandaloneCourse(SA, courseId))!, memberId);
  const membership = async (groupId: string, memberId: string) =>
    (await db.doc(`subAccounts/${SA}/communityGroups/${groupId}/memberships/${memberId}`).get()).data();
  const purchaseCount = async (path: string) => (await db.collection(path).get()).size;
  const summaryItem = async (contactId: string, key: string) => {
    const c = (await db.doc(`contacts/${contactId}`).get()).data();
    const s = await getContactAccessSummary({ id: contactId, ...c } as never);
    return s.access.find((a) => a.key === key);
  };

  console.log("Permissions + tenant boundaries");
  await check("collaborator cannot grant (403)", async () => {
    assert.equal((await grant("collab1", "cNew", "course:paidCourse")).status, 403);
  });
  await check("admin of another sub-account cannot grant (403)", async () => {
    assert.equal((await grant("outsider", "cNew", "course:paidCourse")).status, 403);
  });
  await check("another agency's owner cannot grant (403)", async () => {
    assert.equal((await grant("otherOwner", "cNew", "course:paidCourse")).status, 403);
  });
  await check("unauthenticated request is rejected (401)", async () => {
    const req = new Request("http://test.local/x", { method: "POST", body: JSON.stringify({ key: "course:paidCourse" }) });
    assert.equal((await grantRoute(req, { params: Promise.resolve({ id: "cNew" }) })).status, 401);
  });
  await check("a course from another sub-account can't be granted (404)", async () => {
    assert.equal((await grant("admin1", "cNew", "course:foreignCourse")).status, 404);
  });
  await check("collaborator cannot revoke (403)", async () => {
    assert.equal((await revoke("collab1", "cBoth", "course:paidCourse")).status, 403);
  });
  await check("nothing was written by the refused requests", async () => {
    const m = await db.collection(`subAccounts/${SA}/members`).where("contactId", "==", "cNew").get();
    assert.equal(m.size, 0);
  });

  console.log("Complimentary access — paid course");
  await check("admin grants a paid course to a contact with no Member", async () => {
    const r = await grant("admin1", "cNew", "course:paidCourse");
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.status, "granted");
  });
  await check("a Member is created for THAT contact, and the classroom guard admits them", async () => {
    const mid = await memberOf("cNew");
    assert.equal(await entitled("paidCourse", mid), true);
    const e = (await db.doc(`subAccounts/${SA}/standaloneCourses/paidCourse/enrollments/${mid}`).get()).data();
    assert.equal(e?.complimentaryAccess?.status, "active");
    assert.equal(e?.complimentaryAccess?.grantedByUid, "admin1");
  });
  await check("no purchase created, price unchanged", async () => {
    const mid = await memberOf("cNew");
    const mine = await db.collection(`subAccounts/${SA}/standaloneCourses/paidCourse/purchases`).where("memberId", "==", mid).get();
    assert.equal(mine.size, 0);
    assert.equal(await purchaseCount(`subAccounts/${SA}/standaloneCourses/paidCourse/purchases`), 1);
    assert.equal((await getStandaloneCourse(SA, "paidCourse"))?.priceCents, 19900);
  });
  await check("the course's linked community is granted, as with a purchase", async () => {
    const m = await membership("linkedGroup", await memberOf("cNew"));
    assert.equal(m?.status, "active");
    assert.equal(m?.origin, "product");
  });
  await check("shown as complimentary + revocable; a repeat grant is a no-op", async () => {
    const item = await summaryItem("cNew", "course:paidCourse");
    assert.ok(item?.sources.includes("complimentary"));
    assert.equal(item?.revocable, true);
    assert.equal((await grant("admin1", "cNew", "course:paidCourse")).body.status, "already");
  });
  await check("activity row recorded", async () => {
    const a = await db.collection("contacts/cNew/activities").where("type", "==", "course_access_granted").get();
    assert.equal(a.size, 1);
  });

  console.log("Complimentary access — free course");
  await check("free course grant enrolls without a complimentary flag", async () => {
    const r = await grant("owner1", "cNew", "course:freeCourse");
    assert.equal(r.body.status, "granted");
    const mid = await memberOf("cNew");
    assert.equal(await entitled("freeCourse", mid), true);
    const e = (await db.doc(`subAccounts/${SA}/standaloneCourses/freeCourse/enrollments/${mid}`).get()).data();
    assert.equal(e?.complimentaryAccess, undefined);
    assert.equal((await summaryItem("cNew", "course:freeCourse"))?.revocable, false);
  });

  console.log("Complimentary access — paid community");
  await check("paid community grant: active membership, staff source, no purchase", async () => {
    const r = await grant("admin1", "cNew", "community:paidGroup");
    assert.equal(r.body.status, "granted", JSON.stringify(r.body));
    const mid = await memberOf("cNew");
    const m = await membership("paidGroup", mid);
    assert.equal(m?.status, "active");
    assert.equal(m?.origin, "staff");
    const src = await db.doc(`subAccounts/${SA}/communityGroups/paidGroup/memberships/${mid}/accessSources/staff:contact-grant`).get();
    assert.equal(src.data()?.status, "active");
    assert.equal(await purchaseCount(`subAccounts/${SA}/communityGroups/paidGroup/purchases`), 0);
  });
  await check("revoking the community grant removes that membership", async () => {
    const r = await revoke("admin1", "cNew", "community:paidGroup");
    assert.equal(r.status, 200);
    assert.equal((await membership("paidGroup", await memberOf("cNew")))?.status, "removed");
  });

  console.log("Revocation — paid course, no purchase");
  await check("revoke locks the lessons, keeps progress, drops the linked community", async () => {
    const r = await revoke("admin1", "cNew", "course:paidCourse");
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.accessRetained, false);
    const mid = await memberOf("cNew");
    assert.equal(await entitled("paidCourse", mid), false);
    assert.ok((await db.doc(`subAccounts/${SA}/standaloneCourses/paidCourse/enrollments/${mid}`).get()).exists);
    assert.equal((await membership("linkedGroup", mid))?.status, "removed");
    const item = await summaryItem("cNew", "course:paidCourse");
    assert.equal(item?.status, "locked");
    assert.equal(item?.revocable, false);
  });
  await check("revoking again reports there's nothing to revoke (409)", async () => {
    assert.equal((await revoke("admin1", "cNew", "course:paidCourse")).status, 409);
  });
  await check("can be granted again after a revoke", async () => {
    assert.equal((await grant("admin1", "cNew", "course:paidCourse")).body.status, "granted");
    assert.equal(await entitled("paidCourse", await memberOf("cNew")), true);
  });

  console.log("Complimentary + legitimate paid access");
  await check("paid member already has access; a complimentary grant is added on top", async () => {
    assert.equal(await entitled("paidCourse", "mBoth"), true);
    const r = await grant("admin1", "cBoth", "course:paidCourse");
    assert.equal(r.body.status, "granted", JSON.stringify(r.body));
    assert.match(String(r.body.message), /paid access/);
    assert.equal(await purchaseCount(`subAccounts/${SA}/standaloneCourses/paidCourse/purchases`), 1);
  });
  await check("revoking the grant leaves the paid access + linked community intact", async () => {
    const r = await revoke("admin1", "cBoth", "course:paidCourse");
    assert.equal(r.body.accessRetained, true);
    assert.equal(await entitled("paidCourse", "mBoth"), true);
    assert.equal((await membership("linkedGroup", "mBoth"))?.status, "active");
    const p = (await db.doc(`subAccounts/${SA}/standaloneCourses/paidCourse/purchases/realPurchase`).get()).data();
    assert.equal(p?.status, "paid");
    const e = (await db.doc(`subAccounts/${SA}/standaloneCourses/paidCourse/enrollments/mBoth`).get()).data();
    assert.deepEqual(e?.completedLessonIds, ["l1"]);
  });

  console.log("Subscription cancellation with an independent complimentary grant");
  await check("cancellation runs its normal path but the grant keeps access", async () => {
    assert.equal((await grant("admin1", "cBoth", "course:paidCourse")).body.status, "granted");
    await handleStandaloneCourseSubscriptionDeleted({ id: "sub_real", metadata: { subAccountId: SA, courseId: "paidCourse" } } as never);
    const p = (await db.doc(`subAccounts/${SA}/standaloneCourses/paidCourse/purchases/realPurchase`).get()).data();
    assert.equal(p?.status, "canceled"); // existing behaviour preserved
    const e = (await db.doc(`subAccounts/${SA}/standaloneCourses/paidCourse/enrollments/mBoth`).get()).data();
    assert.ok(e?.accessExpiresAt, "existing access-expiry stamp preserved");
    assert.equal(await entitled("paidCourse", "mBoth"), true);
    assert.equal((await membership("linkedGroup", "mBoth"))?.status, "active");
  });
  await check("revoking the grant after cancellation now ends access fully", async () => {
    const r = await revoke("admin1", "cBoth", "course:paidCourse");
    assert.equal(r.body.accessRetained, false);
    assert.equal(await entitled("paidCourse", "mBoth"), false);
    assert.equal((await membership("linkedGroup", "mBoth"))?.status, "removed");
  });
  await check("without a grant, cancellation still ends access exactly as before", async () => {
    // cNew: grant active; simulate a separate member with only a purchase.
    await db.doc(`subAccounts/${SA}/members/mSolo`).set({ subAccountId: SA, agencyId: AG, email: "solo@example.test", contactId: null, status: "active" });
    await db.doc(`subAccounts/${SA}/standaloneCourses/paidCourse/purchases/soloPurchase`).set({
      subAccountId: SA, agencyId: AG, memberId: "mSolo", status: "paid", stripeSubscriptionId: "sub_solo", amountCents: 19900, currency: "USD", method: "stripe",
    });
    await db.doc(`subAccounts/${SA}/standaloneCourses/paidCourse/enrollments/mSolo`).set({ memberId: "mSolo", courseId: "paidCourse", status: "enrolled", completedLessonIds: [], progressPct: 0 });
    assert.equal(await entitled("paidCourse", "mSolo"), true);
    await handleStandaloneCourseSubscriptionDeleted({ id: "sub_solo", metadata: { subAccountId: SA, courseId: "paidCourse" } } as never);
    assert.equal(await entitled("paidCourse", "mSolo"), false);
  });

  console.log(`\n${passed} checks passed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});

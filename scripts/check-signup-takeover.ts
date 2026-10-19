/**
 * Sign-up security regression checks (2026-10-19). EMULATOR ONLY: runs the
 * REAL Offer + course sign-up route handlers, the course sign-in-link
 * verify route, the member -> MyMagnetix bridge, and the member/person
 * session + verification helpers against the Firestore emulator with
 * isolated fixtures. Proves that knowing an existing Member's or person's
 * email address can no longer sign anyone in or change their details.
 * Refuses to run unless the emulator is set, the project is `demo-*`, and
 * no production credential is in the environment.
 *
 * Run:
 *   echo '{"firestore":{"rules":"<repo>/firestore.rules"},
 *          "emulators":{"firestore":{"port":8080}}}' > /tmp/emu/firebase.json
 *   firebase emulators:exec --config /tmp/emu/firebase.json --only firestore \
 *     --project demo-signup-security \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs --require ./scripts/_next-headers-cookie-jar-shim.cjs' AUTOMATIONS_TOKEN_SECRET=test-secret pnpm exec tsx scripts/check-signup-takeover.ts"
 */
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";

const PROJECT = process.env.GCLOUD_PROJECT ?? "";
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !PROJECT.startsWith("demo-") ||
  process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS
) {
  console.error("Refusing to run: Firestore emulator + demo-* project only, no production credentials.");
  process.exit(1);
}
process.env.FIREBASE_ADMIN_PROJECT_ID ??= PROJECT;
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= PROJECT;
process.env.AUTOMATIONS_TOKEN_SECRET ??= "test-secret";
delete process.env.RESEND_API_KEY; // never send email from a test

const jar = (globalThis as unknown as { __testCookieJar: Map<string, string> }).__testCookieJar;
if (!jar) {
  console.error("Load scripts/_next-headers-cookie-jar-shim.cjs via NODE_OPTIONS.");
  process.exit(1);
}

const SA = "sa_signup_sec";
const OFFER = "offer_free";
const COURSE = "course_open";
const MEMBER_COOKIE = "ls_member_session";
const PERSON_COOKIE = "mm_session";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  // Credential-free app for the emulator; the app helper reuses it.
  initializeApp({ projectId: PROJECT });
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const db = getAdminDb();
  const { POST: offerSignup } = await import("../src/app/api/offer/[saId]/[offerId]/signup/route");
  const { POST: courseSignup } = await import("../src/app/api/course/[saId]/[courseId]/signup/route");
  const { GET: courseVerify } = await import("../src/app/api/course/[saId]/login/verify/route");
  const { GET: bridgeFromMember } = await import("../src/app/api/my/bridge-from-member/route");
  const { signMemberSessionToken, signMemberMagicLinkToken } = await import("../src/lib/community/member-auth");
  const { getCurrentMember } = await import("../src/lib/community/member-session");
  const { ensureMember } = await import("../src/lib/community/member-account");
  const { setMemberPassword } = await import("../src/lib/community/member-password");
  const { resolveSignupPerson } = await import("../src/lib/server/signup-person");
  const { getCurrentPerson } = await import("../src/lib/server/person-session");
  const { signPersonSessionToken } = await import("../src/lib/server/person-auth");
  const { establishPersonSessionForEmail } = await import("../src/lib/server/person-password");

  // ── Fixtures ──────────────────────────────────────────────────────────
  await db.doc(`subAccounts/${SA}`).set({
    agencyId: "ag_signup_sec",
    createdByUid: "owner_uid",
    name: "Signup Security Test",
    standaloneCoursesEnabledByAgency: true,
  });
  await db.doc(`subAccounts/${SA}/courseOffers/${OFFER}`).set({
    title: "Free offer",
    visibility: "published",
    type: "free",
    courseIds: [],
  });
  await db.doc(`subAccounts/${SA}/standaloneCourses/${COURSE}`).set({
    title: "Open course",
    published: true,
    access: "open",
  });
  await db.doc("contacts/c_victim").set({
    subAccountId: SA, agencyId: "ag_signup_sec", name: "Victim Name",
    email: "victim@example.com", phone: "+15550001111", address: "1 Real St",
  });
  await db.doc(`subAccounts/${SA}/members/m_victim`).set({
    subAccountId: SA, agencyId: "ag_signup_sec", email: "victim@example.com",
    displayName: "Victim Name", phone: "+15550001111", address: "1 Real St",
    contactId: "c_victim", status: "active", passwordHash: null,
  });
  await db.doc(`subAccounts/${SA}/members/m_other`).set({
    subAccountId: SA, agencyId: "ag_signup_sec", email: "other@example.com",
    displayName: "Other", contactId: null, status: "active",
  });
  await db.doc("contacts/c_sparse").set({
    subAccountId: SA, agencyId: "ag_signup_sec", name: "Sparse", email: "sparse@example.com", phone: "",
  });
  await db.doc(`subAccounts/${SA}/members/m_sparse`).set({
    subAccountId: SA, agencyId: "ag_signup_sec", email: "sparse@example.com",
    displayName: "Sparse", phone: null, contactId: "c_sparse", status: "active",
  });
  await db.doc("contacts/c_lead").set({
    subAccountId: SA, agencyId: "ag_signup_sec", name: "Existing Lead",
    email: "lead@example.com", phone: "+15559990000",
  });
  await db.doc("people/p_victim").set({ primaryEmail: "victim-person@example.com" });

  const offerReq = (body: Record<string, unknown>) =>
    offerSignup(
      new Request(`http://localhost/api/offer/${SA}/${OFFER}/signup`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ saId: SA, offerId: OFFER }) }
    );
  const courseReq = (body: Record<string, unknown>) =>
    courseSignup(
      new Request(`http://localhost/api/course/${SA}/${COURSE}/signup`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ saId: SA, courseId: COURSE }) }
    );
  const memberDoc = async (id: string) => (await db.doc(`subAccounts/${SA}/members/${id}`).get()).data()!;
  const contactDoc = async (id: string) => (await db.doc(`contacts/${id}`).get()).data()!;

  console.log("Sign-up security checks");

  await check("Offer sign-up with an existing member's email signs nobody in", async () => {
    jar.clear();
    const res = await offerReq({ name: "Attacker", email: "Victim@Example.com", phone: "+19998887777" });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.mode, "verify");
    assert.equal(jar.has(MEMBER_COOKIE), false, "no member session cookie may be set");
  });

  await check("…and changes nothing on that Member or its Contact", async () => {
    const m = await memberDoc("m_victim");
    assert.equal(m.displayName, "Victim Name");
    assert.equal(m.phone, "+15550001111");
    assert.equal(m.address, "1 Real St");
    const c = await contactDoc("c_victim");
    assert.equal(c.name, "Victim Name");
    assert.equal(c.phone, "+15550001111");
  });

  await check("Course sign-up with an existing member's email signs nobody in", async () => {
    jar.clear();
    const res = await courseReq({ name: "Attacker", email: "victim@example.com", phone: "+19998887777" });
    assert.equal((await res.json()).mode, "verify");
    assert.equal(jar.has(MEMBER_COOKIE), false);
    assert.equal((await memberDoc("m_victim")).displayName, "Victim Name");
  });

  await check("Signed in as a different member: still refused, session untouched", async () => {
    jar.clear();
    const otherToken = signMemberSessionToken(SA, "m_other", "other@example.com");
    jar.set(MEMBER_COOKIE, otherToken);
    const res = await offerReq({ name: "Attacker", email: "victim@example.com" });
    assert.equal((await res.json()).mode, "verify");
    assert.equal(jar.get(MEMBER_COOKIE), otherToken);
  });

  await check("Signed in as that same member: continues, fills blanks only", async () => {
    jar.clear();
    jar.set(MEMBER_COOKIE, signMemberSessionToken(SA, "m_sparse", "sparse@example.com"));
    const res = await courseReq({ name: "Renamed", email: "sparse@example.com", phone: "+15553334444" });
    const body = await res.json();
    assert.equal(body.mode, "free");
    const m = await memberDoc("m_sparse");
    assert.equal(m.displayName, "Sparse", "nonblank name is never overwritten");
    assert.equal(m.phone, "+15553334444", "blank phone is filled");
    const c = await contactDoc("c_sparse");
    assert.equal(c.name, "Sparse");
    assert.equal(c.phone, "+15553334444");
  });

  let newMemberToken = "";
  let newMemberId = "";
  await check("Brand-new email: instant sign-up still works, Member marked unverified", async () => {
    jar.clear();
    const res = await offerReq({ name: "New Buyer", email: "New.Buyer@example.com" });
    const body = await res.json();
    assert.equal(body.mode, "free");
    newMemberToken = jar.get(MEMBER_COOKIE) ?? "";
    assert.ok(newMemberToken, "session cookie set for the new member");
    const current = await getCurrentMember(SA);
    assert.ok(current);
    newMemberId = current!.id;
    const m = await memberDoc(newMemberId);
    assert.equal(m.email, "new.buyer@example.com");
    assert.equal(m.emailVerified, false);
    assert.equal(m.personId, undefined, "unverified member is not linked to MyMagnetix");
  });

  await check("Unverified sign-up linked to an existing lead's Contact can't see it", async () => {
    jar.clear();
    const res = await offerReq({ name: "Not The Lead", email: "lead@example.com" });
    assert.equal((await res.json()).mode, "free");
    const current = await getCurrentMember(SA);
    assert.ok(current);
    assert.equal(current!.contactId, null, "pre-existing Contact hidden from the session");
    assert.equal(current!.personId, null);
    const stored = await memberDoc(current!.id);
    assert.equal(stored.contactId, "c_lead", "CRM link still recorded");
    assert.equal(stored.contactLinkUnverified, true);
    assert.equal((await contactDoc("c_lead")).name, "Existing Lead", "lead's name unchanged");
  });

  await check("Unverified session cannot set a password", async () => {
    jar.clear();
    jar.set(MEMBER_COOKIE, newMemberToken);
    const member = await getCurrentMember(SA);
    const result = await setMemberPassword({ subAccountId: SA, member: member!, newPassword: "a-strong-password-123" });
    assert.equal(result.ok, false);
    assert.equal((await memberDoc(newMemberId)).passwordHash ?? null, null);
  });

  await check("Unverified member session cannot bridge into MyMagnetix", async () => {
    jar.clear();
    jar.set(MEMBER_COOKIE, newMemberToken);
    const res = await bridgeFromMember(new Request("http://localhost/api/my/bridge-from-member?next=/my"));
    assert.match(res.headers.get("location") ?? "", /\/my\/login\?error=bridge_unavailable/);
    assert.equal(jar.has(PERSON_COOKIE), false);
  });

  await check("Real owner verifying kills the earlier unverified session", async () => {
    await sleep(5);
    await ensureMember({ subAccountId: SA, email: "new.buyer@example.com", emailProof: "proven" });
    const m = await memberDoc(newMemberId);
    assert.equal(m.emailVerified, true);
    assert.equal(typeof m.sessionsValidAfter, "number");
    jar.clear();
    jar.set(MEMBER_COOKIE, newMemberToken);
    assert.equal(await getCurrentMember(SA), null, "old session rejected");
    jar.set(MEMBER_COOKIE, signMemberSessionToken(SA, newMemberId, "new.buyer@example.com"));
    assert.ok(await getCurrentMember(SA), "fresh session after verification works");
  });

  await check("Sign-in link returns to the Offer page and signs in the real owner", async () => {
    jar.clear();
    const token = signMemberMagicLinkToken(SA, "victim@example.com", undefined, undefined, undefined, undefined, `/offer/${SA}/${OFFER}?enroll=1`);
    const res = await courseVerify(
      new Request(`http://localhost/api/course/${SA}/login/verify?token=${encodeURIComponent(token)}`),
      { params: Promise.resolve({ saId: SA }) }
    );
    assert.equal(new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search, `/offer/${SA}/${OFFER}?enroll=1`);
    const current = await getCurrentMember(SA);
    assert.equal(current?.id, "m_victim");
    // …and now that they're signed in, the same sign-up continues.
    const cont = await offerReq({ name: "Victim Name", email: "victim@example.com" });
    assert.equal((await cont.json()).mode, "free");
  });

  await check("Sign-in link never redirects to another business's page", async () => {
    jar.clear();
    const token = signMemberMagicLinkToken(SA, "victim@example.com", undefined, undefined, undefined, undefined, `/offer/other_sa/x?enroll=1`);
    const res = await courseVerify(
      new Request(`http://localhost/api/course/${SA}/login/verify?token=${encodeURIComponent(token)}`),
      { params: Promise.resolve({ saId: SA }) }
    );
    assert.equal(new URL(res.headers.get("location")!).pathname, `/course/${SA}/login`);
  });

  await check("Agency sign-up with an existing person's email signs nobody in", async () => {
    jar.clear();
    const r = await resolveSignupPerson({ email: "victim-person@example.com", origin: "http://localhost", next: "/offer/agency/o?enroll=1" });
    assert.equal(r.kind, "sign-in-required");
    assert.equal(jar.has(PERSON_COOKIE), false);
  });

  await check("Agency sign-up while signed in as that person continues", async () => {
    jar.clear();
    jar.set(PERSON_COOKIE, signPersonSessionToken("p_victim", "victim-person@example.com"));
    const r = await resolveSignupPerson({ email: "victim-person@example.com", origin: "http://localhost", next: "/x" });
    assert.deepEqual(r, { kind: "person", personId: "p_victim" });
  });

  await check("Agency brand-new email: unverified person, killed when the owner verifies", async () => {
    jar.clear();
    const r = await resolveSignupPerson({ email: "fresh-person@example.com", origin: "http://localhost", next: "/x" });
    assert.equal(r.kind, "person");
    const earlyToken = jar.get(PERSON_COOKIE)!;
    const early = await getCurrentPerson();
    assert.equal(early?.emailVerified, false);
    await sleep(5);
    await establishPersonSessionForEmail("fresh-person@example.com");
    jar.set(PERSON_COOKIE, earlyToken);
    assert.equal(await getCurrentPerson(), null, "pre-verification person session rejected");
  });

  console.log(`\n${passed} checks passed.`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);

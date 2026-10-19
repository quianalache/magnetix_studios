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
  const courseVerifyRoute = await import("../src/app/api/course/[saId]/login/verify/route");
  const portalVerifyRoute = await import("../src/app/api/portal/[saId]/_routes/login/verify/route");
  const myVerifyRoute = await import("../src/app/api/my/login/verify/route");
  const { POST: staffSignup } = await import("../src/app/api/auth/signup/route");
  const { redeemMagicLinkOnce } = await import("../src/lib/auth/magic-link-once");
  const { signPersonMagicLinkToken } = await import("../src/lib/server/person-auth");
  const { grantAccessForContact } = await import("../src/lib/server/contact-access-service");
  const { requirePersonFreshSignInIfUnverified } = await import("../src/lib/server/person-identity-service");
  // Opening the emailed link is a GET (continue page); the page POSTs back.
  const courseVerify = (req: Request, ctx: { params: Promise<{ saId: string }> }) =>
    courseVerifyRoute.POST(new Request(req.url, { method: "POST" }), ctx);
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
    createdAt: new Date(),
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
        // A distinct client per call so the per-IP throttle never trips here.
        headers: { "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250)}` },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ saId: SA, offerId: OFFER }) }
    );
  const courseReq = (body: Record<string, unknown>) =>
    courseSignup(
      new Request(`http://localhost/api/course/${SA}/${COURSE}/signup`, {
        method: "POST",
        // A distinct client per call so the per-IP throttle never trips here.
        headers: { "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250)}` },
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
    assert.equal(res.status, 303);
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

  // ── Single-use sign-in links ──────────────────────────────────────────
  const verifyUrl = (base: string, token: string, extra = "") =>
    `http://localhost${base}?token=${encodeURIComponent(token)}${extra}`;

  await check("Opening a sign-in link (GET) only shows the continue page — nothing redeemed", async () => {
    jar.clear();
    await sleep(3);
    const token = signMemberMagicLinkToken(SA, "victim@example.com");
    const res = await courseVerifyRoute.GET();
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/html/);
    const html = await res.text();
    assert.match(html, /<form method="post"/);
    assert.equal(html.includes(token), false, "page never echoes the token");
    assert.equal(jar.has(MEMBER_COOKIE), false);
    // still redeemable afterwards
    const post = await courseVerify(new Request(verifyUrl(`/api/course/${SA}/login/verify`, token)), { params: Promise.resolve({ saId: SA }) });
    assert.equal(post.status, 303);
    assert.equal((await getCurrentMember(SA))?.id, "m_victim");
  });

  await check("Course link: first use signs in, second use is refused", async () => {
    await sleep(3);
    const token = signMemberMagicLinkToken(SA, "victim@example.com", undefined, COURSE);
    const ctx = { params: Promise.resolve({ saId: SA }) };
    jar.clear();
    const first = await courseVerify(new Request(verifyUrl(`/api/course/${SA}/login/verify`, token)), ctx);
    assert.equal(new URL(first.headers.get("location")!).pathname, `/course/${SA}/${COURSE}`);
    assert.ok(jar.has(MEMBER_COOKIE));
    jar.clear();
    const second = await courseVerify(new Request(verifyUrl(`/api/course/${SA}/login/verify`, token)), { params: Promise.resolve({ saId: SA }) });
    assert.equal(second.status, 303);
    assert.match(second.headers.get("location") ?? "", /\/course\/sa_signup_sec\/login\?error=used/);
    assert.equal(jar.has(MEMBER_COOKIE), false, "reused link signs nobody in");
  });

  await check("Portal link: single use", async () => {
    await sleep(3);
    const token = signMemberMagicLinkToken(SA, "victim@example.com");
    const run = () =>
      portalVerifyRoute.POST(new Request(verifyUrl(`/api/portal/${SA}/login/verify`, token), { method: "POST" }), { params: Promise.resolve({ saId: SA }) });
    jar.clear();
    assert.match((await run()).headers.get("location") ?? "", /\/portal\/sa_signup_sec$/);
    jar.clear();
    assert.match((await run()).headers.get("location") ?? "", /error=used/);
    assert.equal(jar.has(MEMBER_COOKIE), false);
  });

  await check("MyMagnetix link: single use, keeps its destination", async () => {
    const token = signPersonMagicLinkToken("victim-person@example.com");
    const run = () =>
      myVerifyRoute.POST(new Request(verifyUrl("/api/my/login/verify", token, "&next=%2Fmy%2Freadings"), { method: "POST" }));
    jar.clear();
    const first = await run();
    assert.equal(new URL(first.headers.get("location")!).pathname, "/my/readings");
    assert.ok(jar.has(PERSON_COOKIE));
    jar.clear();
    assert.match((await run()).headers.get("location") ?? "", /\/my\/login\?error=used/);
    assert.equal(jar.has(PERSON_COOKIE), false);
  });

  await check("Two simultaneous redemptions of one link: exactly one wins", async () => {
    const token = signMemberMagicLinkToken(SA, "race@example.com");
    const results = await Promise.all(Array.from({ length: 5 }, () => redeemMagicLinkOnce(token, Date.now() + 60000)));
    assert.equal(results.filter(Boolean).length, 1);
  });

  // ── Staff invites need the invite link ───────────────────────────────
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    await db.doc("appConfig/main").set({ adminUid: "owner_uid", firstAgencyId: "ag_signup_sec" });
    await db.collection("invites").doc("inv_1").set({
      email: "new-staff@example.com", agencyId: "ag_signup_sec", subAccountId: SA,
      subAccountRole: "admin", agencyRole: null, invitedByUid: "owner_uid",
      acceptedByUid: null, acceptedAt: null, revokedAt: null, assignedTerritoryIds: [], token: "correct-invite-secret",
    });
    const signup = (body: Record<string, unknown>) =>
      staffSignup(new Request("http://localhost/api/auth/signup", { method: "POST", body: JSON.stringify(body) }));

    await check("Staff sign-up with the invited email but no invite link is refused", async () => {
      const res = await signup({ email: "new-staff@example.com", password: "attacker-pass-123" });
      assert.ok(res.status >= 400);
      const inv = (await db.doc("invites/inv_1").get()).data()!;
      assert.equal(inv.acceptedByUid, null, "invite not claimed");
    });

    await check("Staff sign-up with a wrong invite secret is refused", async () => {
      const res = await signup({ email: "new-staff@example.com", password: "attacker-pass-123", inviteToken: "guess" });
      assert.ok(res.status >= 400);
      assert.equal((await db.doc("invites/inv_1").get()).data()!.acceptedByUid, null);
    });

    await check("Staff sign-up with the real invite link succeeds", async () => {
      const res = await signup({ email: "new-staff@example.com", password: "owner-pass-12345", inviteToken: "correct-invite-secret" });
      assert.ok(res.status < 300, `status ${res.status}: ${await res.clone().text()}`);
      assert.ok((await db.doc("invites/inv_1").get()).data()!.acceptedByUid);
    });
  } else {
    console.log("  (skipping staff-invite checks — set FIREBASE_AUTH_EMULATOR_HOST)");
  }

  // ── Grants to unverified identities ───────────────────────────────────
  await check("Granting access to an unverified sign-up kills that sign-up's sessions", async () => {
    jar.clear();
    // An instant sign-up with an existing lead's email (no member yet).
    await db.doc("contacts/c_lead2").set({ subAccountId: SA, agencyId: "ag_signup_sec", name: "Lead Two", email: "lead2@example.com" });
    assert.equal((await (await offerReq({ name: "Impostor", email: "lead2@example.com" })).json()).mode, "free");
    const impostorToken = jar.get(MEMBER_COOKIE)!;
    const impostor = await getCurrentMember(SA);
    assert.ok(impostor);
    await sleep(5);
    const contact = { id: "c_lead2", ...(await contactDoc("c_lead2")) } as unknown as Parameters<typeof grantAccessForContact>[0]["contact"];
    await grantAccessForContact({ contact, key: `course:${COURSE}`, staffUid: "owner_uid" });
    jar.clear();
    jar.set(MEMBER_COOKIE, impostorToken);
    assert.equal(await getCurrentMember(SA), null, "impostor session can't reach the grant");
  });

  await check("Granting agency access to an unverified person kills its sessions", async () => {
    jar.clear();
    const r = await resolveSignupPerson({ email: "fresh-agency@example.com", origin: "http://localhost", next: "/x" });
    assert.equal(r.kind, "person");
    const tok = jar.get(PERSON_COOKIE)!;
    await sleep(5);
    await requirePersonFreshSignInIfUnverified((r as { personId: string }).personId);
    jar.clear();
    jar.set(PERSON_COOKIE, tok);
    assert.equal(await getCurrentPerson(), null);
  });

  await check("Sign-in-required wording never says an account exists", async () => {
    jar.clear();
    const body = await (await offerReq({ name: "X", email: "victim@example.com" })).json();
    assert.equal(body.mode, "verify");
    assert.equal(/already has an account|exists/i.test(body.message), false);
  });

  await check("Per-IP throttle on sign-up", async () => {
    let last = 0;
    for (let i = 0; i < 25; i++) {
      const res = await offerSignup(
        new Request(`http://localhost/api/offer/${SA}/${OFFER}/signup`, { method: "POST", headers: { "x-forwarded-for": "203.0.113.9" }, body: "{}" }),
        { params: Promise.resolve({ saId: SA, offerId: OFFER }) }
      );
      last = res.status;
    }
    assert.equal(last, 429);
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

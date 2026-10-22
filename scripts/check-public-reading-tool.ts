/**
 * Public Reading Tool, Phase 1 — regression checks (2026-10-19). EMULATOR
 * ONLY: drives the REAL submit route, Embed service and Reading pipeline
 * against the Firestore + Auth emulators with isolated fixtures.
 *
 * Run:
 *   echo '{"firestore":{"rules":"<repo>/firestore.rules"},
 *          "emulators":{"auth":{"port":9099},"firestore":{"port":8080}}}' > /tmp/emu/firebase.json
 *   firebase emulators:exec --config /tmp/emu/firebase.json --only firestore,auth \
 *     --project demo-reading-tool \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs --require ./scripts/_next-headers-cookie-jar-shim.cjs --require ./scripts/_swisseph-stub-shim.cjs' AUTOMATIONS_TOKEN_SECRET=test-secret NEXT_PUBLIC_APP_URL=http://localhost:3000 pnpm exec tsx scripts/check-public-reading-tool.ts"
 */
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";

const PROJECT = process.env.GCLOUD_PROJECT ?? "";
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !PROJECT.startsWith("demo-") ||
  process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS
) {
  console.error("Refusing to run: Firestore + Auth emulators, demo-* project only, no production credentials.");
  process.exit(1);
}
delete process.env.RESEND_API_KEY;
delete process.env.QSTASH_TOKEN;

const SA = "sa_prt";
const AG = "ag_prt";
const STAFF_UID = "staff_prt";
const STAFF_EMAIL = "owner@prt.example";
const BIRTH = { birthDate: "1990-05-17", birthTime: "14:30", birthPlace: "Austin, TX, USA", lat: 30.2672, lng: -97.7431, timeZone: "America/Chicago" };

let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  initializeApp({ projectId: PROJECT });
  const { getAdminDb, getAdminAuth } = await import("../src/lib/firebase/admin");
  const db = getAdminDb();
  const { POST: submit } = await import("../src/app/api/decoder/[saId]/submit/route");
  const embeds = await import("../src/lib/energetic-decoder/embeds");
  const svc = await import("../src/lib/server/embed-config-service");
  const { loadVisibleContacts } = await import("../src/lib/server/contacts-query-service");
  const { listReadingsLibrary } = await import("../src/lib/server/readings-library-service");

  // ── Fixtures ──
  await db.doc(`subAccounts/${SA}`).set({ agencyId: AG, name: "Northside Yoga", createdByUid: STAFF_UID });
  await getAdminAuth().createUser({ uid: STAFF_UID, email: STAFF_EMAIL }).catch(() => {});
  await getAdminAuth().setCustomUserClaims(STAFF_UID, { status: "active", agencyRole: "owner", agencyId: AG });
  await db.doc(`users/${STAFF_UID}`).set({ status: "active", email: STAFF_EMAIL });
  await db.doc("contacts/c_returning").set({
    subAccountId: SA, agencyId: AG, name: "Maya Rivera", email: "Maya@Example.com", emailLower: "maya@example.com",
    phone: "", tags: ["vip"], attribution: { utmSource: "original", utmMedium: null, utmCampaign: null, utmContent: null, utmTerm: null, fbclid: null, gclid: null, landingPage: null, referrer: null, referrerSource: null },
  });
  await db.doc("pages/page_prt").set({ subAccountId: SA, name: "Deep Dive", status: "published" });
  await db.doc("pages/page_other").set({ subAccountId: "someone_else", name: "Foreign", status: "published" });

  const live = await svc.createEmbedConfig({ agencyId: AG, subAccountId: SA, name: "Free Blueprint" });
  await svc.updateEmbedConfig(SA, live.id, {
    status: "live",
    contact: { tags: ["Blueprint 2026"] },
    form: { phone: "optional" },
  });
  const draft = await svc.createEmbedConfig({ agencyId: AG, subAccountId: SA, name: "Draft one" });

  let ipN = 1;
  const post = (body: Record<string, unknown>, staff = false) =>
    submit(
      new Request(`http://localhost/api/decoder/${SA}/submit`, {
        method: "POST",
        headers: {
          "x-forwarded-for": `198.51.100.${ipN++}`,
          ...(staff ? { "x-user-uid": STAFF_UID, "x-user-email": STAFF_EMAIL } : {}),
        },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ saId: SA }) },
    );
  const count = async (col: string) => (await db.collection(col).where("subAccountId", "==", SA).get()).size;

  console.log("Public Reading Tool checks");

  await check("Pure rules: confirmation-only needs MyMagnetix or email", async () => {
    const s = embeds.defaultEmbedSettings();
    s.afterSubmit.show = "confirmation";
    s.afterSubmit.myMagnetix = false;
    s.afterSubmit.email = false;
    assert.match(embeds.embedCombinationError(s) ?? "", /Confirmation only/);
    s.afterSubmit.email = true;
    assert.equal(embeds.embedCombinationError(s), null);
  });

  await check("Pure rules: going live with an invalid combination is refused", async () => {
    const res = await svc
      .updateEmbedConfig(SA, draft.id, { status: "live", reading: { views: [] } })
      .then(() => "ok")
      .catch((e: Error) => e.message);
    assert.match(res, /at least one chart/);
  });

  await check("Draft Embed: public submission fails closed (404)", async () => {
    const res = await post({ embedId: draft.id, name: "X", email: "x@example.com", ...BIRTH });
    assert.equal(res.status, 404);
  });

  await check("Preview without a staff session: 404, nothing written", async () => {
    const before = await count("energeticDecoderReadings");
    const res = await post({ embedId: draft.id, mode: "preview", name: "X", email: "x@example.com", ...BIRTH });
    assert.equal(res.status, 404);
    assert.equal(await count("energeticDecoderReadings"), before);
  });

  await check("Preview (staff, Draft Embed): real calculation, zero writes", async () => {
    const [readings, contacts, profiles] = [await count("energeticDecoderReadings"), await count("contacts"), await count("energeticProfiles")];
    const res = await post({ embedId: draft.id, mode: "preview", name: "Preview Person", ...BIRTH }, true);
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.reading.id, "preview");
    assert.ok(body.reading.humanDesign?.type, "Human Design calculated");
    assert.equal(await count("energeticDecoderReadings"), readings);
    assert.equal(await count("contacts"), contacts);
    assert.equal(await count("energeticProfiles"), profiles);
    assert.equal((await svc.getEmbedConfig(SA, draft.id))!.stats.readings, 0);
  });

  let firstReadingId = "";
  await check("New visitor: Contact + Profile + Reading, tags, attribution, placement, counts", async () => {
    const res = await post({
      embedId: live.id,
      name: "Noor Ahmed",
      email: "Noor@Example.com",
      phone: "+15550001111",
      ...BIRTH,
      placement: { kind: "page", pageId: "page_prt" },
      attribution: { utmSource: "instagram", utmCampaign: "spring" },
    });
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    firstReadingId = body.reading.id;
    const reading = (await db.doc(`energeticDecoderReadings/${firstReadingId}`).get()).data()!;
    assert.equal(reading.embed.id, live.id);
    assert.deepEqual(reading.placement, { kind: "page", pageId: "page_prt" });
    assert.equal(reading.attribution.utmSource, "instagram");
    const contact = (await db.doc(`contacts/${reading.contactId}`).get()).data()!;
    assert.equal(contact.emailLower, "noor@example.com");
    assert.equal(contact.phone, "+15550001111");
    assert.ok(contact.tags.includes("energetic-decoder") && contact.tags.includes("blueprint-2026"));
    assert.equal(contact.attribution.utmCampaign, "spring");
    const activities = await db.collection(`contacts/${reading.contactId}/activities`).where("type", "==", "reading_created").get();
    assert.equal(activities.size, 1);
    const stats = (await svc.getEmbedConfig(SA, live.id))!.stats;
    assert.equal(stats.readings, 1);
    assert.equal(stats.contacts, 1);
    assert.ok(reading.personId, "linked to MyMagnetix");
  });

  await check("A foreign page id is never recorded as the placement", async () => {
    const res = await post({ embedId: live.id, name: "Z", email: "z@example.com", ...BIRTH, placement: { kind: "page", pageId: "page_other" } });
    const body = await res.json();
    const reading = (await db.doc(`energeticDecoderReadings/${body.reading.id}`).get()).data()!;
    assert.deepEqual(reading.placement, { kind: "direct" });
  });

  await check("Returning Contact (different case): matched, nothing overwritten, blanks filled, tags added", async () => {
    const res = await post({
      embedId: live.id,
      name: "Somebody Else",
      email: "MAYA@example.COM",
      phone: "+15559998888",
      ...BIRTH,
      attribution: { utmSource: "newsource" },
    });
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    const reading = (await db.doc(`energeticDecoderReadings/${body.reading.id}`).get()).data()!;
    assert.equal(reading.contactId, "c_returning", "no duplicate Contact");
    const c = (await db.doc("contacts/c_returning").get()).data()!;
    assert.equal(c.name, "Maya Rivera", "name never overwritten");
    assert.equal(c.email, "Maya@Example.com", "email never overwritten");
    assert.equal(c.phone, "+15559998888", "blank phone filled");
    assert.ok(c.tags.includes("vip") && c.tags.includes("blueprint-2026"), "tags only added");
    assert.equal(c.attribution.utmSource, "original", "first-touch attribution kept");
    const profile = (await db.doc(`energeticProfiles/${reading.profileId}`).get()).data()!;
    assert.equal(profile.name, "Somebody Else", "the typed name names the Profile");
    assert.ok(reading.personId, "returning Contact's Reading linked to MyMagnetix");
    assert.equal((await svc.getEmbedConfig(SA, live.id))!.stats.contacts, 2, "a returning Contact isn't counted as new");
  });

  await check("Same person + same birth data again: Profile reused, new Reading", async () => {
    const res = await post({ embedId: live.id, name: "Somebody Else", email: "maya@example.com", ...BIRTH });
    const body = await res.json();
    const r = (await db.doc(`energeticDecoderReadings/${body.reading.id}`).get()).data()!;
    const readingsForProfile = await db.collection("energeticDecoderReadings").where("profileId", "==", r.profileId).get();
    assert.equal(readingsForProfile.size, 2);
  });

  await check("Email note is truthful: never 'sent' when the email didn't go out", async () => {
    // Email isn't configured in the emulator run (RESEND_API_KEY removed above),
    // so an Embed with email on must report "notSent", never "sent".
    const res = await post({ embedId: live.id, name: "Mail Check", email: "mail@example.com", ...BIRTH });
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.email, "notSent");
    const off = await svc.createEmbedConfig({ agencyId: AG, subAccountId: SA, name: "No email" });
    await svc.updateEmbedConfig(SA, off.id, { status: "live", afterSubmit: { email: false } });
    const res2 = await post({ embedId: off.id, name: "Mail Off", email: "mailoff@example.com", ...BIRTH });
    assert.equal((await res2.json()).email, "off");
    const prev = await post({ embedId: off.id, mode: "preview", name: "P", ...BIRTH }, true);
    assert.equal((await prev.json()).email, "preview");
  });

  await check("Consent (agreement): required, recorded on the Reading, marketing consent untouched", async () => {
    const agree = await svc.createEmbedConfig({ agencyId: AG, subAccountId: SA, name: "Agreement" });
    await svc.updateEmbedConfig(SA, agree.id, { status: "live", form: { consent: { enabled: true, text: "I agree to the terms.", purpose: "agreement" } } });
    const refused = await post({ embedId: agree.id, name: "No Tick", email: "notick@example.com", ...BIRTH });
    assert.equal(refused.status, 400);
    const res = await post({
      embedId: agree.id, name: "Ticked", email: "ticked@example.com", consent: true, ...BIRTH,
      attribution: { landingPage: "https://studio.example/free" },
    });
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    const r = (await db.doc(`energeticDecoderReadings/${body.reading.id}`).get()).data()!;
    assert.equal(r.consent.given, true);
    assert.equal(r.consent.textShown, "I agree to the terms.");
    assert.equal(r.consent.purpose, "agreement");
    assert.equal(r.consent.embedId, agree.id);
    assert.equal(r.consent.sourceUrl, "https://studio.example/free");
    assert.ok(Date.parse(r.consent.consentedAt) > 0);
    const c = (await db.doc(`contacts/${r.contactId}`).get()).data()!;
    assert.equal(c.emailConsent ?? null, null, "an agreement never becomes marketing permission");
  });

  await check("Consent (marketing permission): Contact's email consent written like a Form", async () => {
    const mkt = await svc.createEmbedConfig({ agencyId: AG, subAccountId: SA, name: "Newsletter" });
    await svc.updateEmbedConfig(SA, mkt.id, { status: "live", form: { consent: { enabled: true, text: "Send me your newsletter.", purpose: "emailMarketing" } } });
    await db.doc("contacts/c_unsub").set({
      subAccountId: SA, agencyId: AG, name: "Ola", email: "ola@example.com", emailLower: "ola@example.com",
      phone: "", tags: [], emailOptedOut: true, emailConsent: { status: "unsubscribed" },
    });
    const res = await post({ embedId: mkt.id, name: "Ola", email: "ola@example.com", consent: true, ...BIRTH });
    assert.equal(res.status, 200);
    const c = (await db.doc("contacts/c_unsub").get()).data()!;
    assert.equal(c.emailOptedOut, false, "explicit fresh opt-in, same as a Form's email-consent box");
    assert.equal(c.emailConsent.status, "consented");
    assert.equal(c.emailConsent.source, `embed:${mkt.id}`);
    assert.equal(c.emailConsent.textShown, "Send me your newsletter.");
    assert.match(c.emailConsent.ip, /^198\.51\.100\./);
    assert.equal(c.name, "Ola", "nothing else on the Contact changes");
  });

  await check("Reading created: fires for a returning Contact who already has every tag", async () => {
    await db.doc("workflows/wf_reading").set({
      subAccountId: SA, agencyId: AG, createdByUid: STAFF_UID, name: "Follow up", status: "active",
      trigger: { type: "reading.created", filters: { all: [] }, embedId: live.id },
      startNodeId: "n1", nodes: { n1: { id: "n1", type: "goal", config: {} } }, stats: { enrolled: 0, completed: 0 },
    });
    // c_returning already carries every tag this Embed adds (from the earlier submission).
    const runs = async () => (await db.collection("workflowRuns").where("workflowId", "==", "wf_reading").get()).docs;
    const before = (await runs()).length;
    const res = await post({ embedId: live.id, name: "Maya Again", email: "maya@example.com", ...BIRTH });
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    const after = await runs();
    assert.equal(after.length, before + 1, "one run for this Reading");
    const run = after.find((d) => d.get("context")?.readingId === body.reading.id);
    assert.ok(run, "run carries the Reading");
    assert.equal(run!.get("contactId"), "c_returning");
    // A different Embed doesn't match an Embed-specific workflow; a Test run never fires it.
    const other = await svc.createEmbedConfig({ agencyId: AG, subAccountId: SA, name: "Other" });
    await svc.updateEmbedConfig(SA, other.id, { status: "live" });
    await post({ embedId: other.id, name: "Maya", email: "maya@example.com", ...BIRTH });
    await post({ embedId: live.id, mode: "test", name: "T", ...BIRTH }, true);
    assert.equal((await runs()).length, before + 1);
  });

  await check("Content Set per Embed: filled text replaces Default, blanks keep Default", async () => {
    const setRef = db.collection("energeticDecoderContentSets").doc("set_custom");
    await setRef.set({ subAccountId: SA, agencyId: AG, name: "Custom", description: "", status: "active", scope: "sub_account", origin: { kind: "blank", sourceSetId: null } });
    const firstType = ((await db.doc(`energeticDecoderReadings/${firstReadingId}`).get()).data()!.humanDesign.type) as string;
    await setRef.collection("entries").doc(`hd:type:${firstType}`).set({ label: null, fields: { strategy: "", description: "CUSTOM TYPE TEXT" } });
    await svc.updateEmbedConfig(SA, live.id, { reading: { contentSetId: "set_custom" } });
    const res = await post({ embedId: live.id, name: "Noor Ahmed", email: "noor@example.com", ...BIRTH });
    const body = await res.json();
    const r = (await db.doc(`energeticDecoderReadings/${body.reading.id}`).get()).data()!;
    assert.equal(r.contentSetId, "set_custom");
    assert.equal(r.humanDesign.content.typeDescription, "CUSTOM TYPE TEXT");
    const before = (await db.doc(`energeticDecoderReadings/${firstReadingId}`).get()).data()!;
    assert.equal(r.humanDesign.content.typeStrategy, before.humanDesign.content.typeStrategy, "blank field keeps Default's text");
    assert.notEqual(before.humanDesign.content.typeDescription, "CUSTOM TYPE TEXT", "older Readings unchanged");
    await svc.updateEmbedConfig(SA, live.id, { reading: { contentSetId: "default" } });
  });

  await check("Test run: hidden test Contact + test Reading, no counts, staff email only", async () => {
    const statsBefore = (await svc.getEmbedConfig(SA, live.id))!.stats.readings;
    const res = await post({ embedId: live.id, mode: "test", name: "Test Person", email: "visitor@example.com", ...BIRTH }, true);
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    const r = (await db.doc(`energeticDecoderReadings/${body.reading.id}`).get()).data()!;
    assert.equal(r.test, true);
    const c = (await db.doc(`contacts/${r.contactId}`).get()).data()!;
    assert.equal(c.testRecord, true);
    assert.equal(c.email, STAFF_EMAIL, "Test never uses a visitor's email");
    assert.equal((await svc.getEmbedConfig(SA, live.id))!.stats.readings, statsBefore);
    const visible = await loadVisibleContacts({ subAccountId: SA, territoryIds: null, fresh: true });
    assert.ok(!visible.some((v) => v.id === r.contactId), "hidden from Contacts");
    const lib = await listReadingsLibrary(SA, {});
    assert.ok(!lib.rows.some((row) => row.latestReadingId === body.reading.id), "hidden from Readings");
  });

  await check("Test cleanup removes only test records", async () => {
    const liveCount = (await db.collection("energeticDecoderReadings").where("subAccountId", "==", SA).get()).docs.filter((d) => d.get("test") !== true).length;
    const removed = await svc.cleanupEmbedTestRecords(SA, live.id);
    assert.ok(removed.readings >= 1 && removed.contacts >= 1);
    const after = await db.collection("energeticDecoderReadings").where("subAccountId", "==", SA).get();
    assert.equal(after.docs.filter((d) => d.get("test") === true).length, 0);
    assert.equal(after.size, liveCount);
  });

  await check("Deleting a QA Embed also removes its Test records", async () => {
    const qa = await svc.createEmbedConfig({ agencyId: AG, subAccountId: SA, name: "QA · staff test" });
    const res = await post({ embedId: qa.id, mode: "test", name: "QA Run", ...BIRTH }, true);
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    await svc.deleteEmbedConfig(SA, qa.id);
    assert.equal((await db.doc(`energeticDecoderReadings/${body.reading.id}`).get()).exists, false);
    assert.equal(await svc.getEmbedConfig(SA, qa.id), null);
  });

  // ── Reading result pass, access, Result Pages (2026-10-21) ──
  const jar = (globalThis as unknown as { __testCookieJar: Map<string, string> }).__testCookieJar;
  const setHeaders = (h: Record<string, string> | null) => {
    (globalThis as unknown as { __testHeaders?: Headers }).__testHeaders = h ? new Headers(h) : undefined;
  };
  const passLib = await import("../src/lib/server/reading-result-pass");
  const access = await import("../src/lib/server/reading-access");
  const result = await import("../src/app/api/decoder/[saId]/result/route");
  const personAuth = await import("../src/lib/server/person-auth");

  let passReadingId = "";
  let passToken = "";
  await check("Standard Result submission: pass-carrying links, no bearer Report link while MyMagnetix is on", async () => {
    const res = await post({ embedId: live.id, name: "Pass Person", email: "pass@example.com", ...BIRTH });
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    passReadingId = body.reading.id;
    passToken = body.pass;
    const v = passLib.verifyReadingResultPass(passToken);
    assert.ok(v && v.readingId === passReadingId && v.subAccountId === SA && v.pageId === null);
    assert.equal(body.links.report, null, "MyMagnetix is the home — no Reading Report button");
    assert.match(body.links.pdf, new RegExp(`^/api/decoder/${SA}/result\\?pass=.+&to=pdf$`));
    assert.equal(body.links.myMagnetixAction, `/api/decoder/${SA}/result`);
    assert.ok(body.myMagnetix.openUrl.endsWith(`/my/readings/${passReadingId}`));
    assert.match(body.myMagnetix.maskedEmail, /^p•••@example\.com$/);
    assert.equal(body.redirect, null);
    assert.ok(!JSON.stringify(body.links).includes(`/report/${passReadingId}"`), "no bare Reading link");
  });

  await check("MyMagnetix off: the Reading Report button appears, carrying the pass", async () => {
    const noMm = await svc.createEmbedConfig({ agencyId: AG, subAccountId: SA, name: "No MyMagnetix" });
    await svc.updateEmbedConfig(SA, noMm.id, { status: "live", afterSubmit: { myMagnetix: false, email: true } });
    const res = await post({ embedId: noMm.id, name: "Report Person", email: "report@example.com", ...BIRTH });
    const body = await res.json();
    assert.match(body.links.report, /\/result\?pass=.+&to=report$/);
    assert.equal(body.links.myMagnetixAction, null);
    assert.equal(body.myMagnetix, null);
  });

  await check("Reading access: nothing without a pass, MyMagnetix owner or staff", async () => {
    jar.clear();
    setHeaders(null);
    const { getReadingById } = await import("../src/lib/server/energetic-decoder-service");
    const reading = (await getReadingById(SA, passReadingId))!;
    assert.equal(await access.authorizeReadingAccess(SA, reading), null, "a Reading id alone opens nothing");
  });

  await check("Reading access: the right pass cookie opens exactly that Reading", async () => {
    const { getReadingById } = await import("../src/lib/server/energetic-decoder-service");
    const reading = (await getReadingById(SA, passReadingId))!;
    const other = (await getReadingById(SA, firstReadingId))!;
    jar.set(passLib.readingPassCookieName(passReadingId), passToken);
    assert.equal((await access.authorizeReadingAccess(SA, reading))?.kind, "pass");
    // The same pass copied under another Reading's cookie name opens nothing.
    jar.set(passLib.readingPassCookieName(firstReadingId), passToken);
    assert.equal(await access.authorizeReadingAccess(SA, other), null, "pass for Reading A never opens Reading B");
    // Wrong business.
    assert.equal(await access.authorizeReadingAccess("sa_elsewhere", reading), null);
    jar.clear();
  });

  await check("Reading access: an expired pass opens nothing", async () => {
    const { getReadingById } = await import("../src/lib/server/energetic-decoder-service");
    const reading = (await getReadingById(SA, passReadingId))!;
    const old = passLib.mintReadingResultPass({ readingId: passReadingId, subAccountId: SA, issuedAt: Date.now() - 25 * 60 * 60 * 1000 });
    jar.set(passLib.readingPassCookieName(passReadingId), old);
    assert.equal(await access.authorizeReadingAccess(SA, reading), null);
    jar.clear();
  });

  await check("Reading access: MyMagnetix owner by verified Contact email; someone else is refused", async () => {
    const { getReadingById } = await import("../src/lib/server/energetic-decoder-service");
    const reading = (await getReadingById(SA, passReadingId))!;
    const owner = await db.collection("people").add({ primaryEmail: "pass@example.com", emailVerified: true });
    jar.set("mm_session", personAuth.signPersonSessionToken(owner.id, "pass@example.com"));
    assert.equal((await access.authorizeReadingAccess(SA, reading))?.kind, "owner");
    const stranger = await db.collection("people").add({ primaryEmail: "stranger@example.com", emailVerified: true });
    jar.set("mm_session", personAuth.signPersonSessionToken(stranger.id, "stranger@example.com"));
    assert.equal(await access.authorizeReadingAccess(SA, reading), null, "another person never sees it");
    const unverified = await db.collection("people").add({ primaryEmail: "pass@example.com", emailVerified: false });
    jar.set("mm_session", personAuth.signPersonSessionToken(unverified.id, "pass@example.com"));
    assert.equal(await access.authorizeReadingAccess(SA, reading), null, "an unproven email never sees it");
    jar.clear();
  });

  await check("Reading access: staff of this business", async () => {
    const { getReadingById } = await import("../src/lib/server/energetic-decoder-service");
    const reading = (await getReadingById(SA, passReadingId))!;
    setHeaders({ "x-user-uid": STAFF_UID, "x-user-email": STAFF_EMAIL });
    assert.equal((await access.authorizeReadingAccess(SA, reading))?.kind, "staff");
    setHeaders(null);
  });

  await check("Pass exchange: cookie set on this host, redirect to the clean Reading Report URL", async () => {
    jar.clear();
    const res = await result.GET(new Request(`http://localhost/api/decoder/${SA}/result?pass=${encodeURIComponent(passToken)}&to=report`), { params: Promise.resolve({ saId: SA }) });
    assert.equal(res.status, 303);
    assert.equal(new URL(res.headers.get("location")!).pathname, `/decoder/${SA}/report/${passReadingId}`);
    assert.ok(!res.headers.get("location")!.includes("pass="), "the clean URL carries no pass");
    assert.equal(jar.get(passLib.readingPassCookieName(passReadingId)), passToken);
  });

  await check("Pass exchange: forged / other-business passes go to MyMagnetix, set nothing", async () => {
    jar.clear();
    const forged = `${passToken.split(".")[0]}.AAAA`;
    const res = await result.GET(new Request(`http://localhost/api/decoder/${SA}/result?pass=${encodeURIComponent(forged)}&to=report`), { params: Promise.resolve({ saId: SA }) });
    assert.equal(new URL(res.headers.get("location")!).pathname, "/my/readings");
    const res2 = await result.GET(new Request(`http://localhost/api/decoder/sa_elsewhere/result?pass=${encodeURIComponent(passToken)}&to=report`), { params: Promise.resolve({ saId: "sa_elsewhere" }) });
    assert.equal(new URL(res2.headers.get("location")!).pathname, "/my/readings");
    assert.equal(jar.size, 0);
  });

  await check("MyMagnetix button: needs the pass; never signs anyone in", async () => {
    jar.clear();
    const call = (body: Record<string, unknown>) =>
      result.POST(new Request(`http://localhost/api/decoder/${SA}/result`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ saId: SA }) });
    assert.equal((await call({ readingId: passReadingId })).status, 403, "no pass, no email");
    const other = passLib.mintReadingResultPass({ readingId: firstReadingId, subAccountId: SA });
    assert.equal((await call({ readingId: passReadingId, pass: other })).status, 403, "another Reading's pass doesn't work");
    const res = await call({ readingId: passReadingId, pass: passToken });
    // Email isn't configured in the emulator — the send is honestly refused.
    assert.equal(res.status, 503);
    assert.equal(jar.has("mm_session"), false, "submitting/clicking never creates a MyMagnetix session");
  });

  await check("Custom Result Page: unpublished page can't go live; publish → whole-tab redirect with a page-bound pass", async () => {
    await db.doc("pages/rr_page").set({ subAccountId: SA, agencyId: AG, name: "My Result", pageType: "reading_result", status: "draft", puckDraftData: { root: { props: {} }, content: [] } });
    await db.doc("pages/plain_page").set({ subAccountId: SA, agencyId: AG, name: "Plain", pageType: "landing", status: "published", puckPublishedData: { root: { props: {} }, content: [] } });
    await db.doc("pages/foreign_rr").set({ subAccountId: "someone_else", agencyId: "x", name: "Foreign", pageType: "reading_result", status: "published", puckPublishedData: { root: { props: {} }, content: [] } });
    const tool = await svc.createEmbedConfig({ agencyId: AG, subAccountId: SA, name: "Custom result" });
    await assert.rejects(() => svc.updateEmbedConfig(SA, tool.id, { afterSubmit: { destination: { kind: "customPage", pageId: "plain_page" } } }), /Reading Result Page/);
    await assert.rejects(() => svc.updateEmbedConfig(SA, tool.id, { afterSubmit: { destination: { kind: "customPage", pageId: "foreign_rr" } } }), /Reading Result Page/);
    await assert.rejects(() => svc.updateEmbedConfig(SA, tool.id, { status: "live", afterSubmit: { destination: { kind: "customPage", pageId: "rr_page" } } }), /Publish the Reading Result Page/);
    // Staff Test works against the draft.
    await svc.updateEmbedConfig(SA, tool.id, { afterSubmit: { destination: { kind: "customPage", pageId: "rr_page" } } });
    const t = await post({ embedId: tool.id, mode: "test", name: "Draft Run", ...BIRTH }, true);
    const tb = await t.json();
    assert.equal(t.status, 200, JSON.stringify(tb));
    const tp = passLib.verifyReadingResultPass(new URL(tb.redirect).searchParams.get("pass"));
    assert.ok(tp && tp.pageId === "rr_page" && tp.test === true, "Test pass opens the page draft");
    // Publish, go live, submit as a visitor.
    await db.doc("pages/rr_page").update({ status: "published", puckPublishedData: { root: { props: {} }, content: [] } });
    await svc.updateEmbedConfig(SA, tool.id, { status: "live" });
    const res = await post({ embedId: tool.id, name: "Page Person", email: "page@example.com", ...BIRTH });
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    const url = new URL(body.redirect);
    assert.equal(url.pathname, `/api/decoder/${SA}/result`);
    assert.equal(url.searchParams.get("to"), "page");
    const p = passLib.verifyReadingResultPass(url.searchParams.get("pass"));
    assert.ok(p && p.readingId === body.reading.id && p.pageId === "rr_page" && !p.test);
    const r = (await db.doc(`energeticDecoderReadings/${body.reading.id}`).get()).data()!;
    assert.equal(r.embed.resultPageId, "rr_page");
    // The exchange lands on the clean page URL with a page cookie.
    jar.clear();
    const ex = await result.GET(new Request(body.redirect), { params: Promise.resolve({ saId: SA }) });
    assert.equal(new URL(ex.headers.get("location")!).pathname, "/p/rr_page");
    assert.equal(jar.get(passLib.resultPagePassCookieName("rr_page")), url.searchParams.get("pass"));
    // Unpublishing the page later never strands visitors: they get the Standard Result.
    await db.doc("pages/rr_page").update({ puckPublishedData: null });
    const fallback = await (await post({ embedId: tool.id, name: "Fallback", email: "fb@example.com", ...BIRTH })).json();
    assert.equal(fallback.redirect, null);
    jar.clear();
  });

  await check("Existing Reading Tool (no destination saved) still behaves exactly as before", async () => {
    await db.collection("embedConfigs").doc("legacy_tool").set({
      subAccountId: SA, agencyId: AG, name: "Legacy", status: "live",
      form: { title: "Old" }, reading: { views: ["humanDesign"] }, afterSubmit: { show: "chartFacts", myMagnetix: true, pdf: true, email: false }, contact: { tags: [] },
    });
    const res = await post({ embedId: "legacy_tool", name: "Legacy Person", email: "legacy@example.com", ...BIRTH });
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.redirect, null);
    assert.ok(body.pass && body.links.pdf);
  });

  await check("Archived Embed: new public Readings refused, old Reading still readable", async () => {
    await svc.updateEmbedConfig(SA, live.id, { status: "archived" });
    const res = await post({ embedId: live.id, name: "Late", email: "late@example.com", ...BIRTH });
    assert.equal(res.status, 404);
    assert.ok((await db.doc(`energeticDecoderReadings/${firstReadingId}`).get()).exists);
    await assert.rejects(() => svc.deleteEmbedConfig(SA, live.id), /Archive it instead/);
  });

  console.log(`\n${passed} checks passed.`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);

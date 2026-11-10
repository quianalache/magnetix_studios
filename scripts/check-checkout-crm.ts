/**
 * Checkout Foundation Phase 3 — CRM & Follow-Up + Page Builder connection,
 * END-TO-END. EMULATOR ONLY for data (Firestore), Stripe TEST MODE only for
 * payments. QStash, Resend, Twilio and OpenRouter are blanked, so nothing
 * can be sent or scheduled: Workflow runs are recorded but never execute.
 *
 * Run (from the repo root):
 *   echo '{"emulators":{"firestore":{"port":8080}}}' > /tmp/emu/firebase.json
 *   firebase emulators:exec --config /tmp/emu/firebase.json --only firestore --project demo-checkout \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs --require ./scripts/_next-headers-cookie-jar-shim.cjs' \
 *      STRIPE_SECRET_KEY=sk_test_... NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... pnpm exec tsx scripts/check-checkout-crm.ts"
 */
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";

const PROJECT = process.env.GCLOUD_PROJECT ?? "";
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !PROJECT.startsWith("demo-") ||
  process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  !process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ||
  !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_")
) {
  console.error("Refusing to run: Firestore emulator + demo-* project + Stripe TEST keys only, no production credentials.");
  process.exit(1);
}
process.env.FIREBASE_ADMIN_PROJECT_ID ??= PROJECT;
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= PROJECT;
process.env.AUTOMATIONS_TOKEN_SECRET ??= "test-secret-for-checkout-crm";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3999";
for (const k of ["RESEND_API_KEY", "EMAIL_FROM", "QSTASH_TOKEN", "QSTASH_URL", "QSTASH_CURRENT_SIGNING_KEY", "QSTASH_NEXT_SIGNING_KEY", "TWILIO_ACCOUNT_SID", "OPENROUTER_API_KEY", "VAPI_API_KEY"]) delete process.env[k];
const jar = (globalThis as unknown as { __testCookieJar: Map<string, string> }).__testCookieJar;
if (!jar) {
  console.error("Load scripts/_next-headers-cookie-jar-shim.cjs via NODE_OPTIONS.");
  process.exit(1);
}

const SA = "sa_crm";
const SA2 = "sa_crm_other";
const AG = "ag_crm";
const UID = "admin_uid";
let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n      ${(err as Error).stack?.split("\n").slice(0, 4).join("\n      ")}`);
  }
}

async function main() {
  initializeApp({ projectId: PROJECT });
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const { getStripeServer } = await import("../src/lib/stripe/server");
  const funnels = await import("../src/lib/server/checkout/funnels-service");
  const configs = await import("../src/lib/server/checkout/config-service");
  const coupons = await import("../src/lib/server/checkout/coupons-service");
  const orders = await import("../src/lib/server/checkout/order-service");
  const crm = await import("../src/lib/server/checkout/crm-service");
  const views = await import("../src/lib/server/checkout/view-service");
  const resolver = await import("../src/lib/server/page-checkout-resolver");
  const engine = await import("../src/lib/workflows/engine");
  const { CheckoutError } = await import("../src/lib/server/checkout/common");
  const db = getAdminDb();
  const stripe = getStripeServer("test");

  /* ------------------------------- fixtures ------------------------------ */
  await db.doc(`subAccounts/${SA}`).set({ name: "TEST CRM Workspace", agencyId: AG, createdByUid: UID, standaloneCoursesEnabledByAgency: true, stripeCourseCheckoutEnabledByAgency: true });
  await db.doc(`subAccounts/${SA2}`).set({ name: "TEST Other Workspace", agencyId: AG, createdByUid: UID });
  await db.doc(`subAccounts/${SA}/standaloneCourses/c1`).set({ subAccountId: SA, agencyId: AG, title: "TEST Course", visibility: "published" });
  const base = {
    subAccountId: SA, agencyId: AG, descriptionHtml: "<p>Test</p>", currency: "USD", recurringInterval: null, trialDays: null, priceTextOverride: null,
    visibility: "published", version: 1, thumbnailUrl: null, discountCodesEnabled: false, showRecentPurchasePopup: false,
    access: { beginAtSpecificDate: false, beginDate: null, restrictToDays: false, accessDays: null },
    advanced: { customJs: "", customCss: "", headerTracking: "", footerTracking: "" },
    checkoutSettings: { collectAddress: false, collectPhoneNumber: false, serviceAgreement: { mode: "notRequired", customText: "x", linkUrl: "" } },
    booking: null, projectTemplates: [], communityAccess: [], slug: null, createdAt: new Date(), updatedAt: new Date(),
  };
  const offer = (id: string, o: Record<string, unknown>, sa = SA) => db.doc(`subAccounts/${sa}/courseOffers/${id}`).set({ ...base, subAccountId: sa, title: `TEST ${id}`, ...o });
  await offer("plan", { type: "oneTime", priceCents: 4900, courseIds: ["c1"] });
  await offer("addon", { type: "oneTime", priceCents: 1500, courseIds: [] });
  await offer("freebie", { type: "free", priceCents: null, courseIds: ["c1"] });

  const wf = (id: string, sa: string, status: string, triggerType = "task.completed") =>
    db.doc(`workflows/${id}`).set({
      subAccountId: sa, agencyId: AG, name: `TEST ${id}`, status, reentry: "every_time", startNodeId: "n1",
      nodes: { n1: { id: "n1", type: "goal", config: {}, next: null } }, trigger: { type: triggerType, filters: { all: [] } }, stats: { enrolled: 0 },
    });
  await wf("wfAbandon", SA, "active");
  await wf("wfDone", SA, "active");
  await wf("wfPaused", SA, "paused");
  await wf("wfForeign", SA2, "active");
  await wf("wfListensAbandon", SA, "active", "checkout.abandoned");

  const runsFor = async (workflowId: string, contactId: string) =>
    (await db.collection("workflowRuns").where("workflowId", "==", workflowId).where("contactId", "==", contactId).get()).docs.map((d) => d.data());
  const contactsByEmail = async (email: string, sa = SA) => (await db.collection("contacts").where("subAccountId", "==", sa).where("email", "==", email).get()).docs;
  const contactOf = async (email: string) => {
    const docs = await contactsByEmail(email);
    assert.equal(docs.length, 1, `exactly one contact for ${email}`);
    return { id: docs[0].id, ...(docs[0].data() as { tags: string[]; source: string; attribution: { utmSource?: string } | null; emailConsent?: { status: string; textShown: string; source: string } }) };
  };
  async function pay(orderId: string) {
    const o = (await db.doc(`checkoutOrders/${orderId}`).get()).data()!;
    await stripe.paymentIntents.confirm(o.stripePaymentIntentId, { payment_method: "pm_card_visa", return_url: "https://example.com/return" });
  }

  /* ----------------------------- funnel + crm ---------------------------- */
  const { funnel, steps } = await funnels.createFunnel({ subAccountId: SA, uid: UID, body: { name: "TEST CRM Funnel", withCheckoutStep: true } });
  await funnels.updateFunnel(SA, funnel.id, { status: "published" });
  const step = steps[0];
  const configId = step.checkoutConfigId!;
  const code = "TEST-CRM10";
  await coupons.createCoupon({ subAccountId: SA, uid: UID, body: { code, name: "TEST CRM", discountType: "percent", percentOff: 10, appliesTo: { kind: "all" }, includeOrderBumps: true, recurringDuration: { kind: "once" } } });
  const crmSettings = {
    captureContactOnStart: true,
    startedTags: ["TEST started"],
    marketingOptIn: { enabled: true, label: "TEST: email me news and offers.", tags: ["TEST newsletter"] },
    abandoned: { enabled: true, delayMinutes: 30, workflowId: "wfAbandon", tags: ["TEST abandoned"] },
    completed: { tags: ["TEST buyer"], removeAbandonedTags: true, workflowId: "wfDone" },
    bumpPurchasedTags: ["TEST bump buyer"],
    couponUsedTags: ["TEST coupon user"],
  };
  const stepBody = (crmOverride: Record<string, unknown> = crmSettings) => ({
    primaryOfferId: "plan", format: "two_step", couponsEnabled: true, nameFormat: "full", phone: "hidden",
    bumps: [{ id: "", offerId: "addon", enabled: true, headline: "TEST add-on", description: "", imageUrl: "", badge: "", checkboxLabel: "" }],
    crm: crmOverride,
  });
  let bumpId = "";

  console.log("\nCRM settings + Workflow picker (tenancy)");
  await check("54a. a foreign workspace's Workflow can't be picked", async () => {
    await assert.rejects(
      configs.saveStepCheckoutConfig({ subAccountId: SA, funnelId: funnel.id, stepId: step.id, uid: UID, body: stepBody({ ...crmSettings, abandoned: { ...crmSettings.abandoned, workflowId: "wfForeign" } }) }),
      (e: unknown) => e instanceof CheckoutError && !!e.fields?.["crm.abandoned.workflowId"],
    );
  });
  await check("54b. a NEW pick must be an active Workflow", async () => {
    await assert.rejects(
      configs.saveStepCheckoutConfig({ subAccountId: SA, funnelId: funnel.id, stepId: step.id, uid: UID, body: stepBody({ ...crmSettings, completed: { ...crmSettings.completed, workflowId: "wfPaused" } }) }),
      (e: unknown) => e instanceof CheckoutError && !!e.fields?.["crm.completed.workflowId"],
    );
  });
  await check("54c. the picker lists only this workspace's Workflows", async () => {
    const list = await configs.listWorkflowOptions(SA);
    assert.ok(list.some((w) => w.id === "wfAbandon"));
    assert.ok(!list.some((w) => w.id === "wfForeign"));
  });
  await check("CRM settings save + normalise (tags trimmed, abandonment forces capture)", async () => {
    const saved = await configs.saveStepCheckoutConfig({ subAccountId: SA, funnelId: funnel.id, stepId: step.id, uid: UID, body: stepBody({ ...crmSettings, captureContactOnStart: false, startedTags: ["  TEST started ", "test STARTED"] }) });
    assert.equal(saved.crm.captureContactOnStart, true);
    assert.deepEqual(saved.crm.startedTags, ["TEST started"]);
    assert.equal(saved.crm.abandoned.workflowId, "wfAbandon");
    bumpId = saved.bumps[0].id;
  });
  await check("54d. an already-saved pick that was paused afterwards is kept (not silently dropped)", async () => {
    await db.doc("workflows/wfDone").update({ status: "paused" });
    const saved = await configs.saveStepCheckoutConfig({ subAccountId: SA, funnelId: funnel.id, stepId: step.id, uid: UID, body: stepBody() });
    assert.equal(saved.crm.completed.workflowId, "wfDone");
    bumpId = saved.bumps[0].id; // a re-save with a blank bump id mints a new one
    await db.doc("workflows/wfDone").update({ status: "active" });
  });

  console.log("\nMarketing opt-in (view)");
  await check("42. opt-in checkbox is offered to the page when enabled (label only — no tags/workflows leak)", async () => {
    const view = await views.buildCheckoutView(configId);
    assert.deepEqual(view.crm?.marketingOptIn, { label: crmSettings.marketingOptIn.label });
    assert.ok(!JSON.stringify(view).includes("TEST newsletter"));
    assert.ok(!JSON.stringify(view).includes("wfAbandon"));
  });

  console.log("\nTwo-step start (Continue) → Contact + session");
  const A = "buyer.a@example.com";
  let sessionA = "";
  await check("34/32. Continue creates the Contact and a started session", async () => {
    const r = await orders.startBuyerStep(configId, { name: "TEST Buyer A", email: A.toUpperCase(), attribution: { utmSource: "test-ads", landingPage: "https://example.com/lp" } });
    assert.ok(r.sessionId);
    sessionA = r.sessionId!;
    const s = (await db.doc(`checkoutSessions/${sessionA}`).get()).data()!;
    assert.equal(s.status, "started");
    assert.equal(s.email, A);
    assert.equal(s.subAccountId, SA);
  });
  await check("35. source attribution stored on the new Contact", async () => {
    const c = await contactOf(A);
    assert.equal(c.source, "test-ads");
    assert.equal(c.attribution?.utmSource, "test-ads");
  });
  await check("36. start tag applied — and only once on repeat Continue", async () => {
    await orders.startBuyerStep(configId, { name: "TEST Buyer A", email: A, sessionId: sessionA });
    const c = await contactOf(A);
    assert.equal(c.tags.filter((t) => t === "TEST started").length, 1);
    const sessions = await db.collection("checkoutSessions").where("configId", "==", configId).where("email", "==", A).get();
    assert.equal(sessions.size, 1, "repeat Continue reuses the session");
  });
  await check("checkout.started recorded once on the Contact timeline", async () => {
    const c = await contactOf(A);
    const acts = await db.collection(`contacts/${c.id}/activities`).where("type", "==", "checkout_started").get();
    assert.equal(acts.size, 1);
  });
  await check("Step 1 with an invalid email writes nothing", async () => {
    const before = (await db.collection("checkoutSessions").get()).size;
    await assert.rejects(orders.startBuyerStep(configId, { name: "X", email: "not-an-email" }), (e: unknown) => e instanceof CheckoutError && e.status === 400);
    assert.equal((await db.collection("checkoutSessions").get()).size, before);
  });

  console.log("\nAbandonment");
  await check("47. tracking schedules the abandonment check (due = last activity + delay)", async () => {
    const s = (await db.doc(`checkoutSessions/${sessionA}`).get()).data()!;
    assert.equal(s.abandonDueAt, s.lastActivityAt + 30 * 60_000);
  });
  await check("48. delay respected — before it elapses the checkout isn't abandoned", async () => {
    assert.equal(await crm.runAbandonmentStep(sessionA), "waiting");
    const s = (await db.doc(`checkoutSessions/${sessionA}`).get()).data()!;
    assert.equal(s.status, "started");
  });
  const age = (id: string, minutes: number) => db.doc(`checkoutSessions/${id}`).update({ lastActivityAt: Date.now() - minutes * 60_000 });
  let resumeUrl = "";
  await check("38/50. after the delay: abandoned exactly once (tag, activity, Workflow, trigger)", async () => {
    await age(sessionA, 31);
    assert.equal(await crm.runAbandonmentStep(sessionA), "fired");
    assert.equal(await crm.runAbandonmentStep(sessionA), "skipped");
    await crm.sweepAbandonedCheckouts();
    const c = await contactOf(A);
    assert.equal(c.tags.filter((t) => t === "TEST abandoned").length, 1);
    assert.equal((await db.collection(`contacts/${c.id}/activities`).where("type", "==", "checkout_abandoned").get()).size, 1);
    const picked = await runsFor("wfAbandon", c.id);
    const listening = await runsFor("wfListensAbandon", c.id);
    assert.equal(picked.length, 1, "picked Workflow started once");
    assert.equal(listening.length, 1, "trigger Workflow started once");
    assert.equal(picked[0].context.eventType, "checkout.abandoned");
    resumeUrl = picked[0].context.checkoutResumeUrl as string;
    assert.ok(resumeUrl.startsWith("http://localhost:3999/checkout/") && resumeUrl.includes("?resume="));
    const s = (await db.doc(`checkoutSessions/${sessionA}`).get()).data()!;
    assert.equal(s.status, "abandoned");
    assert.equal(s.abandonDueAt, null);
  });
  await check("the picked Workflow also listening to the trigger is not enrolled twice", async () => {
    await db.doc("workflows/wfAbandon").update({ "trigger.type": "checkout.abandoned" });
    const c = await contactOf(A);
    // Re-emit the same event (as a retry would): shared dedupe key → no second run.
    const r = await engine.startWorkflowForCheckoutEvent({ workflowId: "wfAbandon", subAccountId: SA, contactId: c.id, context: { deduplicationKey: `checkout-abandoned:${sessionA}` } });
    assert.equal(r, "skipped");
    assert.equal((await runsFor("wfAbandon", c.id)).length, 1);
    await db.doc("workflows/wfAbandon").update({ "trigger.type": "task.completed" });
  });
  await check("57. a foreign workspace's Workflow can never be started for this Contact", async () => {
    const c = await contactOf(A);
    const r = await engine.startWorkflowForCheckoutEvent({ workflowId: "wfForeign", subAccountId: SA, contactId: c.id, context: { deduplicationKey: "x" } });
    assert.equal(r, "skipped");
    assert.equal((await runsFor("wfForeign", c.id)).length, 0);
  });

  console.log("\nResume link");
  const token = new URL(resumeUrl).searchParams.get("resume")!;
  await check("51a. the resume link prefills this buyer's details + selection", async () => {
    const r = await crm.resumeCheckoutSession(configId, token);
    assert.equal(r.status, "ok");
    if (r.status === "ok") assert.equal(r.buyer.email, A);
  });
  await check("RESUME CHECKOUT IS SECURE: tampered, foreign-checkout and other-domain tokens are refused", async () => {
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    assert.equal((await crm.resumeCheckoutSession(configId, tampered)).status, "invalid");
    assert.equal((await crm.resumeCheckoutSession("step_other", token)).status, "invalid");
    const { issueQuoteToken } = await import("../src/lib/quotes/token");
    assert.equal((await crm.resumeCheckoutSession(configId, issueQuoteToken(sessionA).token)).status, "invalid");
    assert.ok(!token.includes("4900") && !token.includes("plan"), "token carries no price or Offer");
  });
  await check("52. stale resume state is revalidated (an archived add-on is dropped / refused)", async () => {
    await db.doc(`checkoutSessions/${sessionA}`).update({ bumpIds: [bumpId] });
    await db.doc(`subAccounts/${SA}/courseOffers/addon`).update({ visibility: "archived" });
    const q = await orders.quoteCheckout(configId, { bumpIds: [bumpId] });
    assert.deepEqual(q.removedBumpIds, [bumpId]);
    await assert.rejects(orders.startCheckout(configId, { name: "TEST Buyer A", email: A, bumpIds: [bumpId], sessionId: sessionA }), (e: unknown) => e instanceof CheckoutError && e.code === "stale_bump");
    await db.doc(`subAccounts/${SA}/courseOffers/addon`).update({ visibility: "published" });
  });
  let orderA = "";
  await check("51b/30. resumed checkout completes and fulfils normally (bump + coupon, Stripe test card)", async () => {
    const start = await orders.startCheckout(configId, { name: "TEST Buyer A", email: A, bumpIds: [bumpId], couponCode: code, sessionId: sessionA, agreementAccepted: true });
    orderA = start.orderId;
    assert.equal(start.totals.dueTodayCents, Math.round((4900 + 1500) * 0.9));
    await pay(orderA);
    const done = await orders.completeOrder(orderA, { source: "client" });
    assert.equal(done.status, "paid");
    const o = (await db.doc(`checkoutOrders/${orderA}`).get()).data()!;
    assert.ok(o.items.every((i: { fulfillment: string }) => i.fulfillment === "granted"));
    assert.equal(o.sessionId, sessionA);
  });
  await check("37/40. purchase tags applied; abandoned tags removed; bump + coupon tags", async () => {
    const c = await contactOf(A);
    for (const t of ["TEST buyer", "TEST bump buyer", "TEST coupon user", "TEST started"]) assert.ok(c.tags.includes(t), t);
    assert.ok(!c.tags.includes("TEST abandoned"));
  });
  await check("32. the purchase reused the SAME Contact (Member linked to it, no duplicate)", async () => {
    const c = await contactOf(A);
    const o = (await db.doc(`checkoutOrders/${orderA}`).get()).data()!;
    const m = (await db.doc(`subAccounts/${SA}/members/${o.memberId}`).get()).data()!;
    assert.equal(m.contactId, c.id);
  });
  await check("39/53. completion settles the session; abandonment can't fire again; resume says completed", async () => {
    const s = (await db.doc(`checkoutSessions/${sessionA}`).get()).data()!;
    assert.equal(s.status, "completed");
    assert.equal(s.orderId, orderA);
    assert.equal(await crm.runAbandonmentStep(sessionA), "skipped");
    assert.equal((await crm.resumeCheckoutSession(configId, token)).status, "completed");
  });
  await check("32. the abandonment Workflow run is stopped when the buyer completes", async () => {
    const c = await contactOf(A);
    await db.collection("workflowRuns").add({ subAccountId: SA, agencyId: AG, workflowId: "wfAbandon", contactId: c.id, status: "waiting", context: { eventType: "checkout.abandoned", checkoutSessionId: "sess_live" }, history: [] });
    await db.doc("checkoutSessions/sess_live").set({ configId, email: A, status: "abandoned", subAccountId: SA, abandonment: { firedAt: Date.now() }, lastActivityAt: 0, contactId: c.id });
    const n = await engine.exitAbandonedCheckoutRuns({ subAccountId: SA, contactId: c.id, checkoutSessionId: "sess_live" });
    assert.equal(n, 1);
  });
  await check("checkout.completed: picked Workflow + timeline once; repeated completion is a no-op", async () => {
    const c = await contactOf(A);
    await orders.completeOrder(orderA, { source: "webhook", eventAccountId: null });
    await crm.completeCheckoutCrm({ id: orderA, ...((await db.doc(`checkoutOrders/${orderA}`).get()).data() as Record<string, unknown>) } as never);
    assert.equal((await runsFor("wfDone", c.id)).length, 1);
    assert.equal((await db.collection(`contacts/${c.id}/activities`).where("type", "==", "checkout_completed").get()).size, 1);
  });

  console.log("\nCompletion before the delay");
  const B = "buyer.b@example.com";
  await check("49. a purchase before the delay prevents abandonment entirely", async () => {
    const { sessionId } = await orders.startBuyerStep(configId, { name: "TEST Buyer B", email: B });
    const start = await orders.startCheckout(configId, { name: "TEST Buyer B", email: B, sessionId, agreementAccepted: true });
    await pay(start.orderId);
    assert.equal((await orders.completeOrder(start.orderId, { source: "client" })).status, "paid");
    await age(sessionId!, 120);
    assert.equal(await crm.runAbandonmentStep(sessionId!), "skipped");
    const c = await contactOf(B);
    assert.ok(!c.tags.includes("TEST abandoned"));
    assert.equal((await runsFor("wfAbandon", c.id)).length, 0);
  });
  await check("44. purchase WITHOUT ticking the box never creates marketing consent", async () => {
    const c = await contactOf(B);
    assert.equal(c.emailConsent, undefined);
    assert.ok(!c.tags.includes("TEST newsletter"));
  });

  console.log("\nMarketing opt-in");
  const C = "buyer.c@example.com";
  await check("43/45. a ticked box records consent (exact text) + opt-in tags", async () => {
    await orders.startBuyerStep(configId, { name: "TEST Buyer C", email: C, marketingOptIn: true, attribution: { landingPage: "https://example.com/checkout" } });
    const c = await contactOf(C);
    assert.equal(c.emailConsent?.status, "consented");
    assert.equal(c.emailConsent?.textShown, crmSettings.marketingOptIn.label);
    assert.equal(c.emailConsent?.source, `checkout:${configId}`);
    assert.ok(c.tags.includes("TEST newsletter"));
  });

  console.log("\nOne-step start + disabled tracking");
  const oneStep = await funnels.addStep({ subAccountId: SA, funnelId: funnel.id, body: { type: "checkout", name: "TEST One-step" } });
  await configs.saveStepCheckoutConfig({
    subAccountId: SA, funnelId: funnel.id, stepId: oneStep.id, uid: UID,
    body: { primaryOfferId: "plan", format: "one_step", crm: { captureContactOnStart: true, startedTags: [], marketingOptIn: { enabled: false }, abandoned: { enabled: false }, completed: { tags: [] } } },
  });
  const oneConfig = oneStep.checkoutConfigId!;
  const D = "buyer.d@example.com";
  await check("33. one-step: a valid email starts the checkout (no name needed)", async () => {
    const r = await orders.startOneStepSession(oneConfig, { email: D });
    assert.ok(r.sessionId);
    await contactOf(D);
  });
  await check("33. one-step: a partial / invalid email is refused, nothing written", async () => {
    await assert.rejects(orders.startOneStepSession(oneConfig, { email: "d@" }), (e: unknown) => e instanceof CheckoutError && e.status === 400);
    assert.equal((await contactsByEmail("d@")).length, 0);
  });
  await check("one-step: correcting the email supersedes the typo session (never followed up)", async () => {
    const typo = await orders.startOneStepSession(oneConfig, { email: "buyer.e@exmaple.com" });
    await orders.startOneStepSession(oneConfig, { email: "buyer.e@example.com", sessionId: typo.sessionId });
    assert.equal((await db.doc(`checkoutSessions/${typo.sessionId}`).get()).data()!.status, "superseded");
    assert.equal(await crm.runAbandonmentStep(typo.sessionId!), "skipped");
  });
  await check("41/46. tracking disabled → no due date, no event; opt-in disabled → not offered and ignored", async () => {
    const { sessionId } = await orders.startOneStepSession(oneConfig, { email: "buyer.f@example.com", marketingOptIn: true });
    const s = (await db.doc(`checkoutSessions/${sessionId}`).get()).data()!;
    assert.equal(s.abandonDueAt, null);
    await age(sessionId!, 2000);
    assert.equal(await crm.runAbandonmentStep(sessionId!), "skipped");
    assert.equal((await views.buildCheckoutView(oneConfig)).crm?.marketingOptIn, null);
    assert.equal((await contactOf("buyer.f@example.com")).emailConsent, undefined);
  });
  await check("capture off → no Contact or session at checkout start", async () => {
    await configs.saveStepCheckoutConfig({ subAccountId: SA, funnelId: funnel.id, stepId: oneStep.id, uid: UID, body: { primaryOfferId: "plan", format: "one_step", crm: { captureContactOnStart: false } } });
    const r = await orders.startOneStepSession(oneConfig, { email: "buyer.g@example.com" });
    assert.equal(r.sessionId, null);
    assert.equal((await contactsByEmail("buyer.g@example.com")).length, 0);
  });

  console.log("\nPage Builder connection (tenancy)");
  await db.doc("pages/pg_crm").set({ subAccountId: SA, agencyId: AG, name: "TEST Checkout Page", status: "published" });
  await db.doc("pages/pg_foreign").set({ subAccountId: SA2, agencyId: AG, name: "TEST Foreign Page", status: "published" });
  await check("2. a page set as the Checkout Step's page connects automatically", async () => {
    await funnels.updateStep(SA, funnel.id, step.id, { pageId: "pg_crm" });
    const ctx = await resolver.checkoutContextsForPage(SA, "pg_crm");
    assert.equal(ctx.autoConfigId, configId);
    assert.ok(ctx.contexts.every((c) => c.funnelId === funnel.id));
    const r = await resolver.resolveCheckoutBlocks({ id: "pg_crm", subAccountId: SA }, ["auto"], "published");
    assert.equal(r.auto?.view?.primary.offerId, "plan");
    assert.equal(r.auto?.connection.primaryOfferTitle, "TEST plan");
  });
  await check("3. a cross-workspace Checkout Step is rejected", async () => {
    const r = await resolver.resolveCheckoutBlocks({ id: "pg_foreign", subAccountId: SA2 }, [configId], "editor");
    assert.equal(r[configId], null);
    const ctx = await resolver.checkoutContextsForPage(SA2, "pg_foreign");
    assert.equal(ctx.contexts.length, 0);
  });
  await check("hosted Offer configs can't be connected to a block", async () => {
    const r = await resolver.resolveCheckoutBlocks({ id: "pg_crm", subAccountId: SA }, ["hosted_plan"], "editor");
    assert.equal(r.hosted_plan ?? null, null);
  });
  await check("published resolution hides a draft funnel's checkout from visitors (editor still sees it)", async () => {
    await funnels.updateFunnel(SA, funnel.id, { status: "draft" });
    const pub = await resolver.resolveCheckoutBlocks({ id: "pg_crm", subAccountId: SA }, [configId], "published");
    const ed = await resolver.resolveCheckoutBlocks({ id: "pg_crm", subAccountId: SA }, [configId], "editor");
    assert.equal(pub[configId], null);
    assert.ok(ed[configId]?.view?.preview);
    await funnels.updateFunnel(SA, funnel.id, { status: "published" });
  });
  await check("after purchase the funnel's next step goes to the checkout step's Page when set", async () => {
    const next = await funnels.addStep({ subAccountId: SA, funnelId: funnel.id, body: { type: "checkout", name: "TEST Upsell checkout" } });
    await funnels.reorderSteps(SA, funnel.id, [step.id, next.id, oneStep.id]);
    await funnels.updateStep(SA, funnel.id, next.id, { pageId: "pg_crm" });
    const o = (await db.doc(`checkoutOrders/${orderA}`).get()).data()!;
    const r = await orders.orderStatusForBuyer(orderA, o.configId);
    assert.equal(r?.redirectTo, "/p/pg_crm");
  });

  console.log("\nSafety");
  await check("56. no duplicate Contacts for any buyer across start, abandonment and purchase", async () => {
    for (const e of [A, B, C, D, "buyer.e@example.com"]) assert.equal((await contactsByEmail(e)).length, 1, e);
  });
  await check("57. nothing was written to the other workspace", async () => {
    assert.equal((await db.collection("contacts").where("subAccountId", "==", SA2).get()).size, 0);
    assert.equal((await db.collection("checkoutSessions").where("subAccountId", "==", SA2).get()).size, 0);
  });
  await check("55. no communications possible: email/QStash unset; Workflow runs never executed a step", async () => {
    assert.ok(!process.env.RESEND_API_KEY && !process.env.QSTASH_TOKEN);
    const runs = await db.collection("workflowRuns").get();
    assert.ok(runs.docs.every((d) => (d.data().history ?? []).length === 0));
  });

  // Stripe test-mode cleanup: nothing to cancel (one-time PaymentIntents only).
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

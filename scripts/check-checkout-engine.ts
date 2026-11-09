/**
 * Checkout Foundation Phase 1 — END-TO-END checks. EMULATOR ONLY for data
 * (Firestore), Stripe TEST MODE only for payments: runs the real funnel,
 * checkout-settings, coupon and order services, takes test-card payments
 * on the platform's Stripe test account, then verifies fulfillment,
 * coupon accounting, webhook-retry idempotency and subscription
 * cancellation. Refuses to run with production credentials or a live key.
 *
 * Run (from the repo root):
 *   echo '{"emulators":{"firestore":{"port":8080}}}' > /tmp/emu/firebase.json
 *   firebase emulators:exec --config /tmp/emu/firebase.json --only firestore --project demo-checkout \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs --require ./scripts/_next-headers-cookie-jar-shim.cjs' \
 *      STRIPE_SECRET_KEY=sk_test_... NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... pnpm exec tsx scripts/check-checkout-engine.ts"
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
process.env.AUTOMATIONS_TOKEN_SECRET ??= "test-secret";
for (const k of ["RESEND_API_KEY", "QSTASH_TOKEN", "QSTASH_URL", "TWILIO_ACCOUNT_SID", "OPENROUTER_API_KEY"]) delete process.env[k];
const jar = (globalThis as unknown as { __testCookieJar: Map<string, string> }).__testCookieJar;
if (!jar) {
  console.error("Load scripts/_next-headers-cookie-jar-shim.cjs via NODE_OPTIONS.");
  process.exit(1);
}

const SA = "sa_checkout";
const SA2 = "sa_other";
const AG = "ag_checkout";
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
    console.log(`  ✗ ${name}\n      ${(err as Error).stack?.split("\n").slice(0, 3).join("\n      ")}`);
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
  const { handleCourseOfferSubscriptionDeleted } = await import("../src/lib/server/course-offer-purchase-service");
  const { CheckoutError } = await import("../src/lib/server/checkout/common");
  const db = getAdminDb();
  const stripe = getStripeServer("test");
  const tag = { magnetix_proof: "checkout-engine-check" };
  const createdCustomers = new Set<string>();

  /* ------------------------------- fixtures ------------------------------ */
  await db.doc(`subAccounts/${SA}`).set({ name: "TEST Checkout Workspace", agencyId: AG, createdByUid: UID, standaloneCoursesEnabledByAgency: true, stripeCourseCheckoutEnabledByAgency: true });
  await db.doc(`subAccounts/${SA2}`).set({ name: "Other", agencyId: AG, createdByUid: UID });
  for (const c of ["c1", "c2", "c3"]) await db.doc(`subAccounts/${SA}/standaloneCourses/${c}`).set({ subAccountId: SA, agencyId: AG, title: `TEST Course ${c}`, visibility: "published" });
  await db.doc(`subAccounts/${SA}/communityGroups/g1`).set({ subAccountId: SA, agencyId: AG, name: "TEST Circle", status: "published", memberCount: 0 });
  await db.doc(`subAccounts/${SA}/communityGroups/g1/membershipLevels/lvl1`).set({ name: "Inner", status: "active", isBase: false, publicVisibility: "public", groupId: "g1" });
  const base = {
    subAccountId: SA, agencyId: AG, descriptionHtml: "<p>Test</p>", currency: "USD", recurringInterval: null, trialDays: null, priceTextOverride: null,
    visibility: "published", version: 1, thumbnailUrl: null, discountCodesEnabled: false, showRecentPurchasePopup: false,
    access: { beginAtSpecificDate: false, beginDate: null, restrictToDays: false, accessDays: null },
    advanced: { customJs: "", customCss: "", headerTracking: "", footerTracking: "" },
    checkoutSettings: { collectAddress: false, collectPhoneNumber: false, serviceAgreement: { mode: "notRequired", customText: "x", linkUrl: "" } },
    booking: null, projectTemplates: [], communityAccess: [], slug: null, createdAt: new Date(), updatedAt: new Date(),
  };
  const offer = (id: string, o: Record<string, unknown>, sa = SA) => db.doc(`subAccounts/${sa}/courseOffers/${id}`).set({ ...base, subAccountId: sa, title: `TEST ${id}`, ...o });
  await offer("primaryOne", {
    type: "oneTime", priceCents: 49700, courseIds: ["c1"],
    booking: { bookingPageId: "bp1", bookingPageName: "TEST Call", bookingPageSlug: "test-call", sessionCount: 2 },
    projectTemplates: [{ templateId: "tpl1", templateTitle: "TEST Onboarding", templateCategory: "Client", durationDays: 30, description: "", steps: [{ title: "Kickoff", order: 0 }], snapshotVersion: 2 }],
    communityAccess: [{ communityGroupId: "g1", membershipLevelId: "lvl1" }],
  });
  await offer("primaryRec", { type: "recurring", priceCents: 9700, recurringInterval: "month", courseIds: ["c2"] });
  await offer("primaryTrial", { type: "recurring", priceCents: 9700, recurringInterval: "month", trialDays: 7, courseIds: ["c2"] });
  await offer("bumpA", { type: "oneTime", priceCents: 2700, courseIds: ["c3"] });
  await offer("bumpB", { type: "oneTime", priceCents: 9700, courseIds: [] });
  await offer("bumpOverlap", { type: "oneTime", priceCents: 1500, courseIds: ["c2"] });
  await offer("bumpRec", { type: "recurring", priceCents: 500, recurringInterval: "month", courseIds: [] });
  await offer("freeOne", { type: "free", priceCents: null, courseIds: ["c1"] });
  await offer("archivedOne", { type: "oneTime", priceCents: 1000, visibility: "archived", courseIds: [] });
  await offer("foreign", { type: "oneTime", priceCents: 1000, courseIds: [] }, SA2);

  const buyer = (email: string) => ({ name: "TEST Buyer", email, agreementAccepted: true });
  const memberCookie = () => [...jar.keys()].find((k) => k.includes("member"));

  /** Simulate the browser's Payment Element confirmation with a test card. */
  async function pay(orderId: string) {
    const o = (await db.doc(`checkoutOrders/${orderId}`).get()).data()!;
    createdCustomers.add(o.stripeCustomerId);
    if (o.stripePaymentIntentId) {
      await stripe.paymentIntents.confirm(o.stripePaymentIntentId, { payment_method: "pm_card_visa", return_url: "https://example.com/return" });
    } else if (o.totals.dueTodayCents > 0) {
      const sub = await stripe.subscriptions.retrieve(o.stripeSubscriptionId);
      const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: o.stripeCustomerId });
      await stripe.invoices.pay(sub.latest_invoice as string, { payment_method: pm.id });
    } else {
      await stripe.setupIntents.confirm(o.stripeSetupIntentId, { payment_method: "pm_card_visa", return_url: "https://example.com/return" });
    }
  }
  const purchasesOf = async (orderId: string) => {
    const o = (await db.doc(`checkoutOrders/${orderId}`).get()).data()!;
    return Promise.all(
      (o.items as Array<{ offerId: string; purchaseId: string | null }>).map(async (i) => ({
        offerId: i.offerId,
        purchase: i.purchaseId ? (await db.doc(`subAccounts/${SA}/courseOffers/${i.offerId}/purchases/${i.purchaseId}`).get()).data() : null,
      })),
    );
  };
  const enrollment = async (course: string, memberId: string) => (await db.doc(`subAccounts/${SA}/standaloneCourses/${course}/enrollments/${memberId}`).get()).data();

  console.log("\nFunnels + Checkout Step");
  let funnelId = "";
  let stepId = "";
  let stepConfigId = "";
  await check("1. a funnel can be created in a workspace", async () => {
    const r = await funnels.createFunnel({ subAccountId: SA, uid: UID, body: { name: "TEST Checkout Funnel", withCheckoutStep: true } });
    funnelId = r.funnel.id;
    assert.equal(r.funnel.subAccountId, SA);
    assert.equal(r.steps.length, 1);
  });
  await check("2. the checkout step persists with its own checkout config", async () => {
    const steps = await funnels.listSteps(funnelId);
    stepId = steps[0].id;
    stepConfigId = steps[0].checkoutConfigId!;
    assert.equal(steps[0].type, "checkout");
    assert.equal(stepConfigId, `step_${stepId}`);
  });
  await check("3. step order persists", async () => {
    const page = await funnels.addStep({ subAccountId: SA, funnelId, body: { type: "page", name: "Sales" } });
    const ty = await funnels.addStep({ subAccountId: SA, funnelId, body: { type: "thank_you" } });
    await funnels.reorderSteps(SA, funnelId, [page.id, stepId, ty.id]);
    assert.deepEqual((await funnels.listSteps(funnelId)).map((s) => s.name), ["Sales", "Checkout", "Thank you"]);
  });
  await check("funnel from another workspace reads as not found", async () => {
    await assert.rejects(funnels.getFunnelForWorkspace(SA2, funnelId), (e: unknown) => e instanceof CheckoutError && e.status === 404);
  });
  const save = (body: Record<string, unknown>) => configs.saveStepCheckoutConfig({ subAccountId: SA, funnelId, stepId, uid: UID, body });
  await check("4. exactly one primary Offer is stored", async () => {
    const c = await save({ primaryOfferId: "primaryOne", primaryOfferIds: ["primaryRec"] } as never);
    assert.equal(c.primaryOfferId, "primaryOne");
    assert.equal("primaryOfferIds" in c, false);
  });
  await check("5. a cross-workspace primary Offer is rejected", async () => {
    await assert.rejects(save({ primaryOfferId: "foreign" }), (e: unknown) => e instanceof CheckoutError && !!e.fields?.primaryOfferId);
  });
  await check("6/7. one-step and two-step persist", async () => {
    assert.equal((await save({ primaryOfferId: "primaryOne", format: "two_step" })).format, "two_step");
    assert.equal((await configs.getStepCheckoutConfig(SA, funnelId, stepId)).format, "two_step");
    assert.equal((await save({ primaryOfferId: "primaryOne", format: "one_step" })).format, "one_step");
  });

  console.log("\nOrder Bumps");
  await check("8/9. one, then several bumps", async () => {
    assert.equal((await save({ primaryOfferId: "primaryOne", bumps: [{ offerId: "bumpA" }] })).bumps.length, 1);
    assert.equal((await save({ primaryOfferId: "primaryOne", bumps: [{ offerId: "bumpA" }, { offerId: "bumpB" }] })).bumps.length, 2);
  });
  await check("10. a duplicate bump is blocked", async () => {
    await assert.rejects(save({ primaryOfferId: "primaryOne", bumps: [{ offerId: "bumpA" }, { offerId: "bumpA" }] }), (e: unknown) => e instanceof CheckoutError && !!e.fields?.["bumps.1"]);
  });
  await check("11/12/15. order, enabled state and display overrides persist", async () => {
    const cur = await configs.getStepCheckoutConfig(SA, funnelId, stepId);
    const [a, b] = cur.bumps;
    const next = await save({ primaryOfferId: "primaryOne", bumps: [{ ...b, enabled: false }, { ...a, headline: "Add the workbook", badge: "Popular", checkboxLabel: "Yes please" }] });
    assert.deepEqual(next.bumps.map((x) => x.offerId), ["bumpB", "bumpA"]);
    assert.equal(next.bumps[0].enabled, false);
    assert.equal(next.bumps[1].headline, "Add the workbook");
    assert.equal(next.bumps[1].id, a.id);
  });
  await check("13. a recurring Offer can't be attached as a bump", async () => {
    await assert.rejects(save({ primaryOfferId: "primaryOne", bumps: [{ offerId: "bumpRec" }] }), (e: unknown) => e instanceof CheckoutError && /one-time/.test(e.fields?.["bumps.0"] ?? ""));
  });
  await check("14. an archived Offer can't be newly attached", async () => {
    await assert.rejects(save({ primaryOfferId: "primaryOne", bumps: [{ offerId: "archivedOne" }] }), (e: unknown) => e instanceof CheckoutError);
  });
  await check("16/55/56. hosted checkout and funnel step keep independent bumps", async () => {
    await configs.saveHostedCheckoutConfig({ subAccountId: SA, offerId: "primaryOne", uid: UID, body: { enabled: true, couponsEnabled: true, bumps: [{ offerId: "bumpB" }] } });
    const step = await configs.getStepCheckoutConfig(SA, funnelId, stepId);
    const hosted = (await configs.getHostedCheckoutConfig(SA, "primaryOne")).config;
    assert.deepEqual(hosted.bumps.map((b) => b.offerId), ["bumpB"]);
    assert.deepEqual(step.bumps.map((b) => b.offerId), ["bumpB", "bumpA"]);
    await save({ ...step, bumps: step.bumps.map((b) => ({ ...b, enabled: true })), couponsEnabled: true });
    assert.deepEqual((await configs.getHostedCheckoutConfig(SA, "primaryOne")).config.bumps.map((b) => b.offerId), ["bumpB"]);
  });
  await check("52/54. hosted settings persist, phone + agreement land on the Offer's checkoutSettings", async () => {
    await configs.saveHostedCheckoutConfig({ subAccountId: SA, offerId: "primaryOne", uid: UID, body: { enabled: true, couponsEnabled: true, bumps: [{ offerId: "bumpB" }], phone: "optional", agreement: { mode: "required", customText: "", linkUrl: "" } } });
    const hosted = await configs.getHostedCheckoutConfig(SA, "primaryOne");
    assert.equal(hosted.config.couponsEnabled, true);
    assert.equal(hosted.config.phone, "optional");
    const s = (await db.doc(`subAccounts/${SA}/courseOffers/primaryOne`).get()).data()!.checkoutSettings;
    assert.equal(s.collectPhoneNumber, true);
    assert.equal(s.phoneRequirement, "optional");
    assert.equal(s.serviceAgreement.mode, "required");
    // restore no agreement for the payment tests below
    await configs.saveHostedCheckoutConfig({ subAccountId: SA, offerId: "primaryOne", uid: UID, body: { enabled: true, couponsEnabled: true, bumps: [{ offerId: "bumpB" }] } });
  });

  console.log("\nCoupons");
  let c25 = "";
  await check("17/18. percent and fixed coupons save", async () => {
    c25 = (await coupons.createCoupon({ subAccountId: SA, uid: UID, body: { code: "test-coupon-25", discountType: "percent", percentOff: 25 } })).id;
    const f = await coupons.createCoupon({ subAccountId: SA, uid: UID, body: { code: "TEST-FIXED-10", discountType: "fixed", amountOffCents: 1000, currency: "USD" } });
    assert.equal(f.amountOffCents, 1000);
  });
  await check("20. codes are unique per workspace (and reusable in another)", async () => {
    await assert.rejects(coupons.createCoupon({ subAccountId: SA, uid: UID, body: { code: "TEST-COUPON-25", percentOff: 5 } }), (e: unknown) => e instanceof CheckoutError && e.status === 409);
    await coupons.createCoupon({ subAccountId: SA2, uid: UID, body: { code: "TEST-COUPON-25", percentOff: 5 } });
  });
  await check("multi-payment coupon refused when no selected Offer is a monthly plan", async () => {
    await assert.rejects(
      coupons.createCoupon({ subAccountId: SA, uid: UID, body: { code: "TEST-REP-ONE", percentOff: 10, recurringDuration: { kind: "repeating", months: 3 }, appliesTo: { kind: "offers", offerIds: ["primaryOne"] } } }),
      (e: unknown) => e instanceof CheckoutError && !!e.fields?.recurringDuration,
    );
    await coupons.createCoupon({ subAccountId: SA, uid: UID, body: { code: "TEST-REP-MO", percentOff: 10, recurringDuration: { kind: "repeating", months: 3 }, appliesTo: { kind: "offers", offerIds: ["primaryRec"] } } });
  });
  await check("new Offers start on the new hosted checkout; existing Offers stay classic", async () => {
    await configs.initializeHostedCheckoutForNewOffer({ subAccountId: SA, agencyId: AG, offerId: "bumpB" });
    const fresh = await configs.getHostedCheckoutConfig(SA, "bumpB");
    assert.equal(fresh.saved, true);
    assert.equal(fresh.config.enabled, true);
    assert.deepEqual(fresh.config.bumps, []);
    await configs.initializeHostedCheckoutForNewOffer({ subAccountId: SA, agencyId: AG, offerId: "bumpB" }); // idempotent
    const untouched = await configs.getHostedCheckoutConfig(SA, "bumpA");
    assert.equal(untouched.saved, false);
    assert.equal(untouched.config.enabled, false);
  });
  await coupons.createCoupon({ subAccountId: SA, uid: UID, body: { code: "TEST-FREE-100", percentOff: 100 } });
  await coupons.createCoupon({ subAccountId: SA, uid: UID, body: { code: "TEST-ONCE-PP", percentOff: 10, maxPerCustomer: 1 } });

  console.log("\nCheckout");
  await db.doc(`funnels/${funnelId}`).update({ status: "published" });
  let newMemberId = "";
  let oneTimeOrder = "";
  await check("33/34/38/39. new buyer, one-time primary + 2 bumps + 25% coupon, shared order id", async () => {
    jar.clear();
    const step = await configs.getStepCheckoutConfig(SA, funnelId, stepId);
    const r = await orders.startCheckout(stepConfigId, { ...buyer("new.buyer+checkout@example.com"), bumpIds: step.bumps.map((b) => b.id), couponCode: "test-coupon-25" });
    oneTimeOrder = r.orderId;
    assert.equal(r.next, "pay");
    assert.equal(r.intentType, "payment");
    assert.equal(r.totals.dueTodayCents, Math.round((49700 + 9700 + 2700) * 0.75));
    assert.ok(memberCookie(), "new buyer is signed in on this device");
    const order = (await db.doc(`checkoutOrders/${r.orderId}`).get()).data()!;
    newMemberId = order.memberId;
    const ps = await purchasesOf(r.orderId);
    assert.equal(ps.length, 3);
    assert.ok(ps.every((p) => p.purchase?.orderId === r.orderId && p.purchase?.status === "pending"));
  });
  await check("28. an unpaid checkout does not use up the coupon", async () => {
    const res = await orders.completeOrder(oneTimeOrder, { source: "client" });
    assert.equal(res.status, "processing");
    assert.equal((await db.doc(`coupons/${c25}`).get()).data()!.redemptionCount, 0);
  });
  await check("40/44/45/46/47. paying grants each Offer separately (course, booking, project, Community)", async () => {
    await pay(oneTimeOrder);
    const res = await orders.completeOrder(oneTimeOrder, { source: "client" });
    assert.equal(res.status, "paid");
    const ps = await purchasesOf(oneTimeOrder);
    assert.ok(ps.every((p) => p.purchase?.status === "paid"));
    assert.ok(await enrollment("c1", newMemberId), "primary course enrolled");
    assert.ok(await enrollment("c3", newMemberId), "bump course enrolled");
    const primary = ps.find((p) => p.offerId === "primaryOne")!.purchase!;
    assert.equal(primary.booking.sessionCount, 2, "booking entitlement snapshotted");
    const projects = await db.collection("projects").where("subAccountId", "==", SA).get();
    assert.ok(projects.size >= 1, "client project created");
    const membership = await db.doc(`subAccounts/${SA}/communityGroups/g1/memberships/${newMemberId}`).get();
    assert.equal(membership.data()?.status, "active", "Community membership granted");
  });
  await check("29. successful checkout consumes the coupon exactly once", async () => {
    assert.equal((await db.doc(`coupons/${c25}`).get()).data()!.redemptionCount, 1);
  });
  await check("41. a webhook retry does not grant or redeem twice", async () => {
    const pi = (await db.doc(`checkoutOrders/${oneTimeOrder}`).get()).data()!.stripePaymentIntentId;
    await orders.handleCheckoutOrderPaymentIntent(await stripe.paymentIntents.retrieve(pi), null);
    await orders.completeOrder(oneTimeOrder, { source: "client" });
    assert.equal((await db.doc(`coupons/${c25}`).get()).data()!.redemptionCount, 1);
    const grants = await db.collection(`subAccounts/${SA}/communityGroups/g1/memberships/${newMemberId}/levelGrants`).get().catch(() => null);
    if (grants) assert.ok(grants.size <= 1);
  });
  await check("50. a webhook from another Stripe account is refused for this order", async () => {
    await assert.rejects(orders.completeOrder(oneTimeOrder, { source: "webhook", eventAccountId: "acct_someone_else" }), (e: unknown) => e instanceof CheckoutError);
  });
  await check("31/32. a returning buyer pays without signing in; existing member reused, nothing changed", async () => {
    jar.clear();
    const before = (await db.doc(`subAccounts/${SA}/members/${newMemberId}`).get()).data()!;
    const r = await orders.startCheckout(stepConfigId, { name: "Someone Else", email: "NEW.BUYER+checkout@example.com", agreementAccepted: true });
    const order = (await db.doc(`checkoutOrders/${r.orderId}`).get()).data()!;
    assert.equal(order.memberId, newMemberId);
    assert.equal(order.matchedExistingMember, true);
    assert.equal(memberCookie(), undefined, "no session is created for a matched email");
    const after = (await db.doc(`subAccounts/${SA}/members/${newMemberId}`).get()).data()!;
    assert.equal(after.displayName, before.displayName, "profile unchanged");
    assert.equal(r.next, "pay");
  });
  await check("24. per-customer limit is enforced at payment time", async () => {
    jar.clear();
    const r = await orders.startCheckout(stepConfigId, { ...buyer("limit+checkout@example.com"), couponCode: "TEST-ONCE-PP" });
    await pay(r.orderId);
    await orders.completeOrder(r.orderId, { source: "client" });
    await assert.rejects(orders.startCheckout(stepConfigId, { ...buyer("limit+checkout@example.com"), couponCode: "TEST-ONCE-PP" }), (e: unknown) => e instanceof CheckoutError && e.code === "coupon");
  });

  // Point the step at a recurring primary for the subscription scenarios.
  const useStep = async (primaryOfferId: string, bumpOffers: string[]) => {
    const c = await save({ primaryOfferId, bumps: bumpOffers.map((offerId) => ({ offerId })), couponsEnabled: true });
    return c.bumps.map((b) => b.id);
  };
  let recOrder = "";
  let recMember = "";
  await check("35/36. recurring primary + one-time bump in one payment", async () => {
    jar.clear();
    const bumpIds = await useStep("primaryRec", ["bumpOverlap", "bumpA"]);
    const r = await orders.startCheckout(stepConfigId, { ...buyer("rec+checkout@example.com"), bumpIds });
    recOrder = r.orderId;
    assert.equal(r.totals.dueTodayCents, 9700 + 1500 + 2700);
    assert.equal(r.intentType, "payment");
    await pay(r.orderId);
    assert.equal((await orders.completeOrder(r.orderId, { source: "client" })).status, "paid");
    const ps = await purchasesOf(r.orderId);
    const primary = ps.find((p) => p.offerId === "primaryRec")!.purchase!;
    assert.ok(primary.stripeSubscriptionId, "primary purchase holds the subscription");
    assert.ok(ps.filter((p) => p.offerId !== "primaryRec").every((p) => p.purchase?.stripeSubscriptionId === null), "bumps have no subscription");
    recMember = (await db.doc(`checkoutOrders/${r.orderId}`).get()).data()!.memberId;
  });
  await check("42/43. cancelling the subscription revokes only the recurring purchase", async () => {
    const order = (await db.doc(`checkoutOrders/${recOrder}`).get()).data()!;
    const sub = await stripe.subscriptions.cancel(order.stripeSubscriptionId);
    await handleCourseOfferSubscriptionDeleted(sub);
    const ps = await purchasesOf(recOrder);
    assert.equal(ps.find((p) => p.offerId === "primaryRec")!.purchase!.status, "canceled");
    assert.ok(ps.filter((p) => p.offerId !== "primaryRec").every((p) => p.purchase?.status === "paid"));
    assert.equal((await enrollment("c3", recMember))?.accessExpiresAt ?? null, null, "bump-only course untouched");
    assert.equal((await enrollment("c2", recMember))?.accessExpiresAt ?? null, null, "course also owned via the bump keeps access");
  });
  await check("37. trial primary + one-time bump: bump charged now, plan after the trial", async () => {
    jar.clear();
    const bumpIds = await useStep("primaryTrial", ["bumpA"]);
    const r = await orders.startCheckout(stepConfigId, { ...buyer("trial+checkout@example.com"), bumpIds, couponCode: "TEST-COUPON-25" });
    assert.equal(r.totals.dueTodayCents, Math.round(2700 * 0.75));
    assert.equal(r.totals.recurring?.trialDays, 7);
    await pay(r.orderId);
    assert.equal((await orders.completeOrder(r.orderId, { source: "client" })).status, "paid");
    const sub = await stripe.subscriptions.retrieve((await db.doc(`checkoutOrders/${r.orderId}`).get()).data()!.stripeSubscriptionId);
    assert.equal(sub.status, "trialing");
    const next = await stripe.invoices.createPreview({ subscription: sub.id });
    assert.equal(next.amount_due, 9700 - Math.round(9700 * 0.25), "first plan payment after the trial is discounted once");
    await stripe.subscriptions.cancel(sub.id);
  });
  await check("trial primary with nothing due: card saved, order completes only after the card is confirmed", async () => {
    jar.clear();
    await useStep("primaryTrial", []);
    const r = await orders.startCheckout(stepConfigId, buyer("trial-only+checkout@example.com"));
    assert.equal(r.intentType, "setup");
    const o = (await db.doc(`checkoutOrders/${r.orderId}`).get()).data()!;
    const si = await stripe.setupIntents.retrieve(o.stripeSetupIntentId);
    // Deferred Elements collects with automatic payment methods; Stripe refuses
    // to confirm that against an intent with fixed payment_method_types (the
    // subscription's own pending_setup_intent), so ours must be automatic.
    assert.equal(si.automatic_payment_methods?.enabled, true, "setup intent uses automatic payment methods");
    assert.equal(si.metadata?.orderId, r.orderId);
    assert.equal(si.usage, "off_session");
    assert.equal((await orders.completeOrder(r.orderId, { source: "client" })).status, "processing", "not complete before the card is saved");
    await pay(r.orderId);
    assert.equal((await orders.completeOrder(r.orderId, { source: "client" })).status, "paid");
    const sub = await stripe.subscriptions.retrieve(o.stripeSubscriptionId);
    assert.ok(sub.default_payment_method, "saved card becomes the subscription default so the trial converts");
    await stripe.subscriptions.cancel(o.stripeSubscriptionId);
  });
  await check("48. a free Offer still works with no Stripe at all", async () => {
    jar.clear();
    await useStep("freeOne", []);
    const r = await orders.startCheckout(stepConfigId, buyer("free+checkout@example.com"));
    assert.equal(r.next, "redirect");
    const order = (await db.doc(`checkoutOrders/${r.orderId}`).get()).data()!;
    assert.equal(order.status, "paid");
    assert.equal(order.paymentMode, null);
    assert.ok(await enrollment("c1", order.memberId));
  });
  await check("49. a 100% coupon on a one-time order needs no payment and never goes negative", async () => {
    jar.clear();
    const bumpIds = await useStep("primaryOne", ["bumpA"]);
    const r = await orders.startCheckout(stepConfigId, { ...buyer("free100+checkout@example.com"), bumpIds, couponCode: "TEST-FREE-100" });
    assert.equal(r.totals.dueTodayCents, 0);
    assert.equal(r.next, "redirect");
    const ps = await purchasesOf(r.orderId);
    assert.ok(ps.every((p) => p.purchase?.status === "paid" && p.purchase?.method === "free"));
  });
  console.log("\nPhase 2 — public checkout behaviour");
  await check("12/13. quote describes the coupon effect (whole order vs main offer only)", async () => {
    await coupons.createCoupon({ subAccountId: SA, uid: UID, body: { code: "TEST-MAIN-ONLY", percentOff: 50, includeOrderBumps: false } });
    const bumpIds = await useStep("primaryOne", ["bumpA"]);
    const all = await orders.quoteCheckout(stepConfigId, { bumpIds, couponCode: "TEST-COUPON-25" });
    assert.ok(all.coupon && all.coupon.applied && /whole order/.test(all.coupon.scope));
    assert.equal(all.totals.lines[1].discountCents, Math.round(2700 * 0.25));
    const main = await orders.quoteCheckout(stepConfigId, { bumpIds, couponCode: "TEST-MAIN-ONLY" });
    assert.ok(main.coupon && main.coupon.applied && /add-ons stay full price/.test(main.coupon.scope));
    assert.equal(main.totals.lines[1].discountCents, 0, "bump stays full price");
  });
  await check("11. invalid coupon is rejected in the quote with a buyer message", async () => {
    const q = await orders.quoteCheckout(stepConfigId, { couponCode: "NOPE-NOPE" });
    assert.ok(q.coupon && !q.coupon.applied && /isn't valid/.test(q.coupon.message));
  });
  await check("41. a bump that went stale is dropped from the quote and refused at payment", async () => {
    const bumpIds = await useStep("primaryOne", ["bumpA", "bumpB"]);
    await db.doc(`subAccounts/${SA}/courseOffers/bumpB`).update({ visibility: "archived" });
    const q = await orders.quoteCheckout(stepConfigId, { bumpIds });
    assert.deepEqual(q.removedBumpIds, [bumpIds[1]]);
    assert.equal(q.totals.lines.length, 2);
    jar.clear();
    await assert.rejects(orders.startCheckout(stepConfigId, { ...buyer("stale+checkout@example.com"), bumpIds }), (e: unknown) => e instanceof CheckoutError && e.code === "stale_bump");
    await db.doc(`subAccounts/${SA}/courseOffers/bumpB`).update({ visibility: "published" });
  });
  await check("40. a primary Offer that went stale reads as unavailable", async () => {
    await db.doc(`subAccounts/${SA}/courseOffers/primaryOne`).update({ visibility: "draft" });
    await assert.rejects(orders.quoteCheckout(stepConfigId, {}), (e: unknown) => e instanceof CheckoutError && e.code === "unavailable");
    await db.doc(`subAccounts/${SA}/courseOffers/primaryOne`).update({ visibility: "published" });
  });
  await check("42. a coupon that expires between quote and payment is refused at submit", async () => {
    const c = await coupons.createCoupon({ subAccountId: SA, uid: UID, body: { code: "TEST-EXPIRING", percentOff: 10 } });
    await useStep("primaryOne", []);
    const q = await orders.quoteCheckout(stepConfigId, { couponCode: "TEST-EXPIRING" });
    assert.ok(q.coupon?.applied);
    await db.doc(`coupons/${c.id}`).update({ expiresAt: Date.now() - 1000 });
    jar.clear();
    await assert.rejects(orders.startCheckout(stepConfigId, { ...buyer("expiring+checkout@example.com"), couponCode: "TEST-EXPIRING" }), (e: unknown) => e instanceof CheckoutError && e.code === "coupon");
  });
  await check("43/44. declined card leaves the order unpaid; a retry cancels it and succeeds", async () => {
    jar.clear();
    await useStep("primaryOne", []);
    const first = await orders.startCheckout(stepConfigId, buyer("declined+checkout@example.com"));
    const o1 = (await db.doc(`checkoutOrders/${first.orderId}`).get()).data()!;
    createdCustomers.add(o1.stripeCustomerId);
    await assert.rejects(stripe.paymentIntents.confirm(o1.stripePaymentIntentId, { payment_method: "pm_card_chargeDeclined", return_url: "https://example.com/r" }));
    assert.equal((await orders.completeOrder(first.orderId, { source: "client" })).status, "processing");
    const retry = await orders.startCheckout(stepConfigId, { ...buyer("declined+checkout@example.com"), replacesOrderId: first.orderId });
    const old = (await db.doc(`checkoutOrders/${first.orderId}`).get()).data()!;
    assert.equal(old.status, "canceled", "the declined attempt is cancelled");
    const oldPi = await stripe.paymentIntents.retrieve(o1.stripePaymentIntentId);
    assert.equal(oldPi.status, "canceled");
    await pay(retry.orderId);
    assert.equal((await orders.completeOrder(retry.orderId, { source: "client" })).status, "paid");
  });
  await check("a retry can't cancel someone else's order", async () => {
    jar.clear();
    const victim = await orders.startCheckout(stepConfigId, buyer("victim+checkout@example.com"));
    createdCustomers.add((await db.doc(`checkoutOrders/${victim.orderId}`).get()).data()!.stripeCustomerId);
    jar.clear();
    const other = await orders.startCheckout(stepConfigId, { ...buyer("attacker+checkout@example.com"), replacesOrderId: victim.orderId });
    createdCustomers.add((await db.doc(`checkoutOrders/${other.orderId}`).get()).data()!.stripeCustomerId);
    assert.equal((await db.doc(`checkoutOrders/${victim.orderId}`).get()).data()!.status, "pending");
  });
  await check("38. free Offer + paid bump takes payment for the bump only", async () => {
    jar.clear();
    const bumpIds = await useStep("freeOne", ["bumpA"]);
    const r = await orders.startCheckout(stepConfigId, { ...buyer("freebump+checkout@example.com"), bumpIds });
    assert.equal(r.next, "pay");
    assert.equal(r.totals.dueTodayCents, 2700);
    await pay(r.orderId);
    assert.equal((await orders.completeOrder(r.orderId, { source: "client" })).status, "paid");
    const ps = await purchasesOf(r.orderId);
    assert.ok(ps.every((p) => p.purchase?.status === "paid"));
    assert.equal(ps.find((p) => p.offerId === "freeOne")!.purchase!.method, "free");
  });
  await check("27/35. recurring without trial + multi-payment coupon: Stripe charges exactly the quote", async () => {
    jar.clear();
    const bumpIds = await useStep("primaryRec", ["bumpA"]);
    const r = await orders.startCheckout(stepConfigId, { ...buyer("recrep+checkout@example.com"), bumpIds, couponCode: "TEST-REP-MO" });
    assert.equal(r.totals.dueTodayCents, 9700 - 970 + 2700 - 270);
    assert.equal(r.totals.recurring?.discountedPayments, 3);
    await pay(r.orderId);
    assert.equal((await orders.completeOrder(r.orderId, { source: "client" })).status, "paid");
    const sub = await stripe.subscriptions.retrieve((await db.doc(`checkoutOrders/${r.orderId}`).get()).data()!.stripeSubscriptionId);
    const next = await stripe.invoices.createPreview({ subscription: sub.id });
    assert.equal(next.amount_due, 9700 - 970, "second payment still discounted");
    await stripe.subscriptions.cancel(sub.id);
  });
  await check("unpublished funnel checkout is not available to buyers", async () => {
    await db.doc(`funnels/${funnelId}`).update({ status: "draft" });
    await assert.rejects(orders.startCheckout(stepConfigId, buyer("x+checkout@example.com")), (e: unknown) => e instanceof CheckoutError && e.status === 404);
  });

  for (const id of createdCustomers) await stripe.customers.del(id).catch(() => undefined);
  void tag;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

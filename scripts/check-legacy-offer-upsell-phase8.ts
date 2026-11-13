/**
 * Phase 8 legacy Offer Upsell safety checks.
 *
 * Firestore emulator + localhost-only Stripe mock. No production credentials,
 * Stripe calls, real charges, or customer/workspace fixtures.
 *
 * Run:
 *   firebase emulators:exec --config /tmp/phase8.json --only firestore --project demo-phase8-legacy \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx --tsconfig ./tsconfig.json scripts/check-legacy-offer-upsell-phase8.ts"
 */
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { initializeApp } from "firebase-admin/app";

const project = process.env.GCLOUD_PROJECT ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !project.startsWith("demo-") || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error("Refusing to run outside a demo Firestore emulator without production credentials.");
}
process.env.FIREBASE_ADMIN_PROJECT_ID ??= project;
for (const key of ["STRIPE_SECRET_KEY_TEST", "STRIPE_SECRET_KEY_LIVE", "STRIPE_PUBLISHABLE_KEY_TEST", "STRIPE_PUBLISHABLE_KEY_LIVE"]) delete process.env[key];
process.env.STRIPE_SECRET_KEY = "sk_test_phase8_local_mock";
process.env.STRIPE_LOCAL_MOCK_URL = "http://127.0.0.1:1";

const calls = { paymentIntents: 0, subscriptions: 0, accounts: [] as string[], idempotencyKeys: [] as string[] };
const idempotent = new Map<string, Record<string, unknown>>();
let sequence = 0;
const server = http.createServer((req, res) => {
  const account = String(req.headers["stripe-account"] ?? "platform");
  const key = String(req.headers["idempotency-key"] ?? "");
  calls.accounts.push(account);
  if (key) calls.idempotencyKeys.push(key);
  let raw = "";
  req.on("data", (chunk) => { raw += chunk; });
  req.on("end", async () => {
    const body = new URLSearchParams(raw);
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const idempotencyKey = `${account}:${req.method}:${path}:${key}`;
    const json = (status: number, value: Record<string, unknown>) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(value));
    };
    const cached = idempotent.get(idempotencyKey);
    if (cached) return json(200, cached);
    if (req.method === "GET" && path === "/v1/payment_intents/pi_trigger") {
      return json(200, { id: "pi_trigger", livemode: false, customer: "cus_legacy", payment_method: "pm_saved" });
    }
    if (req.method === "GET" && path === "/v1/payment_intents/pi_recurring") {
      return json(200, { id: "pi_recurring", livemode: false, customer: "cus_legacy", payment_method: "pm_saved" });
    }
    if (req.method === "GET" && /^\/v1\/payment_intents\/pi_upsell_/.test(path)) {
      return json(200, { id: path.split("/").pop(), livemode: false, customer: "cus_legacy", payment_method: "pm_saved", status: "succeeded" });
    }
    if (req.method === "POST" && path === "/v1/payment_intents") {
      calls.paymentIntents++;
      await new Promise((resolve) => setTimeout(resolve, 80));
      const value = { id: `pi_upsell_${++sequence}`, livemode: false, status: "succeeded", customer: body.get("customer"), payment_method: body.get("payment_method") };
      if (key) idempotent.set(idempotencyKey, value);
      return json(200, value);
    }
    if (req.method === "POST" && path === "/v1/subscriptions") {
      calls.subscriptions++;
      const value = { id: `sub_upsell_${++sequence}`, status: "active", customer: body.get("customer") };
      if (key) idempotent.set(idempotencyKey, value);
      return json(200, value);
    }
    if (req.method === "GET" && /^\/v1\/subscriptions\/sub_upsell_/.test(path)) {
      return json(200, { id: path.split("/").pop(), status: "active", customer: "cus_legacy", items: { data: [] } });
    }
    return json(404, { error: { message: `Unhandled ${req.method} ${path}` } });
  });
});

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

async function main() {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.STRIPE_LOCAL_MOCK_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  initializeApp({ projectId: project });
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const offers = await import("../src/lib/server/course-offer-upsell-service");
  const purchases = await import("../src/lib/server/course-offer-purchase-service");
  const db = getAdminDb();
  const sa = "sa_phase8";
  const agency = "ag_phase8";
  const now = new Date();
  const offer = (id: string, extra: Record<string, unknown> = {}) => db.doc(`subAccounts/${sa}/courseOffers/${id}`).set({
    subAccountId: sa, agencyId: agency, title: id, slug: id, descriptionHtml: "", courseIds: [], type: "oneTime", priceCents: 1200, currency: "USD", recurringInterval: null, trialDays: null, paymentMode: "test", priceTextOverride: null, visibility: "published", version: 1, thumbnailUrl: null, discountCodesEnabled: false, showRecentPurchasePopup: false, access: { beginAtSpecificDate: false, beginDate: null, restrictToDays: false, accessDays: null }, advanced: { customJs: "", customCss: "", headerTracking: "", footerTracking: "" }, checkoutSettings: { collectAddress: false, collectPhoneNumber: false, serviceAgreement: { mode: "notRequired", customText: "", linkUrl: "" } }, booking: null, projectTemplates: [], communityAccess: [], createdAt: now, updatedAt: now, ...extra,
  });
  await db.doc(`subAccounts/${sa}`).set({ agencyId: agency, stripeConnect: { test: { accountId: "acct_phase8", chargesEnabled: true } } });
  await db.doc(`subAccounts/${sa}/members/member_phase8`).set({ email: "qa@example.test", contactId: "contact_phase8", status: "active", displayName: "QA" });
  await db.doc("contacts/contact_phase8").set({ subAccountId: sa, agencyId: agency, name: "QA", email: "qa@example.test", tags: [] });
  await offer("trigger");
  await offer("one_time_target", { priceCents: 1900 });
  await offer("recurring_target", { type: "recurring", priceCents: 2900, recurringInterval: "month" });
  await db.doc(`subAccounts/${sa}/courseOffers/trigger/upsells/legacy`).set({ type: "oneClick", visibility: "published", targetOfferId: "one_time_target", createdAt: now, updatedAt: now });
  await db.doc(`subAccounts/${sa}/courseOffers/trigger/purchases/purchase_one`).set({ subAccountId: sa, agencyId: agency, offerId: "trigger", courseIds: [], booking: null, projectTemplates: [], communityAccess: [], memberId: "member_phase8", amountCents: 1200, currency: "USD", method: "stripe", stripeCustomerId: "cus_legacy", stripePaymentIntentId: "pi_trigger", stripeSubscriptionId: null, stripeConnectAccountId: "acct_phase8", paymentMode: "test", status: "paid", grantedByUid: null, requestedAt: now, paidAt: now });

  await check("new legacy setup is refused by the server service", async () => {
    await assert.rejects(offers.createCourseOfferUpsellServerSide({ subAccountId: sa, offerId: "trigger", type: "oneClick", targetOfferId: "one_time_target" }), /frozen/);
  });
  await check("existing legacy configuration remains readable", async () => {
    const rows = await offers.listCourseOfferUpsells(sa, "trigger");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].targetOfferId, "one_time_target");
  });
  await check("one-time upsell uses the trigger's TEST Connect account", async () => {
    const result = await purchases.chargeOneClickUpsellServerSide({ subAccountId: sa, triggerOfferId: "trigger", triggerPurchaseId: "purchase_one", targetOfferId: "one_time_target", memberId: "member_phase8" });
    assert.equal(result.ok, true);
    assert.ok(calls.accounts.includes("acct_phase8"));
    assert.equal(calls.paymentIntents, 1);
  });
  await check("double accept is durable and does not create a second charge", async () => {
    const result = await purchases.chargeOneClickUpsellServerSide({ subAccountId: sa, triggerOfferId: "trigger", triggerPurchaseId: "purchase_one", targetOfferId: "one_time_target", memberId: "member_phase8" });
    assert.equal(result.ok, true);
    assert.equal(calls.paymentIntents, 1);
    assert.equal((await db.collection(`subAccounts/${sa}/courseOffers/one_time_target/purchases`).get()).size, 1);
  });
  await check("recurring target requires explicit consent and uses a Subscription", async () => {
    await db.doc(`subAccounts/${sa}/courseOffers/trigger/upsells/legacy`).update({ targetOfferId: "recurring_target" });
    await db.doc(`subAccounts/${sa}/courseOffers/trigger/purchases/purchase_recurring`).set({ subAccountId: sa, agencyId: agency, offerId: "trigger", courseIds: [], booking: null, projectTemplates: [], communityAccess: [], memberId: "member_phase8", amountCents: 1200, currency: "USD", method: "stripe", stripeCustomerId: "cus_legacy", stripePaymentIntentId: "pi_recurring", stripeSubscriptionId: null, stripeConnectAccountId: "acct_phase8", paymentMode: "test", status: "paid", grantedByUid: null, requestedAt: now, paidAt: now });
    const noConsent = await purchases.chargeOneClickUpsellServerSide({ subAccountId: sa, triggerOfferId: "trigger", triggerPurchaseId: "purchase_recurring", targetOfferId: "recurring_target", memberId: "member_phase8" });
    assert.equal(noConsent.needsManualCheckout, true);
    const accepted = await purchases.chargeOneClickUpsellServerSide({ subAccountId: sa, triggerOfferId: "trigger", triggerPurchaseId: "purchase_recurring", targetOfferId: "recurring_target", memberId: "member_phase8", recurringConsent: true });
    assert.equal(accepted.ok, true);
    assert.equal(calls.subscriptions, 1);
    assert.equal(calls.paymentIntents, 1);
    const purchase = (await db.doc(`subAccounts/${sa}/courseOffers/recurring_target/purchases/${accepted.purchaseId}`).get()).data()!;
    assert.ok(purchase.stripeSubscriptionId);
    assert.equal(purchase.stripePaymentIntentId, null);
  });
  await check("concurrent accepts share one idempotency key and one provider charge", async () => {
    await db.doc(`subAccounts/${sa}/courseOffers/trigger/upsells/legacy`).update({ targetOfferId: "one_time_target" });
    await db.doc(`subAccounts/${sa}/courseOffers/trigger/purchases/purchase_concurrent`).set({ subAccountId: sa, agencyId: agency, offerId: "trigger", courseIds: [], booking: null, projectTemplates: [], communityAccess: [], memberId: "member_phase8", amountCents: 1200, currency: "USD", method: "stripe", stripeCustomerId: "cus_legacy", stripePaymentIntentId: "pi_trigger", stripeSubscriptionId: null, stripeConnectAccountId: "acct_phase8", paymentMode: "test", status: "paid", grantedByUid: null, requestedAt: now, paidAt: now });
    const before = calls.paymentIntents;
    const results = await Promise.all([1, 2].map(() => purchases.chargeOneClickUpsellServerSide({ subAccountId: sa, triggerOfferId: "trigger", triggerPurchaseId: "purchase_concurrent", targetOfferId: "one_time_target", memberId: "member_phase8" })));
    assert.ok(results.some((r) => r.ok), "one concurrent request must complete");
    assert.equal(calls.paymentIntents, before + 1);
  });
  console.log(`\n${passed} passed`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => server.close());

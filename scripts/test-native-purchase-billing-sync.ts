/**
 * Functional test for the native-purchase -> MyMagnetix billing-ledger fix
 * (2026-09-16): a Course Offer subscription purchase must appear in
 * MyMagnetix -> Purchases (Current subscriptions + Payment history), and
 * must stay current as Stripe reports lifecycle changes.
 *
 * Uses REAL Stripe TEST-MODE objects (a disposable Customer + Subscription
 * + PaymentIntent, using Stripe's canned test payment method
 * `pm_card_visa` — no real card, no real money, this is exactly what
 * Stripe's own test-mode tooling exists for) plus disposable Firestore
 * Contact/Member/Person fixtures under the real Test sub-account
 * (p4y0B6ZpDtE4F28RFixj) — never the real owner's Main sub-account or any
 * real customer data. Every fixture (Stripe and Firestore) is deleted/
 * canceled in a `finally` block.
 *
 * Covers this task's required lifecycle states (section 5):
 *   - active subscription -> appears in Current subscriptions, manageable
 *   - its first invoice -> appears in Payment history with a receipt/
 *     invoice URL, status "succeeded"
 *   - simulated customer.subscription.updated (cancel_at_period_end) ->
 *     ledger reflects it without changing CourseOfferPurchase's own
 *     entitlement status (that's out of scope for a status update)
 *   - simulated customer.subscription.deleted (canceled) -> ledger status
 *     flips to "canceled"
 *   - a one-time (non-subscription) PaymentIntent purchase -> appears in
 *     Payment history via metadata-only relationship resolution, with NO
 *     externalSubscriptions doc required to exist first
 *
 * Run: NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" pnpm exec tsx scripts/test-native-purchase-billing-sync.ts
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const ENV_PATH = "/Users/quianamatthews/Documents/magnetix_studios/.env.local";
for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  if (process.env[m[1]] === undefined) process.env[m[1]] = v;
}

const TEST_SUB = "p4y0B6ZpDtE4F28RFixj"; // #1001 Test sub-account

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean) {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}`);
  }
}

async function main() {
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const {
    syncNativeSubscriptionPurchaseServerSide,
    syncNativeSubscriptionStatusServerSide,
    syncNativeOneTimePurchaseServerSide,
  } = await import("../src/lib/server/native-purchase-billing-sync");
  const {
    listPersonMemberships,
    listSubscriptionsForPerson,
    listPaymentHistoryForPerson,
  } = await import("../src/lib/server/mymagnetix-service");

  const db = getAdminDb();
  const suffix = randomUUID().slice(0, 8);
  const cleanup: Array<() => Promise<unknown>> = [];

  const subSnap = await db.doc(`subAccounts/${TEST_SUB}`).get();
  const agencyId = subSnap.data()?.agencyId as string;

  try {
    // === Fixture identity ===
    const email = `qa-native-purchase-${suffix}@example.invalid`;
    const contactId = `qa-native-contact-${suffix}`;
    const memberId = `qa-native-member-${suffix}`;
    const personId = `qa-native-person-${suffix}`;

    await db.doc(`contacts/${contactId}`).set({
      subAccountId: TEST_SUB,
      agencyId,
      email,
      name: "QA Native Purchase Fixture",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    cleanup.push(() => db.doc(`contacts/${contactId}`).delete());
    await db
      .doc(`people/${personId}`)
      .set({ primaryEmail: email, createdAt: new Date() });
    cleanup.push(() => db.doc(`people/${personId}`).delete());
    await db.doc(`subAccounts/${TEST_SUB}/members/${memberId}`).set({
      subAccountId: TEST_SUB,
      agencyId,
      email,
      displayName: "QA Native Purchase Fixture",
      contactId,
      personId,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    cleanup.push(() =>
      db.doc(`subAccounts/${TEST_SUB}/members/${memberId}`).delete()
    );

    // === Real Stripe test-mode fixtures (platform account, no Connect) ===
    const customer = await stripe.customers.create({
      email,
      name: "QA Native Purchase Fixture",
    });
    cleanup.push(() => stripe.customers.del(customer.id));

    const paymentMethod = await stripe.paymentMethods.attach("pm_card_visa", {
      customer: customer.id,
    });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: paymentMethod.id },
    });

    console.log("\n=== Creating a real test-mode recurring subscription ===");
    const product = await stripe.products.create({
      name: "QA Native Fixture Plan",
    });
    cleanup.push(() => stripe.products.update(product.id, { active: false }));
    const price = await stripe.prices.create({
      currency: "usd",
      unit_amount: 1500,
      recurring: { interval: "month" },
      product: product.id,
    });
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: price.id }],
      metadata: {
        kind: "offerCharge",
        subAccountId: TEST_SUB,
        offerId: "qa-fixture-offer",
        memberId,
      },
      expand: ["latest_invoice.payments"],
    });
    cleanup.push(() =>
      stripe.subscriptions
        .cancel(subscription.id)
        .catch(() => {} /* may already be canceled by the test itself */)
    );
    check("Fixture subscription is active", subscription.status === "active");

    // === CASE: initial purchase sync ===
    console.log("\n=== syncNativeSubscriptionPurchaseServerSide ===");
    await syncNativeSubscriptionPurchaseServerSide({
      agencyId,
      subAccountId: TEST_SUB,
      memberId,
      contactId,
      personId,
      memberEmail: email,
      stripeSubscriptionId: subscription.id,
      stripeConnectAccountId: null,
      fallbackProductName: "QA Native Fixture Plan",
    });

    const memberships = await listPersonMemberships(personId);
    check(
      "Fixture Person resolves exactly one membership",
      memberships.length === 1
    );

    const subsAfterPurchase = await listSubscriptionsForPerson(
      personId,
      memberships
    );
    const found = subsAfterPurchase.find(
      (s) => s.businessName && s.status === "active"
    );
    check("Subscription appears in Current subscriptions", !!found);
    check("Amount is correct ($15.00)", found?.amountCents === 1500);
    check("Currency is correct", found?.currency === "usd");
    check("Interval is correct", found?.interval === "month");
    check(
      "Manageable (real Stripe subscription, not canceled)",
      found?.canManage === true
    );
    check(
      "Business name resolved (not a raw id)",
      !!found?.businessName && found.businessName.length > 0
    );

    const paymentsAfterPurchase = await listPaymentHistoryForPerson(
      personId,
      memberships
    );
    const firstPayment = paymentsAfterPurchase[0];
    check("First invoice appears in Payment history", !!firstPayment);
    check("Payment amount correct", firstPayment?.amountCents === 1500);
    check("Payment status succeeded", firstPayment?.status === "succeeded");
    check(
      "Receipt/invoice URL present (Stripe provided one)",
      !!(firstPayment?.invoiceHostedUrl || firstPayment?.invoicePdfUrl)
    );

    // === CASE: lifecycle update (cancel_at_period_end) ===
    console.log(
      "\n=== syncNativeSubscriptionStatusServerSide (cancel_at_period_end) ==="
    );
    const updatedSub = await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true,
    });
    await syncNativeSubscriptionStatusServerSide({
      agencyId,
      subAccountId: TEST_SUB,
      memberId,
      contactId,
      personId,
      memberEmail: email,
      stripeConnectAccountId: null,
      fallbackProductName: null,
      subscription: updatedSub,
    });
    const subsAfterUpdate = await listSubscriptionsForPerson(
      personId,
      memberships
    );
    const updatedFound = subsAfterUpdate.find((s) => s.id === found?.id);
    check(
      "cancelAtPeriodEnd is now reflected in the ledger",
      updatedFound?.cancelAtPeriodEnd === true
    );
    check(
      "Status is still 'active' (still genuinely active until period end)",
      updatedFound?.status === "active"
    );
    const custDoc = await db
      .collection("externalBillingCustomers")
      .where("externalCustomerId", "==", customer.id)
      .limit(1)
      .get();
    check(
      "Billing customer record retained its real captured name after a status-only update (never re-touched by syncNativeSubscriptionStatusServerSide)",
      custDoc.docs[0]?.data()?.name === "QA Native Purchase Fixture"
    );

    // === CASE: full cancellation ===
    console.log("\n=== syncNativeSubscriptionStatusServerSide (canceled) ===");
    const canceledSub = await stripe.subscriptions.cancel(subscription.id);
    await syncNativeSubscriptionStatusServerSide({
      agencyId,
      subAccountId: TEST_SUB,
      memberId,
      contactId,
      personId,
      memberEmail: email,
      stripeConnectAccountId: null,
      fallbackProductName: null,
      subscription: canceledSub,
    });
    const subsAfterCancel = await listSubscriptionsForPerson(
      personId,
      memberships
    );
    const canceledFound = subsAfterCancel.find((s) => s.id === found?.id);
    check(
      "Status flips to 'canceled' after full cancellation",
      canceledFound?.status === "canceled"
    );
    check(
      "No longer manageable once canceled",
      canceledFound?.canManage === false
    );

    // === CASE: one-time (non-subscription) purchase ===
    console.log("\n=== syncNativeOneTimePurchaseServerSide ===");
    const oneTimeIntent = await stripe.paymentIntents.create({
      amount: 4900,
      currency: "usd",
      customer: customer.id,
      payment_method: paymentMethod.id,
      confirm: true,
      off_session: true,
      metadata: {
        kind: "offerCharge",
        subAccountId: TEST_SUB,
        offerId: "qa-fixture-onetime-offer",
        memberId,
      },
    });
    check(
      "Fixture one-time payment succeeded",
      oneTimeIntent.status === "succeeded"
    );
    await syncNativeOneTimePurchaseServerSide({
      stripePaymentIntentId: oneTimeIntent.id,
      stripeConnectAccountId: null,
    });
    const paymentsAfterOneTime = await listPaymentHistoryForPerson(
      personId,
      memberships
    );
    const oneTimeFound = paymentsAfterOneTime.find(
      (p) => p.amountCents === 4900 && p.paymentType === "one_time"
    );
    check(
      "One-time purchase appears in Payment history via metadata-only resolution (no pre-existing subscription doc needed)",
      !!oneTimeFound
    );
    check(
      "One-time payment status succeeded",
      oneTimeFound?.status === "succeeded"
    );

    console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  } finally {
    console.log(
      "\n=== Cleaning up fixtures (Firestore + Stripe test-mode) ==="
    );
    for (const fn of cleanup.reverse()) {
      await fn().catch((err) =>
        console.warn("cleanup step failed (continuing):", err)
      );
    }
    // Also remove the ledger docs this test itself wrote — the app code's
    // own upserts are the thing under test, not meant to leave permanent
    // fixture rows behind in a real collection.
    const db2 = (await import("../src/lib/firebase/admin")).getAdminDb();
    const custQuery = await db2
      .collection("externalBillingCustomers")
      .where("subAccountId", "==", TEST_SUB)
      .where("email", "==", `qa-native-purchase-${suffix}@example.invalid`)
      .get();
    for (const doc of custQuery.docs) await doc.ref.delete();
    const subQuery = await db2
      .collection("externalSubscriptions")
      .where("subAccountId", "==", TEST_SUB)
      .where("memberId", "==", `qa-native-member-${suffix}`)
      .get();
    for (const doc of subQuery.docs) await doc.ref.delete();
    const payQuery = await db2
      .collection("externalPayments")
      .where("subAccountId", "==", TEST_SUB)
      .where("memberId", "==", `qa-native-member-${suffix}`)
      .get();
    for (const doc of payQuery.docs) await doc.ref.delete();
    console.log("Cleanup complete. No fixture data remains.");
  }

  if (fail > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FATAL", err);
    process.exit(1);
  });

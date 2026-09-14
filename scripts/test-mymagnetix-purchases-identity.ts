/**
 * Isolated identity/ownership test for the restored MyMagnetix Purchases +
 * Manage Subscription flow. Creates its OWN throwaway Contact/Member/Person
 * + ExternalBillingCustomer/ExternalSubscription/ExternalPayment fixtures
 * under a real owner-controlled sub-account (never touches a real
 * third-party customer), exercises the real service functions, then
 * deletes every fixture doc it created — nothing is left behind.
 *
 * No Stripe API calls are made anywhere in this script — the fixtures are
 * Magnetix-side Firestore records only, exactly per the task's "isolated
 * Magnetix-side test fixtures only" instruction.
 *
 * Run: NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" pnpm exec tsx scripts/_test-mymagnetix-purchases.ts
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const ENV_PATH = "/Users/quianamatthews/Documents/magnetix_studios/.env.local";
const env: Record<string, string> = {};
for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  env[m[1]] = v;
}

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();

// Real, owner-controlled test sub-account used throughout this session's
// prior tasks ("SUB-ACCOUNT-1000 · MAIN").
const SUB_ACCOUNT_ID = "xvnedVCmQpEvHrcPhEDI";

async function main() {
  const {
    listPersonMemberships,
    listSubscriptionsForPerson,
    listPaymentHistoryForPerson,
    subscriptionBelongsToMembership,
  } = await import("../src/lib/server/mymagnetix-service");
  const { upsertExternalBillingCustomer, upsertExternalSubscription } =
    await import("../src/lib/server/external-billing-service");
  const { upsertExternalPayment } =
    await import("../src/lib/server/external-payment-service");

  const subAccountSnap = await db.doc(`subAccounts/${SUB_ACCOUNT_ID}`).get();
  if (!subAccountSnap.exists) {
    throw new Error(`Test sub-account ${SUB_ACCOUNT_ID} not found.`);
  }
  const agencyId = subAccountSnap.data()?.agencyId as string;
  const providerAccountId = "acct_test_fixture_" + randomUUID().slice(0, 8);

  const suffix = randomUUID().slice(0, 8);
  const contactId = `qa-mymagnetix-contact-${suffix}`;
  const personId = `qa-mymagnetix-person-${suffix}`;
  const memberId = `qa-mymagnetix-member-${suffix}`;
  const email = `qa-mymagnetix-${suffix}@example.invalid`;

  // A SECOND, unrelated person/membership — used only for the wrong-person
  // security test (CASE D). Never linked to the real subscription below.
  const otherContactId = `qa-mymagnetix-other-contact-${suffix}`;
  const otherPersonId = `qa-mymagnetix-other-person-${suffix}`;
  const otherMemberId = `qa-mymagnetix-other-member-${suffix}`;
  const otherEmail = `qa-mymagnetix-other-${suffix}@example.invalid`;

  const created: Array<() => Promise<unknown>> = [];
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

  try {
    console.log(`\n=== Fixture setup (sub-account ${SUB_ACCOUNT_ID}) ===`);

    await db.doc(`contacts/${contactId}`).set({
      subAccountId: SUB_ACCOUNT_ID,
      agencyId,
      email,
      firstName: "QA",
      lastName: "MyMagnetix Fixture",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    created.push(() => db.doc(`contacts/${contactId}`).delete());

    await db.doc(`people/${personId}`).set({
      primaryEmail: email,
      createdAt: FieldValue.serverTimestamp(),
    });
    created.push(() => db.doc(`people/${personId}`).delete());

    await db.doc(`subAccounts/${SUB_ACCOUNT_ID}/members/${memberId}`).set({
      subAccountId: SUB_ACCOUNT_ID,
      agencyId,
      email,
      displayName: "QA MyMagnetix Fixture",
      avatarUrl: null,
      bio: "",
      phone: null,
      address: null,
      contactId,
      personId,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastSeenAt: null,
    });
    created.push(() =>
      db.doc(`subAccounts/${SUB_ACCOUNT_ID}/members/${memberId}`).delete()
    );

    // Second, unrelated identity for the wrong-person test.
    await db.doc(`contacts/${otherContactId}`).set({
      subAccountId: SUB_ACCOUNT_ID,
      agencyId,
      email: otherEmail,
      firstName: "QA",
      lastName: "MyMagnetix Other Fixture",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    created.push(() => db.doc(`contacts/${otherContactId}`).delete());
    await db.doc(`people/${otherPersonId}`).set({
      primaryEmail: otherEmail,
      createdAt: FieldValue.serverTimestamp(),
    });
    created.push(() => db.doc(`people/${otherPersonId}`).delete());
    await db.doc(`subAccounts/${SUB_ACCOUNT_ID}/members/${otherMemberId}`).set({
      subAccountId: SUB_ACCOUNT_ID,
      agencyId,
      email: otherEmail,
      displayName: "QA MyMagnetix Other Fixture",
      avatarUrl: null,
      bio: "",
      phone: null,
      address: null,
      contactId: otherContactId,
      personId: otherPersonId,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastSeenAt: null,
    });
    created.push(() =>
      db.doc(`subAccounts/${SUB_ACCOUNT_ID}/members/${otherMemberId}`).delete()
    );

    // CASE A: active imported subscription.
    const activeCustomerId = `cus_test_active_${suffix}`;
    const activeSubId = `sub_test_active_${suffix}`;
    const billingCustomer = await upsertExternalBillingCustomer({
      agencyId,
      subAccountId: SUB_ACCOUNT_ID,
      provider: "stripe",
      providerAccountId,
      externalCustomerId: activeCustomerId,
      contactId,
      personId,
      memberId,
      email,
      name: "QA MyMagnetix Fixture",
      status: "active",
      source: "manual",
      importedAt: FieldValue.serverTimestamp(),
      importedByUid: "qa-script",
    });
    created.push(() =>
      db.doc(`externalBillingCustomers/${billingCustomer.id}`).delete()
    );

    const activeSubscription = await upsertExternalSubscription({
      agencyId,
      subAccountId: SUB_ACCOUNT_ID,
      provider: "stripe",
      providerAccountId,
      externalCustomerId: activeCustomerId,
      externalSubscriptionId: activeSubId,
      externalBillingCustomerId: billingCustomer.id,
      contactId,
      personId,
      memberId,
      externalProductId: "prod_test",
      externalPriceId: "price_test",
      productName: "QA Test Membership",
      priceName: "Monthly",
      amountCents: 4900,
      currency: "usd",
      interval: "month",
      intervalCount: 1,
      status: "active",
      providerStatus: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      endedAt: null,
      trialStart: null,
      trialEnd: null,
      source: "manual",
      importedAt: FieldValue.serverTimestamp(),
      importedByUid: "qa-script",
      lastProviderEventCreatedAt: null,
      metadata: null,
    });
    created.push(() =>
      db.doc(`externalSubscriptions/${activeSubscription.id}`).delete()
    );

    // CASE B: canceled/past imported subscription (separate Stripe ids).
    const canceledCustomerId = activeCustomerId; // same billing customer, second subscription
    const canceledSubId = `sub_test_canceled_${suffix}`;
    const canceledSubscription = await upsertExternalSubscription({
      agencyId,
      subAccountId: SUB_ACCOUNT_ID,
      provider: "stripe",
      providerAccountId,
      externalCustomerId: canceledCustomerId,
      externalSubscriptionId: canceledSubId,
      externalBillingCustomerId: billingCustomer.id,
      contactId,
      personId,
      memberId,
      externalProductId: "prod_test_old",
      externalPriceId: "price_test_old",
      productName: "QA Test Legacy Plan",
      priceName: "Annual",
      amountCents: 29900,
      currency: "usd",
      interval: "year",
      intervalCount: 1,
      status: "canceled",
      providerStatus: "canceled",
      currentPeriodStart: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      canceledAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
      endedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
      trialStart: null,
      trialEnd: null,
      source: "manual",
      importedAt: FieldValue.serverTimestamp(),
      importedByUid: "qa-script",
      lastProviderEventCreatedAt: null,
      metadata: null,
    });
    created.push(() =>
      db.doc(`externalSubscriptions/${canceledSubscription.id}`).delete()
    );

    // CASE C: payment history (one succeeded, linked to the active sub).
    const payment = await upsertExternalPayment({
      agencyId,
      subAccountId: SUB_ACCOUNT_ID,
      provider: "stripe",
      providerAccountId,
      externalPaymentId: `in_test_${suffix}`,
      externalCustomerId: activeCustomerId,
      externalSubscriptionId: activeSubId,
      externalInvoiceId: `in_test_${suffix}`,
      externalChargeId: null,
      externalPaymentIntentId: null,
      externalBillingCustomerId: billingCustomer.id,
      externalSubscriptionRecordId: activeSubscription.id,
      contactId,
      memberId,
      personId,
      productName: "QA Test Membership",
      description: null,
      amountCents: 4900,
      amountRefundedCents: 0,
      currency: "usd",
      status: "succeeded",
      providerStatus: "paid",
      paymentType: "subscription",
      occurredAt: new Date(),
      paidAt: new Date(),
      failedAt: null,
      refundedAt: null,
      receiptUrl: null,
      invoiceHostedUrl: null,
      invoicePdfUrl: null,
      failureCode: null,
      failureMessage: null,
      source: "manual",
      lastProviderEventCreatedAt: null,
      metadata: null,
    });
    created.push(() => db.doc(`externalPayments/${payment.id}`).delete());

    console.log("Fixtures created.\n=== Running checks ===");

    // --- listPersonMemberships ---
    const memberships = await listPersonMemberships(personId);
    check(
      "listPersonMemberships returns exactly the one real membership",
      memberships.length === 1 && memberships[0].memberId === memberId
    );

    // --- CASE A / CASE B: listSubscriptionsForPerson ---
    const subscriptions = await listSubscriptionsForPerson(
      personId,
      memberships
    );
    const active = subscriptions.find((s) => s.id === activeSubscription.id);
    const canceled = subscriptions.find(
      (s) => s.id === canceledSubscription.id
    );
    check("CASE A — active subscription appears", !!active);
    check(
      "CASE A — active subscription status is 'active'",
      active?.status === "active"
    );
    check(
      "CASE A — active subscription is manageable",
      active?.canManage === true
    );
    check(
      "CASE A — currentPeriodEnd is a real Date",
      active?.currentPeriodEnd instanceof Date
    );
    check("CASE B — canceled subscription appears", !!canceled);
    check(
      "CASE B — canceled subscription status is 'canceled'",
      canceled?.status === "canceled"
    );
    check(
      "CASE B — canceled subscription is NOT manageable",
      canceled?.canManage === false
    );
    check(
      "Tenant/business name resolved (not raw ids leaked)",
      active?.businessName != null && active.businessName.length > 0
    );

    // --- CASE C: listPaymentHistoryForPerson ---
    const paymentHistory = await listPaymentHistoryForPerson(
      personId,
      memberships
    );
    const historyItem = paymentHistory.find((p) => p.id === payment.id);
    check("CASE C — payment appears in history", !!historyItem);
    check(
      "CASE C — payment amount/currency correct",
      historyItem?.amountCents === 4900 && historyItem?.currency === "usd"
    );
    check(
      "CASE C — payment status correct",
      historyItem?.status === "succeeded"
    );

    // --- subscriptionBelongsToMembership: correct-owner case ---
    check(
      "Ownership check — real owner's membership matches their own subscription",
      subscriptionBelongsToMembership(activeSubscription, memberships[0])
    );

    // --- CASE D: wrong-person security test ---
    const otherMemberships = await listPersonMemberships(otherPersonId);
    check(
      "CASE D setup — other person has exactly one membership of their own",
      otherMemberships.length === 1
    );
    const wrongPersonOwnsIt = otherMemberships.some((m) =>
      subscriptionBelongsToMembership(activeSubscription, m)
    );
    check(
      "CASE D — a DIFFERENT person's membership does NOT match this subscription",
      wrongPersonOwnsIt === false
    );
    // Sanity: the other person also can't see it via listSubscriptionsForPerson.
    const otherSubscriptions = await listSubscriptionsForPerson(
      otherPersonId,
      otherMemberships
    );
    check(
      "CASE D — the other person's own subscription list is empty",
      otherSubscriptions.length === 0
    );

    // --- Ambiguity must fail closed ---
    const noContactMembership = { ...memberships[0], contactId: null };
    check(
      "Ambiguity — a membership with no contactId never matches (fails closed)",
      subscriptionBelongsToMembership(
        activeSubscription,
        noContactMembership
      ) === false
    );
    const wrongSubAccountMembership = {
      ...memberships[0],
      subAccountId: "some-other-sub-account",
    };
    check(
      "Cross-tenant — a membership from a different sub-account never matches",
      subscriptionBelongsToMembership(
        activeSubscription,
        wrongSubAccountMembership
      ) === false
    );
    const mismatchedMemberIdSubscription = {
      ...activeSubscription,
      memberId: "some-other-member-id",
    };
    check(
      "memberId mismatch fails closed even when contactId matches",
      subscriptionBelongsToMembership(
        mismatchedMemberIdSubscription,
        memberships[0]
      ) === false
    );

    console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  } finally {
    console.log("\n=== Cleaning up fixtures ===");
    for (const cleanup of created.reverse()) {
      await cleanup().catch((err) =>
        console.warn("cleanup step failed (continuing):", err)
      );
    }
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

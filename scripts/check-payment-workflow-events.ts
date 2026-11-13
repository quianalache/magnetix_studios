/**
 * CRM Foundations Batch C — payment & subscription workflow triggers, against
 * the Firestore EMULATOR. Stripe-shaped event fixtures go through the REAL
 * processing path (classification → account-scoped contact resolution →
 * persisted idempotency → workflow engine enrollment), plus the verified
 * webhook route itself (forged signature refused; a correctly signed event
 * reaches enrollment). No Stripe API calls are possible: the module makes
 * none, and the key below is a dummy that never leaves the process (the
 * route only uses it to verify a locally generated signature). QStash, email
 * and SMS are blanked, so nothing can be sent or scheduled.
 *
 * Run (from the repo root):
 *   echo '{"emulators":{"firestore":{"port":8085},"ui":{"enabled":false}}}' > /tmp/emu/firebase.json
 *   firebase emulators:exec --config /tmp/emu/firebase.json --only firestore --project demo-pay \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx --tsconfig ./tsconfig.json scripts/check-payment-workflow-events.ts"
 */
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import type Stripe from "stripe";

const PROJECT = process.env.GCLOUD_PROJECT ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !PROJECT.startsWith("demo-") || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Refusing to run: Firestore emulator + demo-* project only, no production credentials.");
  process.exit(1);
}
process.env.FIREBASE_ADMIN_PROJECT_ID ??= PROJECT;
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= PROJECT;
for (const k of ["RESEND_API_KEY", "EMAIL_FROM", "QSTASH_TOKEN", "QSTASH_URL", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "OPENROUTER_API_KEY"]) delete process.env[k];
// Dummy, offline-only: lets the route build its client and verify a signature
// we generate locally. Nothing here can reach Stripe.
process.env.STRIPE_SECRET_KEY = "sk_test_offline_dummy_for_signature_checks";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_offline_dummy_secret";
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_offline_dummy_connect_secret";

const AG = "ag_pay";
const SA = "sa_pay"; // connected: test acct_T, live acct_L
const SA2 = "sa_pay_other"; // connected: acct_B
const ACCT = "acct_T";
let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${(err as Error).stack?.split("\n").slice(0, 4).join("\n       ")}`);
  }
}

let seq = 0;
function ev(type: string, object: unknown, opts: { account?: string | null; prev?: Record<string, unknown>; livemode?: boolean; id?: string; created?: number } = {}): Stripe.Event {
  seq++;
  return {
    id: opts.id ?? `evt_${seq}`,
    object: "event",
    type,
    account: opts.account === undefined ? ACCT : opts.account ?? undefined,
    livemode: opts.livemode ?? false,
    created: opts.created ?? 1_800_000_000 + seq,
    api_version: "2025-03-31.basil",
    pending_webhooks: 1,
    request: null,
    data: { object, ...(opts.prev ? { previous_attributes: opts.prev } : {}) },
  } as unknown as Stripe.Event;
}
const orderMeta = (orderId: string, extra: Record<string, string> = {}) => ({ kind: "checkoutOrder", orderId, subAccountId: SA, memberId: "m_known", offerId: "off_main", ...extra });
const pi = (piId: string, metadata: Record<string, string>, extra: Record<string, unknown> = {}) => ({ id: piId, object: "payment_intent", amount: 4700, amount_received: 4700, currency: "usd", status: "succeeded", latest_charge: `ch_${piId}`, metadata, ...extra });
const subInvoice = (invId: string, subId: string, reason: string, metadata: Record<string, string>, extra: Record<string, unknown> = {}) => ({
  id: invId,
  object: "invoice",
  amount_paid: 2900,
  amount_due: 2900,
  currency: "usd",
  billing_reason: reason,
  attempt_count: 1,
  metadata: {},
  parent: { type: "subscription_details", subscription_details: { subscription: subId, metadata } },
  lines: { data: [{ period: { start: 1_800_100_000, end: 1_802_700_000 } }] },
  ...extra,
});
const subscription = (subId: string, status: string, metadata: Record<string, string>, extra: Record<string, unknown> = {}) => ({
  id: subId,
  object: "subscription",
  status,
  metadata,
  customer: "cus_1",
  items: { data: [{ price: { unit_amount: 2900, currency: "usd", recurring: { interval: "month" } } }] },
  ...extra,
});
const charge = (chId: string, amountRefunded: number, metadata: Record<string, string>, extra: Record<string, unknown> = {}) => ({
  id: chId,
  object: "charge",
  amount: 2000,
  amount_refunded: amountRefunded,
  refunded: amountRefunded >= 2000,
  currency: "usd",
  payment_intent: `pi_for_${chId}`,
  metadata,
  ...extra,
});

async function main() {
  initializeApp({ projectId: PROJECT });
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const mod = await import("../src/lib/server/payment-workflow-events");
  const runsSvc = await import("../src/lib/server/workflow-runs-service");
  const db = getAdminDb();

  /* ------------------------------- seed -------------------------------- */
  const now = new Date();
  await db.doc(`agencies/${AG}`).set({ name: "Pay Agency", ownerUid: "uid_owner" });
  await db.doc(`subAccounts/${SA}`).set({ name: "Pay", agencyId: AG, createdByUid: "uid_owner", stripeConnect: { test: { accountId: "acct_T" }, live: { accountId: "acct_L" } } });
  await db.doc(`subAccounts/${SA2}`).set({ name: "Other", agencyId: AG, createdByUid: "uid_owner", stripeConnect: { test: { accountId: "acct_B" } } });
  const contact = (cid: string, sa: string, email: string, extra: Record<string, unknown> = {}) =>
    db.doc(`contacts/${cid}`).set({ name: cid, email, emailLower: email, phone: "", tags: [], subAccountId: sa, agencyId: AG, createdByUid: "uid_owner", mode: "live", territoryId: "global", createdAt: now, updatedAt: now, ...extra });
  await contact("c_known", SA, "buyer@example.com", { tags: ["VIP"] });
  await contact("c_existing", SA, "returning@example.com");
  await contact("c_other_ws", SA2, "buyer@example.com");
  await contact("c_imported", SA, "imported@example.com");
  await db.doc(`subAccounts/${SA}/members/m_known`).set({ email: "buyer@example.com", contactId: "c_known", status: "active", displayName: "Known Buyer" });
  await db.doc(`subAccounts/${SA}/members/m_unlinked_existing`).set({ email: "returning@example.com", contactId: null, status: "active", displayName: "Returning" });
  await db.doc(`subAccounts/${SA}/members/m_unlinked_new`).set({ email: "brandnew@example.com", contactId: null, status: "active", displayName: "Brand New", phone: "+15555550111" });
  await db.doc(`subAccounts/${SA2}/members/m_other`).set({ email: "buyer@example.com", contactId: "c_other_ws", status: "active" });
  await db.doc("checkoutOrders/o1").set({ subAccountId: SA, memberId: "m_known", stripeAccountId: "acct_T", items: [{ role: "primary", offerId: "off_main" }] });
  await db.doc("quotes/q1").set({ subAccountId: SA, contactId: "c_known" });
  await db.doc("externalSubscriptions/es_imported").set({
    agencyId: AG, subAccountId: SA, provider: "stripe", providerAccountId: "acct_T", externalSubscriptionId: "sub_imported", contactId: "c_imported",
    externalBillingCustomerId: null, memberId: null, personId: null, trialEnd: null,
  });
  await db.doc("externalSubscriptions/es_trial").set({
    agencyId: AG, subAccountId: SA, provider: "stripe", providerAccountId: "acct_T", externalSubscriptionId: "sub_trial", contactId: "c_known",
    externalBillingCustomerId: null, memberId: "m_known", personId: null, trialEnd: new Date(1_800_100_000 * 1000),
  });

  const TRIGGERS = ["payment.succeeded", "payment.failed", "subscription.created", "subscription.renewed", "subscription.cancelled", "subscription.paused", "refund.issued"];
  const wf = (wid: string, sa: string, type: string, extra: Record<string, unknown> = {}) =>
    db.doc(`workflows/${wid}`).set({
      id: wid, name: wid, status: "active", subAccountId: sa, agencyId: AG, createdByUid: "uid_owner", reentry: "every_time",
      trigger: { type, filters: { match: "all", all: [] } }, startNodeId: "n1",
      nodes: { n1: { id: "n1", type: "add_tag", config: { tag: "Paid" }, next: null } }, stats: { enrolled: 0, completed: 0 }, ...extra,
    });
  for (const t of TRIGGERS) await wf(`wf_${t}`, SA, t);
  await wf("wf_other_ws_payment", SA2, "payment.succeeded");
  await wf("wf_draft_payment", SA, "payment.succeeded", { status: "draft" });
  await wf("wf_offer_filtered", SA, "payment.succeeded", { trigger: { type: "payment.succeeded", offerId: "off_other", filters: { all: [] } } });
  await wf("wf_vip_only", SA, "payment.succeeded", { trigger: { type: "payment.succeeded", filters: { match: "all", all: [{ field: "tags", op: "has_tag", value: "vip" }] } } });

  const runs = async (wid: string, cid?: string) => {
    let q = db.collection("workflowRuns").where("workflowId", "==", wid);
    if (cid) q = q.where("contactId", "==", cid);
    return (await q.get()).docs.map((d) => d.data());
  };
  const eventDoc = async (key: string) => {
    const snap = await db.collection("paymentWorkflowEvents").where("key", "==", key).get();
    return snap.docs[0]?.data();
  };
  const contactCount = async (sa: string) => (await db.collection("contacts").where("subAccountId", "==", sa).get()).size;
  const handle = (e: Stripe.Event) => mod.processStripeWorkflowEvent(e);

  console.log("A. Payment triggers");
  await check("one-time checkout payment enrolls Payment succeeded with contact + context", async () => {
    const r = await handle(ev("payment_intent.succeeded", pi("pi_1", orderMeta("o1"))));
    assert.equal(r.length, 1);
    assert.equal(r[0].outcome, "delivered");
    const rs = await runs("wf_payment.succeeded", "c_known");
    assert.equal(rs.length, 1);
    const ctx = rs[0].context;
    assert.equal(ctx.eventType, "payment.succeeded");
    assert.equal(ctx.amount, 4700);
    assert.equal(ctx.currency, "usd");
    assert.equal(ctx.offerId, "off_main");
    assert.equal(ctx.orderId, "o1");
    assert.equal(ctx.stripeAccount, "acct_T");
    assert.equal(ctx.source, "stripe");
    assert.equal(ctx.livemode, false);
    const act = (await db.collection("contacts/c_known/activities").where("type", "==", "workflow_started").get()).size;
    assert.ok(act >= 1, "Batch B started activity recorded");
  });
  await check("same webhook delivered twice → one enrollment (duplicate)", async () => {
    const e = ev("payment_intent.succeeded", pi("pi_dup", orderMeta("o1")));
    const a = await handle(e);
    const b = await handle(e);
    assert.equal(a[0].outcome, "delivered");
    assert.equal(b[0].outcome, "duplicate");
    const rs = (await runs("wf_payment.succeeded", "c_known")).filter((x) => x.context.paymentIntentId === "pi_dup");
    assert.equal(rs.length, 1);
  });
  await check("concurrent deliveries of one event → exactly one enrollment", async () => {
    const e = ev("payment_intent.succeeded", pi("pi_conc", orderMeta("o1")));
    const results = await Promise.all([handle(e), handle(e), handle(e)]);
    const outcomes = results.map((r) => r[0].outcome).sort();
    assert.equal(outcomes.filter((o) => o === "delivered").length, 1, JSON.stringify(outcomes));
    const rs = (await runs("wf_payment.succeeded", "c_known")).filter((x) => x.context.paymentIntentId === "pi_conc");
    assert.equal(rs.length, 1);
  });
  await check("two separate payments by the same customer stay distinct", async () => {
    await handle(ev("payment_intent.succeeded", pi("pi_sep_a", orderMeta("o1"))));
    await handle(ev("payment_intent.succeeded", pi("pi_sep_b", orderMeta("o1"))));
    const rs = (await runs("wf_payment.succeeded", "c_known")).filter((x) => String(x.context.paymentIntentId).startsWith("pi_sep_"));
    assert.equal(rs.length, 2);
  });
  await check("failed payment: each declined attempt once; redelivery collapses", async () => {
    const fail = (attemptCharge: string) => pi("pi_fail", orderMeta("o1"), { status: "requires_payment_method", amount_received: 0, last_payment_error: { code: "card_declined", decline_code: "insufficient_funds", charge: attemptCharge } });
    const e1 = ev("payment_intent.payment_failed", fail("ch_try1"));
    assert.equal((await handle(e1))[0].outcome, "delivered");
    assert.equal((await handle(e1))[0].outcome, "duplicate");
    assert.equal((await handle(ev("payment_intent.payment_failed", fail("ch_try2"))))[0].outcome, "delivered");
    const rs = await runs("wf_payment.failed", "c_known");
    assert.equal(rs.length, 2);
    assert.equal(rs[0].context.failureCode, "insufficient_funds");
    assert.equal((await runs("wf_payment.succeeded")).filter((x) => x.context.paymentIntentId === "pi_fail").length, 0);
  });
  await check("Magnetix Invoice paid by card → Payment succeeded for the invoice's contact", async () => {
    const r = await handle(ev("payment_intent.succeeded", pi("pi_inv", { kind: "invoicePayment", agencyId: AG, subAccountId: SA, quoteId: "q1", contactId: "c_known" })));
    assert.equal(r[0].outcome, "delivered");
    assert.equal((await runs("wf_payment.succeeded", "c_known")).filter((x) => x.context.quoteId === "q1").length, 1);
  });
  await check("invoice whose contact doesn't match the quote is rejected", async () => {
    const r = await handle(ev("payment_intent.succeeded", pi("pi_inv_bad", { kind: "invoicePayment", subAccountId: SA, quoteId: "q1", contactId: "c_existing" })));
    assert.equal(r[0].outcome, "rejected");
  });
  const subMeta = { kind: "checkoutOrder", orderId: "o1", subAccountId: SA, memberId: "m_known", offerId: "off_main" };
  await check("initial subscription invoice = Payment succeeded only (not a renewal)", async () => {
    const r = await handle(ev("invoice.paid", subInvoice("in_first", "sub_1", "subscription_create", subMeta)));
    assert.deepEqual(r.map((x) => x.type), ["payment.succeeded"]);
    assert.equal((await runs("wf_subscription.renewed")).length, 0);
  });
  await check("renewal invoice = Payment succeeded + Subscription renewed; its PaymentIntent adds nothing", async () => {
    const r = await handle(ev("invoice.paid", subInvoice("in_cycle", "sub_1", "subscription_cycle", subMeta)));
    assert.deepEqual(r.map((x) => `${x.type}:${x.outcome}`).sort(), ["payment.succeeded:delivered", "subscription.renewed:delivered"]);
    // The same payment's PaymentIntent (no Magnetix kind on subscription PIs).
    const piEvt = await handle(ev("payment_intent.succeeded", pi("pi_cycle", {})));
    assert.equal(piEvt.length, 0);
    assert.equal((await runs("wf_subscription.renewed", "c_known")).length, 1);
    // Redelivery of the invoice event.
    const again = await handle(ev("invoice.paid", subInvoice("in_cycle", "sub_1", "subscription_cycle", subMeta)));
    assert.ok(again.every((x) => x.outcome === "duplicate"));
  });
  await check("first charge after a free trial is not reported as a renewal", async () => {
    const r = await handle(ev("invoice.paid", subInvoice("in_trial_end", "sub_trial", "subscription_cycle", subMeta)));
    const byType = Object.fromEntries(r.map((x) => [x.type, x]));
    assert.equal(byType["payment.succeeded"].outcome, "delivered");
    assert.equal(byType["subscription.renewed"].outcome, "skipped");
    assert.equal(byType["subscription.renewed"].reason, "trial_conversion_not_renewal");
  });
  await check("failed renewal = Payment failed (never a cancellation); retried attempt is a new event", async () => {
    const r1 = await handle(ev("invoice.payment_failed", subInvoice("in_fail", "sub_1", "subscription_cycle", subMeta, { attempt_count: 1 })));
    const r2 = await handle(ev("invoice.payment_failed", subInvoice("in_fail", "sub_1", "subscription_cycle", subMeta, { attempt_count: 2 })));
    assert.equal(r1[0].outcome, "delivered");
    assert.equal(r2[0].outcome, "delivered");
    assert.equal((await runs("wf_subscription.cancelled")).length, 0);
    assert.equal((await runs("wf_payment.failed")).filter((x) => x.context.invoiceId === "in_fail").length, 2);
  });
  await check("partial refunds are separate events; redelivery doesn't repeat; full refund flagged", async () => {
    const m = orderMeta("o1");
    const p1 = await handle(ev("charge.refunded", charge("ch_r", 500, m), { prev: { amount_refunded: 0, refunded: false } }));
    const p1dup = await handle(ev("charge.refunded", charge("ch_r", 500, m), { prev: { amount_refunded: 0, refunded: false } }));
    const p2 = await handle(ev("charge.refunded", charge("ch_r", 2000, m), { prev: { amount_refunded: 500 } }));
    assert.equal(p1[0].outcome, "delivered");
    assert.equal(p1dup[0].outcome, "duplicate");
    assert.equal(p2[0].outcome, "delivered");
    const rs = (await runs("wf_refund.issued", "c_known")).sort((a, b) => Number(a.context.amountRefunded) - Number(b.context.amountRefunded));
    assert.equal(rs.length, 2);
    assert.equal(rs[0].context.refundAmount, 500);
    assert.equal(rs[0].context.fullyRefunded, false);
    assert.equal(rs[1].context.refundAmount, 1500);
    assert.equal(rs[1].context.fullyRefunded, true);
  });

  console.log("B. Subscriptions");
  await check("subscription created (active) fires once; redelivery doesn't repeat", async () => {
    const e = ev("customer.subscription.created", subscription("sub_new", "active", subMeta));
    assert.equal((await handle(e))[0].outcome, "delivered");
    assert.equal((await handle(e))[0].outcome, "duplicate");
    assert.equal((await runs("wf_subscription.created")).filter((x) => x.context.subscriptionId === "sub_new").length, 1);
  });
  await check("incomplete subscription isn't 'created' until it activates — then exactly once", async () => {
    assert.equal((await handle(ev("customer.subscription.created", subscription("sub_inc", "incomplete", subMeta)))).length, 0);
    const up = await handle(ev("customer.subscription.updated", subscription("sub_inc", "active", subMeta), { prev: { status: "incomplete" } }));
    assert.equal(up[0].type, "subscription.created");
    assert.equal(up[0].outcome, "delivered");
    const upAgain = await handle(ev("customer.subscription.updated", subscription("sub_inc", "active", subMeta), { prev: { status: "incomplete" } }));
    assert.equal(upAgain[0].outcome, "duplicate");
  });
  await check("cancellation scheduled ≠ cancelled; actual end fires Subscription cancelled", async () => {
    const sched = await handle(ev("customer.subscription.updated", subscription("sub_c", "active", subMeta, { cancel_at_period_end: true }), { prev: { cancel_at_period_end: false } }));
    assert.equal(sched.length, 0);
    const pastDue = await handle(ev("customer.subscription.updated", subscription("sub_c", "past_due", subMeta), { prev: { status: "active" } }));
    assert.equal(pastDue.length, 0, "dunning is neither a pause nor a cancellation");
    const done = await handle(ev("customer.subscription.deleted", subscription("sub_c", "canceled", subMeta)));
    assert.equal(done[0].type, "subscription.cancelled");
    assert.equal(done[0].outcome, "delivered");
    assert.equal((await handle(ev("customer.subscription.deleted", subscription("sub_never", "incomplete_expired", subMeta)))).length, 0);
  });
  await check("paused fires on the transition; an older out-of-order pause is ignored", async () => {
    const p = await handle(ev("customer.subscription.updated", subscription("sub_p", "paused", subMeta), { prev: { status: "active" }, created: 1_900_000_100 }));
    assert.equal(p[0].outcome, "delivered");
    // A later resume was processed (watermark moves) …
    await handle(ev("customer.subscription.updated", subscription("sub_p", "active", subMeta), { prev: { status: "paused" }, created: 1_900_000_300 }));
    await handle(ev("customer.subscription.deleted", subscription("sub_p", "canceled", subMeta), { created: 1_900_000_400 }));
    // … then an OLDER pause event arrives late.
    const stale = await handle(ev("customer.subscription.updated", subscription("sub_p", "paused", subMeta), { prev: { status: "active" }, created: 1_900_000_200 }));
    assert.equal(stale[0].outcome, "skipped");
    assert.equal(stale[0].reason, "stale_subscription_event");
    assert.equal((await runs("wf_subscription.paused")).length, 1);
  });

  console.log("C. Contacts");
  await check("purchaser with no Contact link + existing Contact by email → linked, no duplicate", async () => {
    const before = await contactCount(SA);
    const r = await handle(ev("payment_intent.succeeded", pi("pi_link", { kind: "offerCharge", subAccountId: SA, memberId: "m_unlinked_existing", offerId: "off_main" })));
    assert.equal(r[0].outcome, "delivered");
    assert.equal(r[0].contactId, "c_existing");
    assert.equal(await contactCount(SA), before);
    assert.equal((await db.doc(`subAccounts/${SA}/members/m_unlinked_existing`).get()).data()?.contactId, "c_existing");
  });
  await check("new purchaser → one Contact created from the checkout Member; repeat purchase reuses it", async () => {
    const before = await contactCount(SA);
    const meta = { kind: "offerCharge", subAccountId: SA, memberId: "m_unlinked_new", offerId: "off_main" };
    const [a, b] = await Promise.all([handle(ev("payment_intent.succeeded", pi("pi_new_a", meta))), handle(ev("payment_intent.succeeded", pi("pi_new_b", meta)))]);
    const ok = [a[0], b[0]].filter((x) => x.outcome === "delivered");
    // Both payments must eventually land on the same single Contact (one may wait for the link lock and is retried).
    if (ok.length < 2) {
      for (const d of (await db.collection("paymentWorkflowEvents").where("status", "==", "awaiting_contact").get()).docs) await d.ref.update({ nextAttemptAt: 0 });
      await mod.retryPendingPaymentWorkflowEvents();
    }
    assert.equal(await contactCount(SA), before + 1);
    const linked = (await db.doc(`subAccounts/${SA}/members/m_unlinked_new`).get()).data()?.contactId;
    const c = (await db.doc(`contacts/${linked}`).get()).data();
    assert.equal(c?.email, "brandnew@example.com");
    assert.equal(c?.name, "Brand New");
    assert.equal(c?.phone, "+15555550111");
    assert.equal((await runs("wf_payment.succeeded", linked)).length, 2);
  });
  await check("same email in another workspace is a different Contact; events stay in their workspace", async () => {
    const r = await handle(ev("payment_intent.succeeded", pi("pi_ws2", { kind: "offerCharge", subAccountId: SA2, memberId: "m_other", offerId: "off_x" }), { account: "acct_B" }));
    assert.equal(r[0].outcome, "delivered");
    assert.equal(r[0].contactId, "c_other_ws");
    assert.equal((await runs("wf_other_ws_payment", "c_other_ws")).length, 1);
    assert.equal((await runs("wf_payment.succeeded")).filter((x) => x.context.paymentIntentId === "pi_ws2").length, 0);
  });
  await check("missing order (out of order) waits, then is delivered by the retry once the order exists", async () => {
    const e = ev("payment_intent.succeeded", pi("pi_late", orderMeta("o_late")));
    const r = await handle(e);
    assert.equal(r[0].outcome, "awaiting_contact");
    assert.equal((await eventDoc(r[0].key))?.reason, "order_not_found");
    assert.equal((await runs("wf_payment.succeeded")).filter((x) => x.context.paymentIntentId === "pi_late").length, 0, "not reported as delivered");
    await db.doc("checkoutOrders/o_late").set({ subAccountId: SA, memberId: "m_known", stripeAccountId: "acct_T", items: [{ role: "primary", offerId: "off_main" }] });
    // A redelivery from Stripe also retries; here the hourly backstop does it.
    const d = (await db.collection("paymentWorkflowEvents").where("key", "==", r[0].key).get()).docs[0];
    await d.ref.update({ nextAttemptAt: 0 });
    const stats = await mod.retryPendingPaymentWorkflowEvents();
    assert.ok(stats.delivered >= 1, JSON.stringify(stats));
    assert.equal((await runs("wf_payment.succeeded")).filter((x) => x.context.paymentIntentId === "pi_late").length, 1);
  });
  await check("waiting events give up after the attempt limit (kept as 'unresolved')", async () => {
    const r = await handle(ev("payment_intent.succeeded", pi("pi_never", orderMeta("o_never"))));
    const ref = (await db.collection("paymentWorkflowEvents").where("key", "==", r[0].key).get()).docs[0].ref;
    for (let i = 0; i < 12; i++) {
      await ref.update({ nextAttemptAt: 0 });
      await mod.retryPendingPaymentWorkflowEvents();
    }
    assert.equal((await ref.get()).data()?.status, "unresolved");
  });
  await check("imported (linked) Stripe subscription renewal resolves to its Contact", async () => {
    const r = await handle(ev("invoice.paid", subInvoice("in_imp", "sub_imported", "subscription_cycle", {})));
    assert.ok(r.length === 2 && r.every((x) => x.outcome === "delivered" && x.contactId === "c_imported"), JSON.stringify(r));
  });
  await check("untracked Stripe activity creates no Contact and no run", async () => {
    const before = await contactCount(SA);
    const a = await handle(ev("customer.subscription.created", subscription("sub_foreign", "active", {})));
    const b = await handle(ev("charge.refunded", charge("ch_foreign", 2000, {})));
    assert.equal(a[0].outcome, "unmatched");
    assert.equal(b[0].outcome, "awaiting_contact", "a refund may precede its ledger record");
    assert.equal(await contactCount(SA), before);
    assert.equal((await runs("wf_subscription.created")).filter((x) => x.context.subscriptionId === "sub_foreign").length, 0);
  });

  console.log("D. Stripe Connect isolation");
  await check("event from another connected account is rejected", async () => {
    const r = await handle(ev("payment_intent.succeeded", pi("pi_wrong_acct", orderMeta("o1")), { account: "acct_B" }));
    assert.equal(r[0].outcome, "rejected");
    assert.equal(r[0].reason, "stripe_account_mismatch");
  });
  await check("live-mode event on the TEST connection is rejected (test/live separation)", async () => {
    const r = await handle(ev("payment_intent.succeeded", pi("pi_mode", { kind: "offerCharge", subAccountId: SA, memberId: "m_known" }), { livemode: true }));
    assert.equal(r[0].outcome, "rejected");
    const ok = await handle(ev("payment_intent.succeeded", pi("pi_live", { kind: "offerCharge", subAccountId: SA, memberId: "m_known" }), { livemode: true, account: "acct_L" }));
    assert.equal(ok[0].outcome, "delivered");
    assert.equal((await runs("wf_payment.succeeded", "c_known")).find((x) => x.context.paymentIntentId === "pi_live")?.context.livemode, true);
  });
  await check("platform-account event for a connected workspace is rejected", async () => {
    const r = await handle(ev("payment_intent.succeeded", pi("pi_platform", { kind: "offerCharge", subAccountId: SA, memberId: "m_known" }), { account: null }));
    assert.equal(r[0].outcome, "rejected");
  });
  await check("agency / platform billing never reaches workspace workflows", async () => {
    for (const e of [
      ev("invoice.paid", subInvoice("in_plan", "sub_plan", "subscription_cycle", { kind: "subAccountPlan", subAccountId: SA }), { account: null }),
      ev("payment_intent.succeeded", pi("pi_charge", { kind: "subAccountCharge", subAccountId: SA }), { account: null }),
      ev("customer.subscription.created", subscription("sub_pro", "active", { uid: "uid_x" }), { account: null }),
      ev("payment_intent.succeeded", pi("pi_agency_offer", { kind: "agencyOfferCharge", subAccountId: SA, memberId: "m_known" }), { account: null }),
    ]) {
      assert.deepEqual(mod.classifyStripeEvent(e).candidates, []);
      assert.ok(mod.classifyStripeEvent(e).excluded);
      assert.equal((await handle(e)).length, 0);
    }
  });

  console.log("E. Workflows");
  await check("draft workflow, offer-filtered workflow and failing contact filter don't enroll; matching filter does", async () => {
    assert.equal((await runs("wf_draft_payment")).length, 0);
    assert.equal((await runs("wf_offer_filtered")).length, 0);
    // c_known has tag "VIP" — the case-insensitive has_tag filter matches.
    assert.ok((await runs("wf_vip_only", "c_known")).length >= 1);
    assert.equal((await runs("wf_vip_only", "c_existing")).length, 0);
  });
  await check("valid event with no matching workflow is recorded as such", async () => {
    await db.doc("workflows/wf_payment.failed").update({ status: "paused" });
    const r = await handle(ev("payment_intent.payment_failed", pi("pi_nowf", orderMeta("o1"), { last_payment_error: { code: "card_declined", charge: "ch_nowf" } })));
    assert.equal(r[0].outcome, "no_workflow");
    await db.doc("workflows/wf_payment.failed").update({ status: "active" });
  });
  await check("failed delivery is retried without duplicating workflows that already enrolled", async () => {
    const e = ev("payment_intent.succeeded", pi("pi_retry", orderMeta("o1")));
    const r = await handle(e);
    assert.equal(r[0].outcome, "delivered");
    const ref = (await db.collection("paymentWorkflowEvents").where("key", "==", r[0].key).get()).docs[0].ref;
    // Simulate a crash after some enrollments: mark as failed, then retry.
    await ref.update({ status: "delivery_failed", nextAttemptAt: 0 });
    await mod.retryPendingPaymentWorkflowEvents();
    assert.equal((await ref.get()).data()?.status, "no_workflow", "nothing new to enroll");
    assert.equal((await runs("wf_payment.succeeded")).filter((x) => x.context.paymentIntentId === "pi_retry").length, 1);
  });
  await check("run detail shows the payment trigger and amount", async () => {
    const run = (await runs("wf_refund.issued", "c_known"))[0];
    const d = await runsSvc.getRunDetail({ subAccountId: SA, territoryIds: null, runId: run.id as string });
    assert.equal(d.trigger, "Refund issued");
    const labels = Object.fromEntries(d.triggerDetails.map((x: { label: string; value: string }) => [x.label, x.value]));
    assert.equal(labels["Original payment"], "$20.00");
    assert.ok(/\$/.test(labels["Refunded"] ?? ""), JSON.stringify(labels));
    assert.equal(labels["Stripe mode"], "Test mode");
  });

  console.log("G. Webhook route security");
  const route = await import("../src/app/api/webhooks/stripe/route");
  const { default: StripeSdk } = await import("stripe");
  const stripe = new StripeSdk(process.env.STRIPE_SECRET_KEY!);
  const post = (body: string, sig: string | null) =>
    route.POST(new Request("http://localhost/api/webhooks/stripe", { method: "POST", body, headers: sig ? { "stripe-signature": sig } : {} }));
  await check("forged / unsigned events are refused and enroll nothing", async () => {
    const body = JSON.stringify(ev("customer.subscription.created", subscription("sub_forged", "active", subMeta)));
    assert.equal((await post(body, null)).status, 400);
    const forged = stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_attacker" });
    assert.equal((await post(body, forged)).status, 400);
    assert.equal((await runs("wf_subscription.created")).filter((x) => x.context.subscriptionId === "sub_forged").length, 0);
  });
  await check("a correctly signed event flows from the route to the workflow enrollment", async () => {
    const body = JSON.stringify(ev("customer.subscription.created", subscription("sub_signed", "active", subMeta)));
    const sig = stripe.webhooks.generateTestHeaderString({ payload: body, secret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET! });
    const res = await post(body, sig);
    assert.equal(res.status, 200);
    assert.equal((await runs("wf_subscription.created", "c_known")).filter((x) => x.context.subscriptionId === "sub_signed").length, 1);
  });
  await check("event records hold no card data or emails", async () => {
    const all = (await db.collection("paymentWorkflowEvents").get()).docs.map((d) => JSON.stringify(d.data()));
    assert.ok(all.length > 10);
    assert.ok(all.every((s) => !/@example\.com|card|last4|exp_month/i.test(s.replace(/card_declined/g, ""))));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

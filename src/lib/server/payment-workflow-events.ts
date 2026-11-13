import "server-only";

import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStripeConnectionForEnvironment } from "@/lib/stripe/server";
import { findExternalSubscriptionByProviderAccountSubscription } from "@/lib/server/external-billing-service";
import { findExternalPaymentByProviderCharge } from "@/lib/server/external-payment-service";
import { linkMemberContactServerSide } from "@/lib/community/member-account";
import { deliverWorkflowTrigger } from "@/lib/workflows/engine";
import type { WorkflowTriggerType } from "@/types/workflows";

/**
 * CRM Foundations Batch C — payment & subscription workflow triggers.
 *
 * The Stripe webhook route verifies the signature, runs the existing billing
 * handlers (orders, purchases, the billing ledger), then hands the verified
 * event here. This module:
 *   1. classifies it into the LOGICAL business events the Workflow Builder's
 *      existing triggers mean (Payment succeeded / failed, Subscription
 *      created / renewed / cancelled / paused, Refund issued) — Stripe events
 *      and business events are not one-to-one;
 *   2. resolves the workspace + CRM Contact from TRUSTED records only
 *      (checkout order, purchaser Member, quote, billing-ledger records),
 *      always scoped to the verified Stripe account (a customer / charge id
 *      is never treated as globally unique) and never from name matching;
 *   3. records each logical event once in `paymentWorkflowEvents` (server-only,
 *      default-deny rules) with a deterministic id, so redeliveries,
 *      concurrent deliveries and "two webhooks for one payment" collapse to
 *      one delivery that survives restarts;
 *   4. delivers through the existing workflow engine (deliverWorkflowTrigger)
 *      and records the outcome. Unresolved-but-valid events wait and are
 *      retried by the hourly cron (bounded); nothing is ever reported as
 *      delivered when it wasn't.
 *
 * Never charges, refunds, or changes a subscription; makes NO Stripe API
 * calls; never creates a Contact from webhook data (a missing link is
 * repaired only from the purchaser Member record created at checkout).
 * Agency/platform billing (Client Billing plans and charges, platform
 * signup, Founders, agency-owned Course/Offer sales, the legacy Pro plan)
 * is excluded — it never starts a workspace's customer workflows.
 */

const COLLECTION = "paymentWorkflowEvents";
const LEASE_MS = 2 * 60_000;
const MAX_ATTEMPTS = 10;
const BASE_BACKOFF_MS = 5 * 60_000;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;

/** Workspace (sub-account) payment kinds Magnetix creates. */
const WORKSPACE_KINDS = new Set(["checkoutOrder", "offerCharge", "courseCharge", "invoicePayment"]);
/** Agency / platform billing — never a workspace customer event. */
const EXCLUDED_KINDS = new Set([
  "subAccountPlan",
  "subAccountCharge",
  "platformSignup",
  "founders",
  "agencyCourseCharge",
  "agencyOfferCharge",
]);

export type PaymentWorkflowTrigger = Extract<
  WorkflowTriggerType,
  | "payment.succeeded"
  | "payment.failed"
  | "subscription.created"
  | "subscription.renewed"
  | "subscription.cancelled"
  | "subscription.paused"
  | "refund.issued"
>;

/** Everything needed to (re)process one logical event — no card data, no email. */
export interface PaymentEventCandidate {
  key: string;
  type: PaymentWorkflowTrigger;
  /** Verified event account (connected account id) or null for the platform account. */
  accountId: string | null;
  livemode: boolean;
  stripeEventId: string;
  stripeEventType: string;
  eventCreated: number;
  kind: string | null;
  meta: {
    subAccountId: string | null;
    memberId: string | null;
    orderId: string | null;
    quoteId: string | null;
    contactId: string | null;
    offerId: string | null;
    courseId: string | null;
  };
  refs: {
    subscriptionId: string | null;
    invoiceId: string | null;
    paymentIntentId: string | null;
    chargeId: string | null;
  };
  /** Subscription invoice period start (unix s) — tells a trial conversion from a renewal. */
  periodStart: number | null;
  payload: Record<string, string | number | boolean | null>;
}

export type PaymentEventOutcome =
  | "delivered"
  | "no_workflow"
  | "duplicate"
  | "in_progress"
  | "awaiting_contact"
  | "delivery_failed"
  | "rejected"
  | "unmatched"
  | "unresolved"
  | "skipped";

export interface ProcessResult {
  key: string;
  type: PaymentWorkflowTrigger;
  outcome: PaymentEventOutcome;
  reason?: string;
  enrolled?: number;
  contactId?: string;
  subAccountId?: string;
}

/* ------------------------------ helpers -------------------------------- */

function id(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") return (value as { id: string }).id;
  return null;
}
function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function acctKey(accountId: string | null): string {
  return accountId ?? "platform";
}
function docIdFor(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 40);
}
function metaFrom(metadata: Stripe.Metadata | null | undefined): PaymentEventCandidate["meta"] & { kind: string | null } {
  const m = metadata ?? {};
  return {
    kind: str(m.kind),
    subAccountId: str(m.subAccountId),
    memberId: str(m.memberId),
    orderId: str(m.orderId),
    quoteId: str(m.quoteId),
    contactId: str(m.contactId),
    offerId: str(m.offerId),
    courseId: str(m.courseId),
  };
}
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = (invoice as unknown as { parent?: { subscription_details?: { subscription?: unknown } } }).parent;
  return id(parent?.subscription_details?.subscription) ?? id((invoice as unknown as { subscription?: unknown }).subscription);
}
function invoiceMetadata(invoice: Stripe.Invoice): Stripe.Metadata | null {
  const parent = (invoice as unknown as { parent?: { subscription_details?: { metadata?: Stripe.Metadata | null } } }).parent;
  return parent?.subscription_details?.metadata ?? (invoice as unknown as { subscription_details?: { metadata?: Stripe.Metadata } }).subscription_details?.metadata ?? invoice.metadata ?? null;
}
function firstSubscriptionPrice(sub: Stripe.Subscription): { amount: number | null; currency: string | null; interval: string | null } {
  const price = sub.items?.data?.[0]?.price;
  return { amount: price?.unit_amount ?? null, currency: price?.currency ?? null, interval: price?.recurring?.interval ?? null };
}

/* ---------------------------- classification --------------------------- */

type Classified = { candidates: PaymentEventCandidate[]; excluded: string | null };

/**
 * Pure: Stripe event → the logical workflow events it represents (often none).
 * Exported for tests.
 */
export function classifyStripeEvent(event: Stripe.Event): Classified {
  const accountId = str(event.account) ?? null;
  const base = {
    accountId,
    livemode: event.livemode === true,
    stripeEventId: event.id,
    stripeEventType: event.type,
    eventCreated: event.created,
  };
  const a = acctKey(accountId);
  const none = (excluded: string | null = null): Classified => ({ candidates: [], excluded });
  const gate = (kind: string | null): string | null => {
    if (kind && EXCLUDED_KINDS.has(kind)) return `agency_billing:${kind}`;
    if (kind && !WORKSPACE_KINDS.has(kind)) return `unknown_kind:${kind}`;
    // No Magnetix kind on the PLATFORM account = our own platform billing
    // (legacy Pro plan, etc.), never a workspace customer.
    if (!kind && !accountId) return "platform_billing";
    return null;
  };

  switch (event.type) {
    case "payment_intent.succeeded":
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const m = metaFrom(pi.metadata);
      const excluded = gate(m.kind);
      if (excluded) return none(excluded);
      // Subscription payments carry no Magnetix kind on the PaymentIntent and
      // are reported from their invoice instead (one logical payment, one event).
      if (!m.kind) return none("invoice_backed_or_untracked");
      const { kind, ...meta } = m;
      const refs = { subscriptionId: null, invoiceId: null, paymentIntentId: pi.id, chargeId: id(pi.latest_charge) };
      if (event.type === "payment_intent.succeeded") {
        if (!(pi.amount_received > 0)) return none("nothing_charged");
        return {
          excluded: null,
          candidates: [{
            ...base, kind, meta, refs, periodStart: null,
            type: "payment.succeeded",
            key: `payment.succeeded:${a}:${pi.id}`,
            payload: { amount: pi.amount_received, currency: pi.currency, paymentStatus: "succeeded", paymentType: "one_time" },
          }],
        };
      }
      const err = pi.last_payment_error;
      // One failed ATTEMPT = one event: the attempt's charge identifies it, so a
      // redelivery collapses while a second declined attempt stays distinct.
      const attempt = id(err?.charge) ?? id(pi.latest_charge) ?? event.id;
      return {
        excluded: null,
        candidates: [{
          ...base, kind, meta, refs: { ...refs, chargeId: id(err?.charge) ?? refs.chargeId }, periodStart: null,
          type: "payment.failed",
          key: `payment.failed:${a}:${pi.id}:${attempt}`,
          payload: { amount: pi.amount, currency: pi.currency, paymentStatus: "failed", paymentType: "one_time", failureCode: err?.decline_code ?? err?.code ?? null },
        }],
      };
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoiceSubscriptionId(invoice);
      // One-time invoices (e.g. a Magnetix Invoice paid by card) are reported
      // from their PaymentIntent; only subscription invoices are handled here.
      if (!subscriptionId) return none("not_a_subscription_invoice");
      const m = metaFrom(invoiceMetadata(invoice));
      const excluded = gate(m.kind);
      if (excluded) return none(excluded);
      const { kind, ...meta } = m;
      const refs = { subscriptionId, invoiceId: invoice.id ?? null, paymentIntentId: null, chargeId: null };
      const reason = invoice.billing_reason ?? null;
      const periodStart = invoice.lines?.data?.[0]?.period?.start ?? null;
      const shared = { ...base, kind, meta, refs, periodStart };
      if (event.type === "invoice.payment_failed") {
        return {
          excluded: null,
          candidates: [{
            ...shared,
            type: "payment.failed",
            key: `payment.failed:${a}:${invoice.id}:${invoice.attempt_count ?? 0}`,
            payload: { amount: invoice.amount_due, currency: invoice.currency, paymentStatus: "failed", paymentType: "subscription", billingReason: reason, attempt: invoice.attempt_count ?? null },
          }],
        };
      }
      const out: PaymentEventCandidate[] = [];
      if (invoice.amount_paid > 0) {
        out.push({
          ...shared,
          type: "payment.succeeded",
          key: `payment.succeeded:${a}:${invoice.id}`,
          payload: { amount: invoice.amount_paid, currency: invoice.currency, paymentStatus: "succeeded", paymentType: "subscription", billingReason: reason },
        });
      }
      // Only a billing-cycle invoice is a renewal — never the first invoice.
      if (reason === "subscription_cycle") {
        out.push({
          ...shared,
          type: "subscription.renewed",
          key: `subscription.renewed:${a}:${invoice.id}`,
          payload: { amount: invoice.amount_paid, currency: invoice.currency, subscriptionStatus: "active", billingReason: reason },
        });
      }
      return { excluded: null, candidates: out };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const m = metaFrom(sub.metadata);
      const excluded = gate(m.kind);
      if (excluded) return none(excluded);
      const { kind, ...meta } = m;
      const price = firstSubscriptionPrice(sub);
      const refs = { subscriptionId: sub.id, invoiceId: null, paymentIntentId: null, chargeId: null };
      const shared = { ...base, kind, meta, refs, periodStart: null };
      const payload = { amount: price.amount, currency: price.currency, interval: price.interval, subscriptionStatus: sub.status };
      const live = sub.status === "active" || sub.status === "trialing";
      const prev = (event.data.previous_attributes ?? {}) as Partial<Stripe.Subscription>;
      if (event.type === "customer.subscription.created") {
        // An "incomplete" subscription (awaiting its first payment) isn't
        // created yet in the business sense — it's reported when it activates.
        if (!live) return none("subscription_not_active_yet");
        return { excluded: null, candidates: [{ ...shared, type: "subscription.created", key: `subscription.created:${a}:${sub.id}`, payload }] };
      }
      if (event.type === "customer.subscription.deleted") {
        if (sub.status !== "canceled") return none("never_started");
        return { excluded: null, candidates: [{ ...shared, type: "subscription.cancelled", key: `subscription.cancelled:${a}:${sub.id}`, payload: { ...payload, subscriptionStatus: "canceled" } }] };
      }
      // updated: only real status TRANSITIONS count (a scheduled cancellation,
      // a card update or a past_due dunning state is not one of our triggers).
      if (!("status" in prev) || prev.status === sub.status) return none("no_status_transition");
      if (live && (prev.status === "incomplete" || prev.status === "incomplete_expired")) {
        return { excluded: null, candidates: [{ ...shared, type: "subscription.created", key: `subscription.created:${a}:${sub.id}`, payload }] };
      }
      if (sub.status === "paused") {
        return { excluded: null, candidates: [{ ...shared, type: "subscription.paused", key: `subscription.paused:${a}:${sub.id}:${event.id}`, payload }] };
      }
      return none("transition_not_a_trigger");
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const m = metaFrom(charge.metadata);
      const excluded = gate(m.kind);
      if (excluded) return none(excluded);
      const { kind, ...meta } = m;
      const prev = (event.data.previous_attributes ?? {}) as Partial<Stripe.Charge>;
      const refundAmount = typeof prev.amount_refunded === "number" ? charge.amount_refunded - prev.amount_refunded : null;
      return {
        excluded: null,
        candidates: [{
          ...base, kind, meta, periodStart: null,
          refs: { subscriptionId: null, invoiceId: null, paymentIntentId: id(charge.payment_intent), chargeId: charge.id },
          type: "refund.issued",
          // The cumulative refunded amount identifies each refund step: a
          // redelivery repeats it, a second partial refund increases it.
          key: `refund.issued:${a}:${charge.id}:${charge.amount_refunded}`,
          payload: {
            amount: charge.amount,
            currency: charge.currency,
            refundAmount,
            amountRefunded: charge.amount_refunded,
            fullyRefunded: charge.refunded === true || charge.amount_refunded >= charge.amount,
          },
        }],
      };
    }
    default:
      return none(null);
  }
}

/* ------------------------------ resolution ------------------------------ */

type Resolution =
  | { state: "resolved"; agencyId: string; subAccountId: string; contactId: string; offerId: string | null; source: string }
  | { state: "pending"; reason: string }
  | { state: "rejected"; reason: string }
  | { state: "unmatched"; reason: string };

/** The verified Stripe account must be the workspace's own account for the event's mode. */
function accountMatchesWorkspace(sub: FirebaseFirestore.DocumentData, accountId: string | null, livemode: boolean): boolean {
  const conn = getStripeConnectionForEnvironment(sub.stripeConnect, livemode ? "live" : "test")?.accountId?.trim() || null;
  if (accountId) return conn === accountId;
  // Platform-account event: only the explicit shared-account exception (same
  // rule as external-payment-sync-service).
  return !conn || sub.stripeCourseCheckoutEnabledByAgency === true;
}

async function contactInWorkspace(contactId: string | null | undefined, subAccountId: string): Promise<boolean> {
  if (!contactId) return false;
  const snap = await getAdminDb().doc(`contacts/${contactId}`).get();
  return snap.exists && snap.data()?.subAccountId === subAccountId;
}

async function resolveMemberContact(subAccountId: string, memberId: string): Promise<{ contactId: string | null; memberExists: boolean }> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}/members/${memberId}`).get();
  if (!snap.exists) return { contactId: null, memberExists: false };
  const linked = snap.data()?.contactId;
  if (typeof linked === "string" && linked) return { contactId: linked, memberExists: true };
  // A legitimate purchaser whose Contact link was never written: repair it
  // from the Member's own checkout details (never from the webhook).
  const repaired = await linkMemberContactServerSide(subAccountId, memberId).catch((err) => {
    console.warn("[payment-workflow-events] member contact repair failed", err);
    return null;
  });
  return { contactId: repaired, memberExists: true };
}

export async function resolvePaymentIdentity(c: PaymentEventCandidate): Promise<Resolution> {
  const db = getAdminDb();
  const m = c.meta;

  if (c.kind) {
    const subAccountId = m.subAccountId;
    if (!subAccountId) return { state: "rejected", reason: "missing_workspace" };
    const saSnap = await db.doc(`subAccounts/${subAccountId}`).get();
    const sa = saSnap.data();
    const agencyId = typeof sa?.agencyId === "string" ? sa.agencyId : null;
    if (!saSnap.exists || !agencyId) return { state: "rejected", reason: "unknown_workspace" };
    if (!accountMatchesWorkspace(sa!, c.accountId, c.livemode)) return { state: "rejected", reason: "stripe_account_mismatch" };

    if (c.kind === "invoicePayment") {
      if (!m.quoteId || !m.contactId) return { state: "rejected", reason: "missing_invoice_reference" };
      const quote = await db.doc(`quotes/${m.quoteId}`).get();
      if (!quote.exists) return { state: "pending", reason: "invoice_not_found" };
      if (quote.data()?.subAccountId !== subAccountId || quote.data()?.contactId !== m.contactId) return { state: "rejected", reason: "invoice_mismatch" };
      if (!(await contactInWorkspace(m.contactId, subAccountId))) return { state: "pending", reason: "contact_missing" };
      return { state: "resolved", agencyId, subAccountId, contactId: m.contactId, offerId: null, source: "invoice" };
    }

    let memberId = m.memberId;
    let offerId = m.offerId;
    if (c.kind === "checkoutOrder" && m.orderId) {
      const order = await db.doc(`checkoutOrders/${m.orderId}`).get();
      if (!order.exists) return { state: "pending", reason: "order_not_found" };
      const o = order.data()!;
      if (o.subAccountId !== subAccountId || (o.stripeAccountId ?? null) !== c.accountId) return { state: "rejected", reason: "order_mismatch" };
      if (memberId && o.memberId !== memberId) return { state: "rejected", reason: "order_mismatch" };
      memberId = o.memberId ?? memberId;
      const primary = Array.isArray(o.items) ? (o.items as Array<{ role?: string; offerId?: string }>).find((i) => i.role === "primary") : null;
      offerId = offerId ?? primary?.offerId ?? null;
    }
    if (!memberId) return { state: "rejected", reason: "missing_purchaser" };
    const member = await resolveMemberContact(subAccountId, memberId);
    if (!member.memberExists) return { state: "pending", reason: "purchaser_not_found" };
    if (!member.contactId) return { state: "pending", reason: "contact_link_missing" };
    if (!(await contactInWorkspace(member.contactId, subAccountId))) return { state: "pending", reason: "contact_missing" };
    return { state: "resolved", agencyId, subAccountId, contactId: member.contactId, offerId, source: c.kind };
  }

  // No Magnetix kind on a CONNECTED account: only events for billing the
  // workspace already tracks (an imported/linked subscription, or a payment
  // in the ledger), always looked up within THIS Stripe account.
  const providerAccountId = acctKey(c.accountId);
  let ledger: { agencyId: string; subAccountId: string; contactId: string; source: string } | null = null;
  if (c.refs.subscriptionId) {
    const s = await findExternalSubscriptionByProviderAccountSubscription({ provider: "stripe", providerAccountId, externalSubscriptionId: c.refs.subscriptionId }).catch(() => null);
    if (s) ledger = { agencyId: s.agencyId, subAccountId: s.subAccountId, contactId: s.contactId, source: "linked_subscription" };
  }
  if (!ledger && c.refs.chargeId) {
    const p = await findExternalPaymentByProviderCharge({ provider: "stripe", providerAccountId, externalChargeId: c.refs.chargeId }).catch(() => null);
    if (p) ledger = { agencyId: p.agencyId, subAccountId: p.subAccountId, contactId: p.contactId, source: "linked_payment" };
  }
  if (!ledger) {
    // A refund can arrive before the ledger records its payment.
    return c.type === "refund.issued" || c.type === "subscription.renewed" || c.type === "payment.succeeded"
      ? { state: "pending", reason: "billing_record_not_found" }
      : { state: "unmatched", reason: "not_tracked_by_magnetix" };
  }
  const saSnap = await db.doc(`subAccounts/${ledger.subAccountId}`).get();
  if (!saSnap.exists || !accountMatchesWorkspace(saSnap.data()!, c.accountId, c.livemode)) return { state: "rejected", reason: "stripe_account_mismatch" };
  if (!(await contactInWorkspace(ledger.contactId, ledger.subAccountId))) return { state: "pending", reason: "contact_missing" };
  return { state: "resolved", agencyId: ledger.agencyId, subAccountId: ledger.subAccountId, contactId: ledger.contactId, offerId: c.meta.offerId, source: ledger.source };
}

/** A billing-cycle invoice right after a free trial is the first payment, not a renewal. */
async function isTrialConversion(c: PaymentEventCandidate): Promise<boolean> {
  if (c.type !== "subscription.renewed" || !c.refs.subscriptionId || c.periodStart == null) return false;
  const s = await findExternalSubscriptionByProviderAccountSubscription({
    provider: "stripe",
    providerAccountId: acctKey(c.accountId),
    externalSubscriptionId: c.refs.subscriptionId,
  }).catch(() => null);
  const trialEnd = s?.trialEnd as unknown;
  const ms =
    trialEnd instanceof Date
      ? trialEnd.getTime()
      : trialEnd && typeof (trialEnd as { toMillis?: () => number }).toMillis === "function"
        ? (trialEnd as { toMillis: () => number }).toMillis()
        : typeof trialEnd === "string"
          ? Date.parse(trialEnd)
          : null;
  if (!ms || !Number.isFinite(ms)) return false;
  return Math.abs(c.periodStart * 1000 - ms) <= 60 * 60_000;
}

/** Ignore a pause that's older than the latest subscription event already processed. */
async function isStaleSubscriptionTransition(c: PaymentEventCandidate): Promise<boolean> {
  if (!c.type.startsWith("subscription.") || !c.refs.subscriptionId) return false;
  const ref = getAdminDb().doc(`${COLLECTION}_watermarks/${docIdFor(`${acctKey(c.accountId)}:${c.refs.subscriptionId}`)}`);
  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const last = typeof snap.data()?.lastEventCreated === "number" ? (snap.data()!.lastEventCreated as number) : 0;
    if (c.type === "subscription.paused" && c.eventCreated < last) return true;
    if (c.eventCreated > last) tx.set(ref, { lastEventCreated: c.eventCreated, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return false;
  });
}

/* ------------------------------- delivery ------------------------------- */

function workflowContext(c: PaymentEventCandidate, r: Extract<Resolution, { state: "resolved" }>): Record<string, unknown> {
  const clean = Object.fromEntries(Object.entries(c.payload).filter(([, v]) => v !== null && v !== undefined));
  return {
    eventId: c.key,
    deduplicationKey: c.key,
    eventType: c.type,
    occurredAt: new Date(c.eventCreated * 1000).toISOString(),
    source: "stripe",
    providerEventType: c.stripeEventType,
    providerEventId: c.stripeEventId,
    stripeAccount: acctKey(c.accountId),
    livemode: c.livemode,
    paymentSource: r.source,
    ...(r.offerId ? { offerId: r.offerId } : {}),
    ...(c.meta.courseId ? { courseId: c.meta.courseId } : {}),
    ...(c.meta.orderId ? { orderId: c.meta.orderId } : {}),
    ...(c.meta.quoteId ? { quoteId: c.meta.quoteId } : {}),
    ...(c.refs.subscriptionId ? { subscriptionId: c.refs.subscriptionId } : {}),
    ...(c.refs.invoiceId ? { invoiceId: c.refs.invoiceId } : {}),
    ...(c.refs.paymentIntentId ? { paymentIntentId: c.refs.paymentIntentId } : {}),
    ...(c.refs.chargeId ? { chargeId: c.refs.chargeId } : {}),
    ...clean,
  };
}

type Claim = { ok: true; attempts: number } | { ok: false; outcome: PaymentEventOutcome };
const FINAL = new Set(["delivered", "no_workflow", "rejected", "unmatched", "skipped", "unresolved"]);

async function claim(c: PaymentEventCandidate): Promise<Claim> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTION).doc(docIdFor(c.key));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    if (!snap.exists) {
      tx.create(ref, {
        key: c.key,
        type: c.type,
        status: "processing",
        attempts: 1,
        leaseUntil: now + LEASE_MS,
        nextAttemptAt: null,
        candidate: c,
        stripeEventIds: [c.stripeEventId],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { ok: true, attempts: 1 };
    }
    const d = snap.data()!;
    const extra = Array.isArray(d.stripeEventIds) && !d.stripeEventIds.includes(c.stripeEventId) && d.stripeEventIds.length < 20 ? { stripeEventIds: FieldValue.arrayUnion(c.stripeEventId) } : {};
    if (FINAL.has(d.status)) {
      if (Object.keys(extra).length) tx.update(ref, extra);
      return { ok: false, outcome: "duplicate" };
    }
    if (d.status === "processing" && typeof d.leaseUntil === "number" && d.leaseUntil > now) return { ok: false, outcome: "in_progress" };
    const attempts = (typeof d.attempts === "number" ? d.attempts : 0) + 1;
    tx.update(ref, { status: "processing", attempts, leaseUntil: now + LEASE_MS, updatedAt: FieldValue.serverTimestamp(), ...extra });
    return { ok: true, attempts };
  });
}

async function finish(c: PaymentEventCandidate, status: PaymentEventOutcome, fields: Record<string, unknown>, attempts: number): Promise<void> {
  const retry = status === "awaiting_contact" || status === "delivery_failed";
  const giveUp = retry && attempts >= MAX_ATTEMPTS;
  await getAdminDb()
    .collection(COLLECTION)
    .doc(docIdFor(c.key))
    .update({
      status: giveUp ? "unresolved" : status,
      leaseUntil: 0,
      nextAttemptAt: retry && !giveUp ? Date.now() + Math.min(BASE_BACKOFF_MS * 2 ** (attempts - 1), MAX_BACKOFF_MS) : null,
      updatedAt: FieldValue.serverTimestamp(),
      ...fields,
    });
}

/** Process one logical event end to end (idempotent; safe to call repeatedly). */
export async function processPaymentEventCandidate(c: PaymentEventCandidate): Promise<ProcessResult> {
  const result = (outcome: PaymentEventOutcome, extra: Partial<ProcessResult> = {}): ProcessResult => ({ key: c.key, type: c.type, outcome, ...extra });
  const claimed = await claim(c);
  if (!claimed.ok) return result(claimed.outcome);
  const attempts = claimed.attempts;

  let resolution: Resolution;
  try {
    resolution = await resolvePaymentIdentity(c);
  } catch (err) {
    console.error(`[payment-workflow-events] resolve failed key=${c.key}`, err);
    resolution = { state: "pending", reason: "resolve_error" };
  }
  if (resolution.state === "rejected") {
    console.warn(`[payment-workflow-events] rejected key=${c.key} reason=${resolution.reason}`);
    await finish(c, "rejected", { reason: resolution.reason }, attempts);
    return result("rejected", { reason: resolution.reason });
  }
  if (resolution.state === "unmatched") {
    await finish(c, "unmatched", { reason: resolution.reason }, attempts);
    return result("unmatched", { reason: resolution.reason });
  }
  if (resolution.state === "pending") {
    await finish(c, "awaiting_contact", { reason: resolution.reason }, attempts);
    return result(attempts >= MAX_ATTEMPTS ? "unresolved" : "awaiting_contact", { reason: resolution.reason });
  }

  const ids = { subAccountId: resolution.subAccountId, contactId: resolution.contactId };
  if (await isTrialConversion(c)) {
    await finish(c, "skipped", { reason: "trial_conversion_not_renewal", ...ids }, attempts);
    return result("skipped", { reason: "trial_conversion_not_renewal", ...ids });
  }
  if (await isStaleSubscriptionTransition(c)) {
    await finish(c, "skipped", { reason: "stale_subscription_event", ...ids }, attempts);
    return result("skipped", { reason: "stale_subscription_event", ...ids });
  }

  try {
    const delivered = await deliverWorkflowTrigger({
      agencyId: resolution.agencyId,
      subAccountId: resolution.subAccountId,
      type: c.type,
      contactId: resolution.contactId,
      context: workflowContext(c, resolution),
    });
    // "no_workflow": valid + resolved, but no active workflow's trigger and
    // filters matched (or automations are paused) — nothing to enroll.
    const status = delivered.enrolled > 0 ? "delivered" : "no_workflow";
    await finish(c, status, { ...ids, enrolled: delivered.enrolled, runIds: delivered.runIds, reason: delivered.skippedReason ?? (status === "no_workflow" ? "no_matching_workflow" : null) }, attempts);
    return result(status, { enrolled: delivered.enrolled, ...ids });
  } catch (err) {
    console.error(`[payment-workflow-events] delivery failed key=${c.key}`, err);
    await finish(c, "delivery_failed", { ...ids, reason: "delivery_error" }, attempts);
    return result(attempts >= MAX_ATTEMPTS ? "unresolved" : "delivery_failed", ids);
  }
}

/** Entry point from the verified Stripe webhook. Never charges or calls Stripe. */
export async function processStripeWorkflowEvent(event: Stripe.Event): Promise<ProcessResult[]> {
  const { candidates } = classifyStripeEvent(event);
  const out: ProcessResult[] = [];
  for (const c of candidates) out.push(await processPaymentEventCandidate(c));
  return out;
}

/**
 * Hourly backstop (task-rollover cron): retry events still waiting for their
 * Contact or whose delivery failed, with backoff, until MAX_ATTEMPTS — then
 * they stay as "unresolved" for investigation. Equality-only query (no index).
 */
export async function retryPendingPaymentWorkflowEvents(limit = 100): Promise<{ checked: number; delivered: number; waiting: number; unresolved: number }> {
  const db = getAdminDb();
  const now = Date.now();
  const [waiting, failed] = await Promise.all([
    db.collection(COLLECTION).where("status", "==", "awaiting_contact").limit(500).get(),
    db.collection(COLLECTION).where("status", "==", "delivery_failed").limit(500).get(),
  ]);
  const due = [...waiting.docs, ...failed.docs]
    .filter((d) => typeof d.data().nextAttemptAt !== "number" || (d.data().nextAttemptAt as number) <= now)
    .slice(0, limit);
  const stats = { checked: due.length, delivered: 0, waiting: 0, unresolved: 0 };
  for (const d of due) {
    const r = await processPaymentEventCandidate(d.data().candidate as PaymentEventCandidate);
    if (r.outcome === "delivered" || r.outcome === "no_workflow") stats.delivered++;
    else if (r.outcome === "unresolved") stats.unresolved++;
    else stats.waiting++;
  }
  return stats;
}

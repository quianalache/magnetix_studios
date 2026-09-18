import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { getStripeServer } from "@/lib/stripe/server";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import { listAgencyStandaloneCourses } from "@/lib/server/agency-standalone-course-service";
import { listAgencyStandaloneCoursePurchases } from "@/lib/server/agency-standalone-course-purchase-service";
import { listAgencyCourseOffers } from "@/lib/server/agency-course-offer-service";
import { listAgencyCourseOfferPurchases } from "@/lib/server/agency-course-offer-purchase-service";
import type { PersonPaymentHistoryItem, PersonSubscriptionPurchase } from "@/lib/server/mymagnetix-service";
import type { StandaloneCoursePurchase } from "@/types/standalone-courses";
import type { CourseOfferPurchase } from "@/types/course-offers";

/**
 * Agency Course/Offer purchases -> MyMagnetix "Purchases" page, the
 * agency-scope sibling of native-purchase-billing-sync.ts's Option A. That
 * file's exact mechanism (writing into the shared `externalSubscriptions`/
 * `externalPayments` ledger via upsertExternalSubscription/
 * upsertExternalBillingCustomer) is NOT reusable here — both functions
 * `cleanRequired(contactId)` + `assertContactTenant(subAccountId, contactId)`,
 * a hard, structural requirement on a real `contacts/{id}` doc inside a
 * real sub-account tenant. An Agency purchase has neither: no Contact/CRM
 * product exists at agency scope (same accepted dependency as Booking/
 * Project bundling), and the agency itself is not a sub-account. Making
 * `contactId` nullable across that ledger's schema + every consumer
 * (`assertContactTenant`, `subscriptionBelongsToMembership`, the tenant
 * Billing Ledger import/reconcile UI) would be a real schema migration
 * against a mature, already-shipped, real-money system — out of scope for
 * a parity pass per the standing "don't rewrite working commerce" rule.
 *
 * Instead (Option B, deliberately, for this one case only): read Agency
 * purchases directly — they already carry everything needed
 * (amountCents/currency/status/paidAt, `memberId` = the buyer's real
 * Person id, `stripeSubscriptionId` for recurring ones) — and shape them
 * into the SAME `PersonSubscriptionPurchase`/`PersonPaymentHistoryItem`
 * types the existing MyMagnetix Purchases page already renders. No new
 * ledger collection, no second customer portal, no fake Contact. The
 * page just merges this list in beside the existing tenant-sourced one.
 */

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

async function agencyBusinessName(agencyId: string): Promise<string> {
  const snap = await getAdminDb().doc(`agencies/${agencyId}`).get();
  return (snap.data()?.name as string) || "Magnetix Studios";
}

/** Live Stripe status for a recurring agency purchase — mirrors
 *  listPaymentsForPerson's own live-lookup pattern. Always the shared
 *  platform account (agency checkout never uses Stripe Connect). A lookup
 *  failure degrades to the purchase's own last-known Firestore status
 *  rather than dropping the row. */
async function liveSubscriptionFields(stripeSubscriptionId: string): Promise<{
  status: PersonSubscriptionPurchase["status"];
  interval: string | null;
  intervalCount: number | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
} | null> {
  try {
    const stripe = getStripeServer();
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ["items.data.price"],
    });
    const item = subscription.items.data[0];
    const normalized =
      subscription.status === "active" ||
      subscription.status === "trialing" ||
      subscription.status === "past_due" ||
      subscription.status === "paused" ||
      subscription.status === "canceled"
        ? subscription.status
        : "unknown";
    return {
      status: normalized,
      interval: item?.price?.recurring?.interval ?? null,
      intervalCount: item?.price?.recurring?.interval_count ?? null,
      currentPeriodStart: item?.current_period_start ? new Date(item.current_period_start * 1000) : null,
      currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    };
  } catch (err) {
    console.warn("[agency-mymagnetix-billing-service] live subscription lookup failed", err);
    return null;
  }
}

/** Mirrors tenant `isManageableSubscription` in mymagnetix-billing-portal-
 *  service.ts — a canceled subscription still renders (in payment history
 *  and, briefly, as a "current" card until the next poll), but the Stripe
 *  Billing Portal has nothing left to manage for it. */
function isManageableAgencySubscription(status: PersonSubscriptionPurchase["status"]): boolean {
  return status !== "canceled" && status !== "ended";
}

function paymentStatusFromPurchaseStatus(status: string): PersonPaymentHistoryItem["status"] {
  if (status === "paid") return "succeeded";
  if (status === "pending") return "pending";
  if (status === "canceled") return "canceled";
  return "unknown";
}

/**
 * Every Agency Standalone Course / Course Offer purchase belonging to this
 * Person — across the one agency (there is exactly one per deployment).
 * Returns the same two lists purchases/page.tsx already merges into
 * PurchasesView: current (recurring) subscriptions, and full payment
 * history. Best-effort: a Stripe lookup failure for one recurring
 * purchase degrades that row's status rather than failing the whole list.
 */
export async function listAgencyPurchasesForPerson(personId: string): Promise<{
  subscriptions: PersonSubscriptionPurchase[];
  paymentHistory: PersonPaymentHistoryItem[];
}> {
  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) return { subscriptions: [], paymentHistory: [] };

  const businessName = await agencyBusinessName(agencyId);
  const [courses, offers] = await Promise.all([
    listAgencyStandaloneCourses(agencyId),
    listAgencyCourseOffers(agencyId),
  ]);

  const subscriptions: PersonSubscriptionPurchase[] = [];
  const paymentHistory: PersonPaymentHistoryItem[] = [];

  const coursePurchaseLists = await Promise.all(
    courses.map(async (course) => {
      const all = await listAgencyStandaloneCoursePurchases(agencyId, course.id);
      return all
        .filter((p) => p.memberId === personId)
        .map((p) => ({ purchase: p, title: course.title, courseId: course.id }));
    }),
  );
  const offerPurchaseLists = await Promise.all(
    offers.map(async (offer) => {
      const all = await listAgencyCourseOfferPurchases(agencyId, offer.id);
      return all
        .filter((p) => p.memberId === personId)
        .map((p) => ({ purchase: p, title: offer.title, offerId: offer.id }));
    }),
  );

  for (const { purchase, title, courseId } of coursePurchaseLists.flat()) {
    await accumulateCoursePurchase({ purchase, title, courseId, businessName, subscriptions, paymentHistory });
  }
  for (const { purchase, title, offerId } of offerPurchaseLists.flat()) {
    await accumulateOfferPurchase({ purchase, title, offerId, businessName, subscriptions, paymentHistory });
  }

  return { subscriptions, paymentHistory };
}

async function accumulateCoursePurchase(opts: {
  purchase: StandaloneCoursePurchase;
  title: string;
  courseId: string;
  businessName: string;
  subscriptions: PersonSubscriptionPurchase[];
  paymentHistory: PersonPaymentHistoryItem[];
}): Promise<void> {
  const { purchase: p, title, courseId, businessName, subscriptions, paymentHistory } = opts;
  if (p.status === "pending") return; // no charge has landed yet — nothing to show

  if (p.stripeSubscriptionId) {
    const live = await liveSubscriptionFields(p.stripeSubscriptionId);
    subscriptions.push({
      // Embeds enough path info (kind:courseId:purchaseId) for
      // /api/my/billing/portal/agency to re-resolve the real purchase doc
      // server-side — see that route's own doc comment. Never parsed
      // client-side; the Manage button just echoes this id back verbatim.
      id: `agency-course:${courseId}:${p.id}`,
      subAccountId: "agency",
      businessName,
      provider: "stripe",
      productName: title,
      priceName: null,
      amountCents: p.amountCents,
      currency: p.currency,
      interval: live?.interval ?? null,
      intervalCount: live?.intervalCount ?? null,
      status: live?.status ?? (p.status === "canceled" ? "canceled" : "unknown"),
      currentPeriodStart: live?.currentPeriodStart ?? null,
      currentPeriodEnd: live?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: live?.cancelAtPeriodEnd ?? false,
      canManage: isManageableAgencySubscription(live?.status ?? (p.status === "canceled" ? "canceled" : "unknown")),
    });
  }

  paymentHistory.push({
    id: `agency-course:${p.id}`,
    subAccountId: "agency",
    businessName,
    productName: title,
    description: null,
    paymentType: p.stripeSubscriptionId ? "subscription" : "one_time",
    status: paymentStatusFromPurchaseStatus(p.status),
    amountCents: p.amountCents,
    amountRefundedCents: 0,
    netAmountCents: p.amountCents,
    currency: p.currency,
    occurredAt: toDate(p.paidAt) ?? toDate(p.requestedAt),
    paidAt: toDate(p.paidAt),
    failedAt: null,
    refundedAt: null,
    receiptUrl: null,
    invoiceHostedUrl: null,
    invoicePdfUrl: null,
    failureMessage: null,
  });
}

async function accumulateOfferPurchase(opts: {
  purchase: CourseOfferPurchase;
  title: string;
  offerId: string;
  businessName: string;
  subscriptions: PersonSubscriptionPurchase[];
  paymentHistory: PersonPaymentHistoryItem[];
}): Promise<void> {
  const { purchase: p, title, offerId, businessName, subscriptions, paymentHistory } = opts;
  if (p.status === "pending") return;

  if (p.stripeSubscriptionId) {
    const live = await liveSubscriptionFields(p.stripeSubscriptionId);
    subscriptions.push({
      // See accumulateCoursePurchase's own comment on this id shape.
      id: `agency-offer:${offerId}:${p.id}`,
      subAccountId: "agency",
      businessName,
      provider: "stripe",
      productName: title,
      priceName: null,
      amountCents: p.amountCents,
      currency: p.currency,
      interval: live?.interval ?? null,
      intervalCount: live?.intervalCount ?? null,
      status: live?.status ?? (p.status === "canceled" ? "canceled" : "unknown"),
      currentPeriodStart: live?.currentPeriodStart ?? null,
      currentPeriodEnd: live?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: live?.cancelAtPeriodEnd ?? false,
      canManage: isManageableAgencySubscription(live?.status ?? (p.status === "canceled" ? "canceled" : "unknown")),
    });
  }

  paymentHistory.push({
    id: `agency-offer:${p.id}`,
    subAccountId: "agency",
    businessName,
    productName: title,
    description: null,
    paymentType: p.stripeSubscriptionId ? "subscription" : "one_time",
    status: paymentStatusFromPurchaseStatus(p.status),
    amountCents: p.amountCents,
    amountRefundedCents: 0,
    netAmountCents: p.amountCents,
    currency: p.currency,
    occurredAt: toDate(p.paidAt) ?? toDate(p.requestedAt),
    paidAt: toDate(p.paidAt),
    failedAt: null,
    refundedAt: null,
    receiptUrl: null,
    invoiceHostedUrl: null,
    invoicePdfUrl: null,
    failureMessage: null,
  });
}

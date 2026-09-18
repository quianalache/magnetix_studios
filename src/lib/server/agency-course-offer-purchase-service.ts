import "server-only";

import type Stripe from "stripe";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStripeServer } from "@/lib/stripe/server";
import { getAgencyCourseOffer } from "@/lib/server/agency-course-offer-service";
import {
  enrollInAgencyStandaloneCourseServerSide,
  revokeLinkedAgencyCommunityAccessServerSide,
} from "@/lib/server/agency-standalone-course-service";
import type { CourseOfferAccess, CourseOfferPurchase } from "@/types/course-offers";

/**
 * Purchases for an Agency Course Offer — the agency-scope sibling of
 * course-offer-purchase-service.ts. Stripe only (see
 * agency-standalone-course-purchase-service.ts's module comment — same
 * reasoning applies). Granting access loops the purchase's snapshotted
 * `courseIds` and reuses `enrollInAgencyStandaloneCourseServerSide` for
 * each, same generalization tenant applies over the single-course path.
 * No Booking/Project-Template fulfillment (see agency-course-offer-
 * service.ts's module comment) — a genuine missing-product dependency.
 * The customer-facing MyMagnetix billing-ledger view IS covered, just via
 * a parallel read (agency-mymagnetix-billing-service.ts) rather than a
 * write into the tenant Contact-keyed `externalSubscriptions`/
 * `externalPayments` ledger — see that file's own doc comment for why.
 * checkoutSettings-driven phone/address/service-agreement collection and
 * the One-Click Upsell mechanic are both fully ported too (2026-09-18
 * parity pass) — see this file's own exports below.
 */

export const AGENCY_OFFER_CHARGE_KIND = "agencyOfferCharge";

function purchasesCol(agencyId: string, offerId: string) {
  return getAdminDb().collection(`agencies/${agencyId}/courseOffers/${offerId}/purchases`);
}

function computeAccessWindow(access: CourseOfferAccess | null | undefined): { beginsAt: Date | null; expiresAt: Date | null } {
  let beginsAt: Date | null = null;
  let expiresAt: Date | null = null;
  if (access?.beginAtSpecificDate && access.beginDate) {
    const d = access.beginDate as unknown as { toDate?: () => Date };
    beginsAt = typeof d.toDate === "function" ? d.toDate() : null;
  }
  if (access?.restrictToDays && access.accessDays) {
    expiresAt = new Date(Date.now() + access.accessDays * 24 * 60 * 60 * 1000);
  }
  return { beginsAt, expiresAt };
}

async function stampAgencyAccessWindow(opts: { agencyId: string; courseId: string; personId: string; beginsAt: Date | null; expiresAt: Date | null }): Promise<void> {
  if (!opts.beginsAt && !opts.expiresAt) return;
  await getAdminDb()
    .doc(`agencies/${opts.agencyId}/standaloneCourses/${opts.courseId}/enrollments/${opts.personId}`)
    .set(
      { accessBeginsAt: opts.beginsAt ? Timestamp.fromDate(opts.beginsAt) : null, accessExpiresAt: opts.expiresAt ? Timestamp.fromDate(opts.expiresAt) : null },
      { merge: true },
    );
}

/** Mirrors tenant `stampDirectPurchaseMarker` — lets a bundled course's
 *  own `hasPaidAgencyStandaloneCourse` gate recognize Offer-granted
 *  access with no change to that guard. */
async function stampAgencyDirectPurchaseMarker(opts: { agencyId: string; courseId: string; personId: string }): Promise<void> {
  const courseSnap = await getAdminDb().doc(`agencies/${opts.agencyId}/standaloneCourses/${opts.courseId}`).get();
  const course = courseSnap.data();
  if (!course || course.access !== "purchase") return;
  const col = getAdminDb().collection(`agencies/${opts.agencyId}/standaloneCourses/${opts.courseId}/purchases`);
  const existing = await col.where("memberId", "==", opts.personId).where("status", "==", "paid").limit(1).get();
  if (!existing.empty) return;
  await col.add({
    agencyId: opts.agencyId,
    courseId: opts.courseId,
    memberId: opts.personId,
    amountCents: 0,
    currency: (course.currency as string) ?? "USD",
    method: "stripe",
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    status: "paid",
    grantedByUid: null,
    requestedAt: FieldValue.serverTimestamp(),
    paidAt: FieldValue.serverTimestamp(),
  });
}

export async function startAgencyCourseOfferStripeCheckoutServerSide(opts: {
  agencyId: string;
  offerId: string;
  personId: string;
  personEmail: string;
  personName: string;
  personPhone: string | null;
  personAddress: string | null;
  returnUrl: string;
}): Promise<{ clientSecret: string }> {
  const offer = await getAgencyCourseOffer(opts.agencyId, opts.offerId);
  if (!offer || offer.type === "free" || !offer.priceCents) {
    throw new Error("This offer isn't for sale.");
  }
  const amountCents = offer.priceCents;
  const currency = offer.currency ?? "USD";
  const isRecurring = offer.type === "recurring";

  const stripe = getStripeServer();
  const metadata = { kind: AGENCY_OFFER_CHARGE_KIND, agencyId: opts.agencyId, offerId: opts.offerId, personId: opts.personId };

  // Reuse/create a real Stripe Customer with the name/phone MyMagnetix's
  // own signup form already collected — same UX fix tenant Offer checkout
  // applies (Checkout otherwise re-asks for the name as a brand-new
  // anonymous customer). `setup_future_usage: "off_session"` on the
  // one-time branch is what makes an Offer's One-Click Upsell able to
  // charge this same customer/payment method later with no second card
  // entry (see agency-course-offer-purchase-service.ts's upsell exports).
  const existingCustomers = await stripe.customers.list({ email: opts.personEmail, limit: 1 });
  const customerId = existingCustomers.data[0]
    ? existingCustomers.data[0].id
    : (await stripe.customers.create({ email: opts.personEmail, name: opts.personName, ...(opts.personPhone ? { phone: opts.personPhone } : {}) })).id;

  const session = await stripe.checkout.sessions.create(
    isRecurring
      ? {
          mode: "subscription",
          ui_mode: "embedded",
          customer: customerId,
          billing_address_collection: "required",
          line_items: [
            {
              price_data: { currency, unit_amount: amountCents, product_data: { name: offer.title }, recurring: { interval: offer.recurringInterval ?? "month" } },
              quantity: 1,
            },
          ],
          return_url: opts.returnUrl,
          metadata,
          subscription_data: { metadata, ...(offer.trialDays ? { trial_period_days: offer.trialDays } : {}) },
          allow_promotion_codes: offer.discountCodesEnabled || undefined,
        }
      : {
          mode: "payment",
          ui_mode: "embedded",
          customer: customerId,
          billing_address_collection: "required",
          payment_intent_data: { metadata, setup_future_usage: "off_session" },
          line_items: [{ price_data: { currency, unit_amount: amountCents, product_data: { name: offer.title } }, quantity: 1 }],
          return_url: opts.returnUrl,
          metadata,
          allow_promotion_codes: offer.discountCodesEnabled || undefined,
        },
  );
  if (!session.client_secret) throw new Error("Stripe did not return a client secret.");

  await purchasesCol(opts.agencyId, opts.offerId).add({
    agencyId: opts.agencyId,
    offerId: opts.offerId,
    courseIds: offer.courseIds,
    memberId: opts.personId,
    amountCents,
    currency,
    method: "stripe",
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: null,
    stripeCustomerId: customerId,
    stripeSubscriptionId: null,
    status: "pending",
    grantedByUid: null,
    requestedAt: FieldValue.serverTimestamp(),
    paidAt: null,
    buyerDisplayName: opts.personName || null,
    buyerPhone: offer.checkoutSettings.collectPhoneNumber ? opts.personPhone : null,
    buyerAddress: offer.checkoutSettings.collectAddress ? opts.personAddress : null,
  });

  return { clientSecret: session.client_secret };
}

/** Free offers skip Stripe entirely — enroll in every bundled course. */
export async function enrollAllCoursesForFreeAgencyOfferServerSide(opts: {
  agencyId: string;
  courseIds: string[];
  personId: string;
  email: string;
  displayName: string | null;
}): Promise<void> {
  for (const courseId of opts.courseIds) {
    await enrollInAgencyStandaloneCourseServerSide({
      agencyId: opts.agencyId,
      courseId,
      personId: opts.personId,
      email: opts.email,
      displayName: opts.displayName,
    });
  }
}

export async function hasPaidAgencyCourseOffer(agencyId: string, offerId: string, personId: string): Promise<boolean> {
  const snap = await purchasesCol(agencyId, offerId).where("memberId", "==", personId).where("status", "==", "paid").limit(1).get();
  return !snap.empty;
}

export async function listAgencyCourseOfferPurchases(agencyId: string, offerId: string): Promise<CourseOfferPurchase[]> {
  const snap = await purchasesCol(agencyId, offerId).orderBy("requestedAt", "desc").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CourseOfferPurchase, "id">) }));
}

/** Mark a purchase paid + grant entitlement to every bundled course,
 *  including each one's linked Community groups. Mirrors tenant
 *  `grantCourseOfferAccessServerSide`, minus Booking/Project fulfillment
 *  and the customer-facing billing-ledger sync (see this file's module
 *  comment). Called only from the Stripe webhook. */
export async function grantAgencyCourseOfferAccessServerSide(opts: {
  agencyId: string;
  offerId: string;
  purchaseId: string;
  stripePaymentIntentId?: string | null;
  stripeCustomerId?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingCountry?: string | null;
}): Promise<{ ok: boolean }> {
  const ref = purchasesCol(opts.agencyId, opts.offerId).doc(opts.purchaseId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Purchase not found");
  const purchase = { id: snap.id, ...(snap.data() as Omit<CourseOfferPurchase, "id">) };
  if (purchase.status === "paid") return { ok: true };

  await ref.update({
    status: "paid",
    paidAt: FieldValue.serverTimestamp(),
    grantedByUid: null,
    ...(opts.stripePaymentIntentId !== undefined ? { stripePaymentIntentId: opts.stripePaymentIntentId } : {}),
    ...(opts.stripeCustomerId !== undefined ? { stripeCustomerId: opts.stripeCustomerId } : {}),
    ...(opts.billingCity !== undefined ? { billingCity: opts.billingCity } : {}),
    ...(opts.billingState !== undefined ? { billingState: opts.billingState } : {}),
    ...(opts.billingCountry !== undefined ? { billingCountry: opts.billingCountry } : {}),
  });

  const offer = await getAgencyCourseOffer(opts.agencyId, opts.offerId);
  const { beginsAt, expiresAt } = computeAccessWindow(offer?.access ?? null);

  const personSnap = await getAdminDb().doc(`people/${purchase.memberId}`).get();
  const email = (personSnap.data()?.primaryEmail as string | undefined) ?? "";
  const displayName = (personSnap.data()?.displayName as string | undefined) ?? null;

  for (const courseId of purchase.courseIds) {
    await enrollInAgencyStandaloneCourseServerSide({ agencyId: opts.agencyId, courseId, personId: purchase.memberId, email, displayName });
    await stampAgencyAccessWindow({ agencyId: opts.agencyId, courseId, personId: purchase.memberId, beginsAt, expiresAt });
    await stampAgencyDirectPurchaseMarker({ agencyId: opts.agencyId, courseId, personId: purchase.memberId });
  }

  return { ok: true };
}

export async function handleAgencyCourseOfferCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const { agencyId, offerId } = session.metadata ?? {};
  if (!agencyId || !offerId) {
    console.error("[agency-course-offer] agencyOfferCharge checkout completed without metadata");
    return;
  }
  const snap = await purchasesCol(agencyId, offerId).where("stripeCheckoutSessionId", "==", session.id).limit(1).get();
  if (snap.empty) {
    console.error(`[agency-course-offer] no pending purchase for session ${session.id}`);
    return;
  }
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
  if (subscriptionId) await snap.docs[0].ref.update({ stripeSubscriptionId: subscriptionId });
  const address = session.customer_details?.address ?? null;
  await grantAgencyCourseOfferAccessServerSide({
    agencyId,
    offerId,
    purchaseId: snap.docs[0].id,
    stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
    stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
    billingCity: address?.city ?? null,
    billingState: address?.state ?? null,
    billingCountry: address?.country ?? null,
  });
}

export async function getPaidAgencyOfferPurchaseId(agencyId: string, offerId: string, personId: string): Promise<string | null> {
  const snap = await purchasesCol(agencyId, offerId).where("memberId", "==", personId).where("status", "==", "paid").limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

/* ------------------------------ One-Click Upsell ---------------------------- */

export interface ChargeAgencyOneClickUpsellResult {
  ok: boolean;
  needsManualCheckout?: boolean;
  purchaseId?: string;
}

/**
 * Agency sibling of tenant `chargeOneClickUpsellServerSide` — a targeted
 * audit of that function found it depends on nothing Contact- or
 * subAccount-shaped beyond plain string ids: it charges the trigger
 * purchase's saved Stripe payment method off-session and grants access
 * through the SAME `grantAgencyCourseOfferAccessServerSide` every other
 * agency offer purchase already uses. `setup_future_usage: "off_session"`
 * on the trigger checkout (see startAgencyCourseOfferStripeCheckoutServerSide)
 * is what makes the saved payment method chargeable here with no second
 * card entry.
 */
export async function chargeOneClickUpsellForAgencyServerSide(opts: {
  agencyId: string;
  triggerOfferId: string;
  triggerPurchaseId: string;
  targetOfferId: string;
  personId: string;
}): Promise<ChargeAgencyOneClickUpsellResult> {
  const triggerSnap = await purchasesCol(opts.agencyId, opts.triggerOfferId).doc(opts.triggerPurchaseId).get();
  const trigger = triggerSnap.data() as Omit<CourseOfferPurchase, "id"> | undefined;
  if (!trigger?.stripeCustomerId || !trigger.stripePaymentIntentId) {
    return { ok: false, needsManualCheckout: true };
  }

  const targetOffer = await getAgencyCourseOffer(opts.agencyId, opts.targetOfferId);
  if (!targetOffer || targetOffer.type === "free" || !targetOffer.priceCents) {
    return { ok: false, needsManualCheckout: true };
  }

  const stripe = getStripeServer();
  const stripeCustomerId = trigger.stripeCustomerId;
  try {
    const originalIntent = await stripe.paymentIntents.retrieve(trigger.stripePaymentIntentId);
    const paymentMethodId = typeof originalIntent.payment_method === "string" ? originalIntent.payment_method : originalIntent.payment_method?.id;
    if (!paymentMethodId) return { ok: false, needsManualCheckout: true };

    const metadata = { kind: AGENCY_OFFER_CHARGE_KIND, agencyId: opts.agencyId, offerId: opts.targetOfferId, personId: opts.personId };
    const intent = await stripe.paymentIntents.create({
      amount: targetOffer.priceCents,
      currency: targetOffer.currency ?? "USD",
      customer: stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      metadata,
    });

    const ref = await purchasesCol(opts.agencyId, opts.targetOfferId).add({
      agencyId: opts.agencyId,
      offerId: opts.targetOfferId,
      courseIds: targetOffer.courseIds,
      memberId: opts.personId,
      amountCents: targetOffer.priceCents,
      currency: targetOffer.currency ?? "USD",
      method: "stripe",
      stripeCheckoutSessionId: null,
      stripeCustomerId,
      stripeSubscriptionId: null,
      stripePaymentIntentId: intent.id,
      status: "pending",
      grantedByUid: null,
      requestedAt: FieldValue.serverTimestamp(),
      paidAt: null,
      buyerDisplayName: trigger.buyerDisplayName ?? null,
    });

    await grantAgencyCourseOfferAccessServerSide({
      agencyId: opts.agencyId,
      offerId: opts.targetOfferId,
      purchaseId: ref.id,
      stripePaymentIntentId: intent.id,
      stripeCustomerId,
    });

    return { ok: true, purchaseId: ref.id };
  } catch (err) {
    console.error("[agency-course-offer] one-click upsell charge failed", err);
    return { ok: false, needsManualCheckout: true };
  }
}

/** Webhook: `customer.subscription.deleted` for a recurring Agency Offer.
 *  Flips the purchase to `canceled`, then — per bundled course — stamps
 *  the access-window expiry and revokes ONLY that course's linked-
 *  Community-group access source, exactly the source-aware behavior
 *  agency-community-access-source-service.ts provides. */
export async function handleAgencyCourseOfferSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const { agencyId, offerId } = subscription.metadata ?? {};
  if (!agencyId || !offerId) return;
  const snap = await purchasesCol(agencyId, offerId).where("stripeSubscriptionId", "==", subscription.id).limit(1).get();
  if (snap.empty) return;
  const purchase = snap.docs[0].data() as Omit<CourseOfferPurchase, "id">;
  await snap.docs[0].ref.update({ status: "canceled" });
  const expiresAt = new Date();
  for (const courseId of purchase.courseIds) {
    await stampAgencyAccessWindow({ agencyId, courseId, personId: purchase.memberId, beginsAt: null, expiresAt });
    await revokeLinkedAgencyCommunityAccessServerSide({ agencyId, courseId, personId: purchase.memberId });
  }
}

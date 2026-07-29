import "server-only";

import type Stripe from "stripe";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { buildPaypalAmountUrl } from "@/lib/paypal/payment-link";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import { getStripeServer } from "@/lib/stripe/server";
import { getCourseOffer } from "@/lib/server/course-offer-service";
import {
  getStandaloneCourse,
  enrollInStandaloneCourseServerSide,
} from "@/lib/server/standalone-course-service";
import { emailIsConfigured, sendTenantEmail } from "@/lib/comms/resend";
import { renderOfferBookingBundleEmail } from "@/lib/course-offers/booking-bundle-email";
import type {
  CourseOfferAccess,
  CourseOfferBookingBundle,
  CourseOfferPurchase,
} from "@/types/course-offers";
import type { PayPalConfig } from "@/types";

/**
 * Purchases for a Course Offer — generalizes
 * `standalone-course-purchase-service.ts`'s dual-rail pattern (PayPal
 * manual-reconcile + Stripe instant/webhook) to a bundle of courses instead
 * of a single one. Granting access loops the purchase's snapshotted
 * `courseIds` and reuses `enrollInStandaloneCourseServerSide` for each — no
 * changes needed to that function.
 */

export const OFFER_CHARGE_KIND = "offerCharge";

function purchasesCol(saId: string, offerId: string) {
  return getAdminDb().collection(
    `subAccounts/${saId}/courseOffers/${offerId}/purchases`,
  );
}

/* --------------------------------- PayPal -------------------------------- */

export interface RequestCourseOfferPurchaseResult {
  purchaseId: string;
  paypalUrl: string;
  status: CourseOfferPurchase["status"];
}

export async function requestCourseOfferPaypalServerSide(opts: {
  subAccountId: string;
  offerId: string;
  memberId: string;
}): Promise<RequestCourseOfferPurchaseResult> {
  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${opts.subAccountId}`).get();
  const sub = subSnap.data();
  const paypal = sub?.paypalConfig as PayPalConfig | null | undefined;
  if (!paypal?.username) {
    throw new Error(
      "This offer hasn't set up payments yet. Contact the offer owner.",
    );
  }
  const agencyId = (sub?.agencyId as string) ?? "";

  const offer = await getCourseOffer(opts.subAccountId, opts.offerId);
  if (!offer || offer.type === "free" || !offer.priceCents) {
    throw new Error("This offer isn't for sale.");
  }
  const amountCents = offer.priceCents;
  const currency = offer.currency ?? "USD";

  const existing = await purchasesCol(opts.subAccountId, opts.offerId)
    .where("memberId", "==", opts.memberId)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (!existing.empty) {
    const doc = existing.docs[0];
    return {
      purchaseId: doc.id,
      paypalUrl: (doc.data().paypalUrl as string) ?? "",
      status: "pending",
    };
  }

  const paypalUrl = buildPaypalAmountUrl({
    paypal,
    amount: amountCents / 100,
    currency,
  });

  const ref = await purchasesCol(opts.subAccountId, opts.offerId).add({
    subAccountId: opts.subAccountId,
    agencyId,
    offerId: opts.offerId,
    courseIds: offer.courseIds,
    booking: offer.booking,
    memberId: opts.memberId,
    amountCents,
    currency,
    method: "paypal",
    paypalUrl,
    stripeCheckoutSessionId: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePaymentIntentId: null,
    status: "pending",
    grantedByUid: null,
    requestedAt: FieldValue.serverTimestamp(),
    paidAt: null,
  });

  return { purchaseId: ref.id, paypalUrl, status: "pending" };
}

/* --------------------------------- Stripe -------------------------------- */

/**
 * Start a Stripe embedded Checkout Session for an Offer — `mode:"payment"`
 * for `oneTime`, `mode:"subscription"` for `recurring`, ad-hoc `price_data`
 * in both cases (mirrors `startStandaloneCourseStripeCheckoutServerSide`).
 * Always saves the payment method (`setup_future_usage`/subscription's own
 * default) so a later One-Click Upsell can charge off-session.
 */
export async function startCourseOfferStripeCheckoutServerSide(opts: {
  subAccountId: string;
  offerId: string;
  memberId: string;
  memberEmail: string;
  returnUrl: string;
}): Promise<{ clientSecret: string }> {
  const offer = await getCourseOffer(opts.subAccountId, opts.offerId);
  if (!offer || offer.type === "free" || !offer.priceCents) {
    throw new Error("This offer isn't for sale.");
  }
  const subSnap = await getAdminDb().doc(`subAccounts/${opts.subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? "";
  const amountCents = offer.priceCents;
  const currency = offer.currency ?? "USD";

  const stripe = getStripeServer();
  const metadata = {
    kind: OFFER_CHARGE_KIND,
    subAccountId: opts.subAccountId,
    offerId: opts.offerId,
    memberId: opts.memberId,
  };

  const session = await stripe.checkout.sessions.create(
    offer.type === "recurring"
      ? {
          mode: "subscription",
          ui_mode: "embedded",
          customer_email: opts.memberEmail,
          line_items: [
            {
              price_data: {
                currency,
                unit_amount: amountCents,
                product_data: { name: offer.title },
                recurring: { interval: offer.recurringInterval ?? "month" },
              },
              quantity: 1,
            },
          ],
          return_url: opts.returnUrl,
          metadata,
          subscription_data: {
            metadata,
            ...(offer.trialDays ? { trial_period_days: offer.trialDays } : {}),
          },
          allow_promotion_codes: offer.discountCodesEnabled,
        }
      : {
          mode: "payment",
          ui_mode: "embedded",
          customer_email: opts.memberEmail,
          customer_creation: "always",
          payment_intent_data: {
            metadata,
            setup_future_usage: "off_session",
          },
          line_items: [
            {
              price_data: {
                currency,
                unit_amount: amountCents,
                product_data: { name: offer.title },
              },
              quantity: 1,
            },
          ],
          return_url: opts.returnUrl,
          metadata,
          allow_promotion_codes: offer.discountCodesEnabled,
        },
  );
  if (!session.client_secret) {
    throw new Error("Stripe did not return a client secret.");
  }

  await purchasesCol(opts.subAccountId, opts.offerId).add({
    subAccountId: opts.subAccountId,
    agencyId,
    offerId: opts.offerId,
    courseIds: offer.courseIds,
    booking: offer.booking,
    memberId: opts.memberId,
    amountCents,
    currency,
    method: "stripe",
    paypalUrl: null,
    stripeCheckoutSessionId: session.id,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePaymentIntentId: null,
    status: "pending",
    grantedByUid: null,
    requestedAt: FieldValue.serverTimestamp(),
    paidAt: null,
  });

  return { clientSecret: session.client_secret };
}

/* ------------------------------- Access grant ------------------------------ */

function computeAccessWindow(
  access: CourseOfferAccess | null | undefined,
): { beginsAt: Date | null; expiresAt: Date | null } {
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

async function stampAccessWindow(opts: {
  subAccountId: string;
  courseId: string;
  memberId: string;
  beginsAt: Date | null;
  expiresAt: Date | null;
}): Promise<void> {
  if (!opts.beginsAt && !opts.expiresAt) return;
  const ref = getAdminDb().doc(
    `subAccounts/${opts.subAccountId}/standaloneCourses/${opts.courseId}/enrollments/${opts.memberId}`,
  );
  await ref.set(
    {
      accessBeginsAt: opts.beginsAt ? Timestamp.fromDate(opts.beginsAt) : null,
      accessExpiresAt: opts.expiresAt
        ? Timestamp.fromDate(opts.expiresAt)
        : null,
    },
    { merge: true },
  );
}

/**
 * Stamp a lightweight "paid" marker into a bundled course's OWN purchases
 * subcollection when that course also has its own direct `access:
 * "purchase"` mode — lets the existing, unmodified `hasPaidStandaloneCourse`
 * gate (used by `requireCourseClassroomAccess`) recognize Offer-granted
 * access with no change to that guard.
 */
async function stampDirectPurchaseMarker(opts: {
  subAccountId: string;
  agencyId: string;
  courseId: string;
  memberId: string;
  offerId: string;
}): Promise<void> {
  const course = await getStandaloneCourse(opts.subAccountId, opts.courseId);
  if (!course || course.access !== "purchase") return;
  const col = getAdminDb().collection(
    `subAccounts/${opts.subAccountId}/standaloneCourses/${opts.courseId}/purchases`,
  );
  const existing = await col
    .where("memberId", "==", opts.memberId)
    .where("status", "==", "paid")
    .limit(1)
    .get();
  if (!existing.empty) return;
  await col.add({
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    courseId: opts.courseId,
    memberId: opts.memberId,
    amountCents: 0,
    currency: course.currency ?? "USD",
    method: "stripe",
    paypalUrl: null,
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    status: "paid",
    grantedByUid: null,
    requestedAt: FieldValue.serverTimestamp(),
    paidAt: FieldValue.serverTimestamp(),
    offerId: opts.offerId,
  });
}

/**
 * Best-effort "here's your booking link" email for a bundled Booking Page —
 * sent alongside (never instead of) course enrollment. Failure is logged
 * and swallowed, same as every other email call site in this codebase;
 * losing the email must never block granting access.
 */
async function sendOfferBookingBundleEmail(opts: {
  subAccountId: string;
  memberId: string;
  offerTitle: string;
  booking: CourseOfferBookingBundle;
}): Promise<void> {
  if (!emailIsConfigured()) return;
  try {
    const db = getAdminDb();
    const [memberSnap, subSnap] = await Promise.all([
      db.doc(`subAccounts/${opts.subAccountId}/members/${opts.memberId}`).get(),
      db.doc(`subAccounts/${opts.subAccountId}`).get(),
    ]);
    const member = memberSnap.data();
    if (!member?.email) return;
    const sub = subSnap.data();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const bookingUrl = `${appUrl}/b/${opts.subAccountId}/${opts.booking.bookingPageSlug}`;

    const rendered = renderOfferBookingBundleEmail({
      recipientName: (member.displayName as string | null) ?? "",
      businessName: (sub?.name as string) ?? "Booking",
      offerTitle: opts.offerTitle,
      bookingPageName: opts.booking.bookingPageName,
      sessionCount: opts.booking.sessionCount,
      bookingUrl,
    });

    await sendTenantEmail({
      sub: sub as Parameters<typeof sendTenantEmail>[0]["sub"],
      to: member.email as string,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
  } catch (err) {
    console.warn("[course-offer] booking bundle email send failed", err);
  }
}

/**
 * The shared "unlock" path — enrolls the member in every course the
 * purchase's snapshotted `courseIds` covers, applies any Offer Access
 * window, and stamps a direct-purchase marker on any bundled course that
 * also gates on its own `access:"purchase"`. Called from both the Stripe
 * webhook and staff's PayPal "Mark as paid" action.
 */
export async function grantCourseOfferAccessServerSide(opts: {
  subAccountId: string;
  offerId: string;
  purchaseId: string;
  grantedByUid: string | null;
  stripePaymentIntentId?: string | null;
  stripeCustomerId?: string | null;
}): Promise<{ ok: boolean }> {
  const ref = purchasesCol(opts.subAccountId, opts.offerId).doc(
    opts.purchaseId,
  );
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Purchase not found");
  const purchase = {
    id: snap.id,
    ...(snap.data() as Omit<CourseOfferPurchase, "id">),
  };
  if (purchase.status === "paid") return { ok: true };

  const offer = await getCourseOffer(opts.subAccountId, opts.offerId);
  const { beginsAt, expiresAt } = computeAccessWindow(offer?.access ?? null);

  await ref.update({
    status: "paid",
    paidAt: FieldValue.serverTimestamp(),
    grantedByUid: opts.grantedByUid,
    ...(opts.stripePaymentIntentId !== undefined
      ? { stripePaymentIntentId: opts.stripePaymentIntentId }
      : {}),
    ...(opts.stripeCustomerId !== undefined
      ? { stripeCustomerId: opts.stripeCustomerId }
      : {}),
  });

  for (const courseId of purchase.courseIds) {
    await enrollInStandaloneCourseServerSide({
      subAccountId: opts.subAccountId,
      agencyId: purchase.agencyId,
      courseId,
      memberId: purchase.memberId,
    });
    await stampAccessWindow({
      subAccountId: opts.subAccountId,
      courseId,
      memberId: purchase.memberId,
      beginsAt,
      expiresAt,
    });
    await stampDirectPurchaseMarker({
      subAccountId: opts.subAccountId,
      agencyId: purchase.agencyId,
      courseId,
      memberId: purchase.memberId,
      offerId: opts.offerId,
    });
  }

  if (purchase.booking) {
    await sendOfferBookingBundleEmail({
      subAccountId: opts.subAccountId,
      memberId: purchase.memberId,
      offerTitle: offer?.title ?? "your purchase",
      booking: purchase.booking,
    });
  }

  void emitWebhookEvent({
    subAccountId: opts.subAccountId,
    agencyId: purchase.agencyId,
    mode: "live",
    type: "course.offer.purchase.paid",
    payload: {
      purchaseId: purchase.id,
      offerId: opts.offerId,
      courseIds: purchase.courseIds,
      memberId: purchase.memberId,
      amountCents: purchase.amountCents,
      currency: purchase.currency,
    },
  });

  return { ok: true };
}

/** Webhook: `checkout.session.completed` with `metadata.kind === OFFER_CHARGE_KIND`. */
export async function handleCourseOfferCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const { subAccountId, offerId } = session.metadata ?? {};
  if (!subAccountId || !offerId) {
    console.error("[course-offer] offerCharge checkout completed without metadata");
    return;
  }
  const snap = await purchasesCol(subAccountId, offerId)
    .where("stripeCheckoutSessionId", "==", session.id)
    .limit(1)
    .get();
  if (snap.empty) {
    console.error(`[course-offer] no pending purchase for session ${session.id}`);
    return;
  }
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : null;
  if (subscriptionId) {
    await snap.docs[0].ref.update({ stripeSubscriptionId: subscriptionId });
  }
  await grantCourseOfferAccessServerSide({
    subAccountId,
    offerId,
    purchaseId: snap.docs[0].id,
    grantedByUid: null,
    stripePaymentIntentId:
      typeof session.payment_intent === "string" ? session.payment_intent : null,
    stripeCustomerId:
      typeof session.customer === "string" ? session.customer : null,
  });
}

/**
 * Webhook: `customer.subscription.deleted` for a recurring Offer. Flips the
 * matching purchase to `canceled` — the classroom-access guard's expiry
 * check treats a canceled purchase's access window as elapsed going
 * forward; enrollment/progress data is kept, never deleted.
 */
export async function handleCourseOfferSubscriptionDeleted(
  subscription: Stripe.Subscription,
): Promise<void> {
  const { subAccountId, offerId } = subscription.metadata ?? {};
  if (!subAccountId || !offerId) return;
  const snap = await purchasesCol(subAccountId, offerId)
    .where("stripeSubscriptionId", "==", subscription.id)
    .limit(1)
    .get();
  if (snap.empty) return;
  const purchase = snap.docs[0].data() as Omit<CourseOfferPurchase, "id">;
  await snap.docs[0].ref.update({ status: "canceled" });
  const expiresAt = new Date();
  for (const courseId of purchase.courseIds) {
    await stampAccessWindow({
      subAccountId,
      courseId,
      memberId: purchase.memberId,
      beginsAt: null,
      expiresAt,
    });
  }
}

/**
 * Free offers skip Stripe/PayPal entirely — just enroll in every attached
 * course, mirroring how a free ("open") standalone course enrolls directly
 * with no purchase doc at all.
 */
export async function enrollAllCoursesForFreeOfferServerSide(opts: {
  subAccountId: string;
  agencyId: string;
  courseIds: string[];
  memberId: string;
  /** Free offers have no purchase doc to snapshot a booking bundle onto, so
   *  the caller passes it straight through from the live offer. */
  offerTitle?: string;
  booking?: CourseOfferBookingBundle | null;
}): Promise<void> {
  for (const courseId of opts.courseIds) {
    await enrollInStandaloneCourseServerSide({
      subAccountId: opts.subAccountId,
      agencyId: opts.agencyId,
      courseId,
      memberId: opts.memberId,
    });
  }
  if (opts.booking) {
    await sendOfferBookingBundleEmail({
      subAccountId: opts.subAccountId,
      memberId: opts.memberId,
      offerTitle: opts.offerTitle ?? "your purchase",
      booking: opts.booking,
    });
  }
}

/** Has this member paid for this offer? */
export async function hasPaidCourseOffer(
  saId: string,
  offerId: string,
  memberId: string,
): Promise<boolean> {
  const snap = await purchasesCol(saId, offerId)
    .where("memberId", "==", memberId)
    .where("status", "==", "paid")
    .limit(1)
    .get();
  return !snap.empty;
}

/** The member's paid purchase id for this offer, if any — the trigger
 *  purchase a One-Click Upsell accept charges off of. */
export async function getPaidPurchaseIdForMember(
  saId: string,
  offerId: string,
  memberId: string,
): Promise<string | null> {
  const snap = await purchasesCol(saId, offerId)
    .where("memberId", "==", memberId)
    .where("status", "==", "paid")
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].id;
}

/** Staff "Mark as paid" (PayPal rail) — same shared grant path as the webhook. */
export async function markCourseOfferPurchasePaidServerSide(opts: {
  subAccountId: string;
  offerId: string;
  purchaseId: string;
  grantedByUid: string;
}): Promise<{ ok: boolean }> {
  return grantCourseOfferAccessServerSide(opts);
}

/* ------------------------------ One-Click Upsell ---------------------------- */

export interface ChargeOneClickUpsellResult {
  ok: boolean;
  /** True when the off-session charge failed (e.g. authentication required)
   *  and the UI should fall back to a normal checkout link instead. */
  needsManualCheckout?: boolean;
  purchaseId?: string;
}

/**
 * The One-Click Upsell mechanic: charges the saved payment method from the
 * trigger purchase off-session for the target offer's price, with no second
 * checkout form. On success, grants access immediately (no webhook
 * round-trip needed — this call is synchronous). On a card error
 * (authentication required / declined), returns `needsManualCheckout` so the
 * UI can fall back to the target offer's normal Get-Link checkout.
 */
export async function chargeOneClickUpsellServerSide(opts: {
  subAccountId: string;
  triggerOfferId: string;
  triggerPurchaseId: string;
  targetOfferId: string;
  memberId: string;
}): Promise<ChargeOneClickUpsellResult> {
  const triggerSnap = await purchasesCol(
    opts.subAccountId,
    opts.triggerOfferId,
  )
    .doc(opts.triggerPurchaseId)
    .get();
  const trigger = triggerSnap.data() as
    | Omit<CourseOfferPurchase, "id">
    | undefined;
  if (!trigger?.stripeCustomerId || !trigger.stripePaymentIntentId) {
    return { ok: false, needsManualCheckout: true };
  }

  const targetOffer = await getCourseOffer(opts.subAccountId, opts.targetOfferId);
  if (!targetOffer || targetOffer.type === "free" || !targetOffer.priceCents) {
    return { ok: false, needsManualCheckout: true };
  }

  const stripe = getStripeServer();
  const stripeCustomerId = trigger.stripeCustomerId;
  try {
    const originalIntent = await stripe.paymentIntents.retrieve(
      trigger.stripePaymentIntentId,
    );
    const paymentMethodId =
      typeof originalIntent.payment_method === "string"
        ? originalIntent.payment_method
        : originalIntent.payment_method?.id;
    if (!paymentMethodId) {
      return { ok: false, needsManualCheckout: true };
    }

    const metadata = {
      kind: OFFER_CHARGE_KIND,
      subAccountId: opts.subAccountId,
      offerId: opts.targetOfferId,
      memberId: opts.memberId,
    };
    const intent = await stripe.paymentIntents.create({
      amount: targetOffer.priceCents,
      currency: targetOffer.currency ?? "USD",
      customer: stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      metadata,
    });

    const subSnap = await getAdminDb()
      .doc(`subAccounts/${opts.subAccountId}`)
      .get();
    const agencyId = (subSnap.data()?.agencyId as string) ?? "";
    const ref = await purchasesCol(opts.subAccountId, opts.targetOfferId).add({
      subAccountId: opts.subAccountId,
      agencyId,
      offerId: opts.targetOfferId,
      courseIds: targetOffer.courseIds,
      booking: targetOffer.booking,
      memberId: opts.memberId,
      amountCents: targetOffer.priceCents,
      currency: targetOffer.currency ?? "USD",
      method: "stripe",
      paypalUrl: null,
      stripeCheckoutSessionId: null,
      stripeCustomerId,
      stripeSubscriptionId: null,
      stripePaymentIntentId: intent.id,
      status: "pending",
      grantedByUid: null,
      requestedAt: FieldValue.serverTimestamp(),
      paidAt: null,
    });

    await grantCourseOfferAccessServerSide({
      subAccountId: opts.subAccountId,
      offerId: opts.targetOfferId,
      purchaseId: ref.id,
      grantedByUid: null,
      stripePaymentIntentId: intent.id,
      stripeCustomerId,
    });

    return { ok: true, purchaseId: ref.id };
  } catch (err) {
    console.error("[course-offer] one-click upsell charge failed", err);
    return { ok: false, needsManualCheckout: true };
  }
}

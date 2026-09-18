import "server-only";

import type Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStripeServer } from "@/lib/stripe/server";
import {
  getAgencyStandaloneCourse,
  grantLinkedAgencyCommunityGroupsServerSide,
  revokeLinkedAgencyCommunityAccessServerSide,
} from "@/lib/server/agency-standalone-course-service";
import type { StandaloneCoursePurchase } from "@/types/standalone-courses";

/**
 * Agency Standalone Course purchases — the agency-scope sibling of
 * standalone-course-purchase-service.ts. Stripe only (no PayPal branch):
 * PayPal was already the legacy/secondary path for tenant too ("the
 * instant-access path... replaces PayPal for the new signup popup" — see
 * that file's own comment), and the agency has no PayPal.me config
 * concept at all.
 *
 * Charges run on the platform's OWN shared Stripe account
 * (`getStripeServer()`, no `stripeAccount` override) — this is not a
 * workaround: it's the exact mechanism tenant course/offer checkout
 * already uses for the agency owner's own sub-account
 * (`stripeCourseCheckoutEnabledByAgency === true`, see
 * standalone-course-purchase-service.ts and AgencyDoc's — actually
 * SubAccountDoc's — own doc comment on that flag). A NATIVE agency
 * product has no "which OTHER party's funds might this misroute"
 * question that flag exists to guard against, so no gate is needed here
 * at all — defaulting straight to the shared account is correct by
 * construction, and it deposits into the exact same Stripe account the
 * agency owner already receives every other course/offer sale through.
 */

export const AGENCY_COURSE_CHARGE_KIND = "agencyCourseCharge";

function purchasesCol(agencyId: string, courseId: string) {
  return getAdminDb().collection(`agencies/${agencyId}/standaloneCourses/${courseId}/purchases`);
}

/** Start a Stripe embedded Checkout Session for a paid agency course.
 *  Mirrors `startStandaloneCourseStripeCheckoutServerSide` exactly, minus
 *  the Connect-account branch (irrelevant here — see this file's module
 *  comment). */
export async function startAgencyStandaloneCourseStripeCheckoutServerSide(opts: {
  agencyId: string;
  courseId: string;
  personId: string;
  personEmail: string;
  returnUrl: string;
}): Promise<{ clientSecret: string }> {
  const course = await getAgencyStandaloneCourse(opts.agencyId, opts.courseId);
  if (!course || course.access !== "purchase" || !course.priceCents) {
    throw new Error("This course isn't for sale.");
  }
  const amountCents = course.priceCents;
  const currency = course.currency ?? "USD";
  const isRecurring = course.billingType === "recurring";

  const stripe = getStripeServer();
  const metadata = {
    kind: AGENCY_COURSE_CHARGE_KIND,
    agencyId: opts.agencyId,
    courseId: opts.courseId,
    personId: opts.personId,
  };
  const session = await stripe.checkout.sessions.create(
    isRecurring
      ? {
          mode: "subscription",
          ui_mode: "embedded",
          customer_email: opts.personEmail,
          line_items: [
            {
              price_data: {
                currency,
                unit_amount: amountCents,
                product_data: { name: course.title },
                recurring: { interval: course.recurringInterval ?? "month" },
              },
              quantity: 1,
            },
          ],
          return_url: opts.returnUrl,
          metadata,
          subscription_data: { metadata, ...(course.trialDays ? { trial_period_days: course.trialDays } : {}) },
        }
      : {
          mode: "payment",
          ui_mode: "embedded",
          customer_email: opts.personEmail,
          line_items: [
            { price_data: { currency, unit_amount: amountCents, product_data: { name: course.title } }, quantity: 1 },
          ],
          return_url: opts.returnUrl,
          metadata,
          payment_intent_data: { metadata },
        },
  );
  if (!session.client_secret) throw new Error("Stripe did not return a client secret.");

  await purchasesCol(opts.agencyId, opts.courseId).add({
    agencyId: opts.agencyId,
    courseId: opts.courseId,
    memberId: opts.personId,
    amountCents,
    currency,
    method: "stripe",
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    status: "pending",
    grantedByUid: null,
    requestedAt: FieldValue.serverTimestamp(),
    paidAt: null,
  });

  return { clientSecret: session.client_secret };
}

export async function hasPaidAgencyStandaloneCourse(agencyId: string, courseId: string, personId: string): Promise<boolean> {
  const snap = await purchasesCol(agencyId, courseId).where("memberId", "==", personId).where("status", "==", "paid").limit(1).get();
  return !snap.empty;
}

/** For the owner-facing Purchases UI — see /agency/standalone-courses/
 *  [courseId]/purchases. Stripe only, so unlike tenant's PayPal-era list
 *  there's no "pending, needs manual mark-paid" bucket: every purchase
 *  here is either "pending" (checkout started, webhook hasn't landed yet)
 *  or a terminal Stripe-driven status. */
export async function listAgencyStandaloneCoursePurchases(agencyId: string, courseId: string): Promise<StandaloneCoursePurchase[]> {
  const snap = await purchasesCol(agencyId, courseId).orderBy("requestedAt", "desc").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StandaloneCoursePurchase, "id">) }));
}

/** Mark a purchase paid + grant classroom access — mirrors tenant
 *  `markStandaloneCoursePurchasePaidServerSide`, called only from the
 *  Stripe webhook (no manual "mark paid" — see this file's module
 *  comment; the standing instruction is explicit that this must never be
 *  simulated). */
export async function markAgencyStandaloneCoursePurchasePaidServerSide(opts: {
  agencyId: string;
  courseId: string;
  purchaseId: string;
  stripePaymentIntentId?: string | null;
  stripeCustomerId?: string | null;
}): Promise<{ ok: boolean }> {
  const ref = purchasesCol(opts.agencyId, opts.courseId).doc(opts.purchaseId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Purchase not found");
  const purchase = { id: snap.id, ...(snap.data() as Omit<StandaloneCoursePurchase, "id">) };
  if (purchase.status === "paid") return { ok: true };

  await ref.update({
    status: "paid",
    paidAt: FieldValue.serverTimestamp(),
    grantedByUid: null,
    ...(opts.stripePaymentIntentId !== undefined ? { stripePaymentIntentId: opts.stripePaymentIntentId } : {}),
    ...(opts.stripeCustomerId !== undefined ? { stripeCustomerId: opts.stripeCustomerId } : {}),
  });

  const courseRef = getAdminDb().doc(`agencies/${opts.agencyId}/standaloneCourses/${opts.courseId}`);
  const enrollRef = courseRef.collection("enrollments").doc(purchase.memberId);
  const existingEnroll = await enrollRef.get();
  await enrollRef.set(
    {
      memberId: purchase.memberId,
      courseId: opts.courseId,
      status: existingEnroll.exists ? (existingEnroll.data()!.status as string) : "enrolled",
      completedLessonIds: existingEnroll.data()?.completedLessonIds ?? [],
      progressPct: existingEnroll.data()?.progressPct ?? 0,
      enrolledAt: existingEnroll.data()?.enrolledAt ?? FieldValue.serverTimestamp(),
      completedAt: existingEnroll.data()?.completedAt ?? null,
    },
    { merge: true },
  );
  if (!existingEnroll.exists) {
    await courseRef.update({ enrollmentCount: FieldValue.increment(1) });
  }

  const personSnap = await getAdminDb().doc(`people/${purchase.memberId}`).get();
  await grantLinkedAgencyCommunityGroupsServerSide({
    agencyId: opts.agencyId,
    courseId: opts.courseId,
    personId: purchase.memberId,
    email: (personSnap.data()?.primaryEmail as string | undefined) ?? "",
    displayName: (personSnap.data()?.displayName as string | undefined) ?? null,
  });

  return { ok: true };
}

/** Stripe webhook: `checkout.session.completed` with `metadata.kind ===
 *  AGENCY_COURSE_CHARGE_KIND`. Mirrors tenant
 *  `handleStandaloneCourseCheckoutCompleted`. */
export async function handleAgencyStandaloneCourseCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const { agencyId, courseId } = session.metadata ?? {};
  if (!agencyId || !courseId) {
    console.error("[agency-standalone-course] agencyCourseCharge checkout completed without metadata");
    return;
  }
  const snap = await purchasesCol(agencyId, courseId).where("stripeCheckoutSessionId", "==", session.id).limit(1).get();
  if (snap.empty) {
    console.error(`[agency-standalone-course] no pending purchase for session ${session.id}`);
    return;
  }
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
  if (subscriptionId) {
    await snap.docs[0].ref.update({ stripeSubscriptionId: subscriptionId });
  }
  await markAgencyStandaloneCoursePurchasePaidServerSide({
    agencyId,
    courseId,
    purchaseId: snap.docs[0].id,
    stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
    stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
  });
}

/** Webhook: `customer.subscription.deleted` for an agency course sold as a
 *  recurring subscription. Mirrors tenant
 *  `handleStandaloneCourseSubscriptionDeleted` exactly, including the
 *  source-aware linked-Community-group revoke (see
 *  agency-community-access-source-service.ts) — only removes Community
 *  access this specific course granted; a person with any other access
 *  source (manual invite, another linked course, customer/affiliate/
 *  plan_cohort roster entry) keeps their membership untouched. */
export async function handleAgencyStandaloneCourseSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const { agencyId, courseId } = subscription.metadata ?? {};
  if (!agencyId || !courseId) return;
  const snap = await purchasesCol(agencyId, courseId).where("stripeSubscriptionId", "==", subscription.id).limit(1).get();
  if (snap.empty) return;
  const purchase = snap.docs[0].data() as Omit<StandaloneCoursePurchase, "id">;
  await snap.docs[0].ref.update({ status: "canceled" });
  await getAdminDb()
    .doc(`agencies/${agencyId}/standaloneCourses/${courseId}/enrollments/${purchase.memberId}`)
    .set({ accessExpiresAt: FieldValue.serverTimestamp() }, { merge: true });
  await revokeLinkedAgencyCommunityAccessServerSide({ agencyId, courseId, personId: purchase.memberId });
}

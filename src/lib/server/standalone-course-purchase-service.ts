import "server-only";

import type Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { buildPaypalAmountUrl } from "@/lib/paypal/payment-link";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import { getStripeServer } from "@/lib/stripe/server";
import { getStandaloneCourse } from "@/lib/server/standalone-course-service";
import type { StandaloneCoursePurchase } from "@/types/standalone-courses";
import type { PayPalConfig } from "@/types";

/**
 * One-time purchases for a standalone course — PayPal (v1, manual-reconcile)
 * and Stripe (instant, webhook-granted). Forked from
 * `community-purchase-service.ts`, simplified: no `scope`/`groupId`
 * discriminator since every purchase here IS a course purchase.
 */

/** Checkout-session metadata discriminator, mirroring SUB_ACCOUNT_CHARGE_KIND. */
export const COURSE_CHARGE_KIND = "courseCharge";

function purchasesCol(saId: string, courseId: string) {
  return getAdminDb().collection(
    `subAccounts/${saId}/standaloneCourses/${courseId}/purchases`,
  );
}

export interface RequestStandaloneCoursePurchaseResult {
  purchaseId: string;
  paypalUrl: string;
  status: StandaloneCoursePurchase["status"];
}

export async function requestStandaloneCoursePurchaseServerSide(opts: {
  subAccountId: string;
  courseId: string;
  memberId: string;
}): Promise<RequestStandaloneCoursePurchaseResult> {
  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${opts.subAccountId}`).get();
  const sub = subSnap.data();
  const paypal = sub?.paypalConfig as PayPalConfig | null | undefined;
  if (!paypal?.username) {
    throw new Error(
      "This course hasn't set up payments yet. Contact the course owner.",
    );
  }
  const agencyId = (sub?.agencyId as string) ?? "";

  const course = await getStandaloneCourse(opts.subAccountId, opts.courseId);
  if (!course || course.access !== "purchase" || !course.priceCents) {
    throw new Error("This course isn't for sale.");
  }
  const amountCents = course.priceCents;
  const currency = course.currency ?? "USD";

  // Idempotent: reuse an open pending purchase for the same member.
  const existing = await purchasesCol(opts.subAccountId, opts.courseId)
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

  const ref = await purchasesCol(opts.subAccountId, opts.courseId).add({
    subAccountId: opts.subAccountId,
    agencyId,
    courseId: opts.courseId,
    memberId: opts.memberId,
    amountCents,
    currency,
    method: "paypal",
    paypalUrl,
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    status: "pending",
    grantedByUid: null,
    requestedAt: FieldValue.serverTimestamp(),
    paidAt: null,
  });

  return { purchaseId: ref.id, paypalUrl, status: "pending" };
}

/**
 * Start a Stripe embedded Checkout Session for a paid course — the instant-
 * access path (replaces PayPal for the new signup popup). `mode:"payment"`
 * with ad-hoc `price_data`, no pre-existing Stripe Price object, mirroring
 * `createChargeCheckoutSession` in `billing-service.ts`. A fresh pending
 * purchase doc is created per attempt (not reused) so the webhook can look it
 * up unambiguously by `stripeCheckoutSessionId` even if the buyer reopens the
 * modal and starts a second checkout.
 */
export async function startStandaloneCourseStripeCheckoutServerSide(opts: {
  subAccountId: string;
  courseId: string;
  memberId: string;
  memberEmail: string;
  returnUrl: string;
}): Promise<{ clientSecret: string }> {
  const course = await getStandaloneCourse(opts.subAccountId, opts.courseId);
  if (!course || course.access !== "purchase" || !course.priceCents) {
    throw new Error("This course isn't for sale.");
  }
  const subSnap = await getAdminDb().doc(`subAccounts/${opts.subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? "";
  const amountCents = course.priceCents;
  const currency = course.currency ?? "USD";

  const stripe = getStripeServer();
  const metadata = {
    kind: COURSE_CHARGE_KIND,
    subAccountId: opts.subAccountId,
    courseId: opts.courseId,
    memberId: opts.memberId,
  };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ui_mode: "embedded",
    customer_email: opts.memberEmail,
    line_items: [
      {
        price_data: {
          currency,
          unit_amount: amountCents,
          product_data: { name: course.title },
        },
        quantity: 1,
      },
    ],
    return_url: opts.returnUrl,
    metadata,
    payment_intent_data: { metadata },
  });
  if (!session.client_secret) {
    throw new Error("Stripe did not return a client secret.");
  }

  await purchasesCol(opts.subAccountId, opts.courseId).add({
    subAccountId: opts.subAccountId,
    agencyId,
    courseId: opts.courseId,
    memberId: opts.memberId,
    amountCents,
    currency,
    method: "stripe",
    paypalUrl: null,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: null,
    status: "pending",
    grantedByUid: null,
    requestedAt: FieldValue.serverTimestamp(),
    paidAt: null,
  });

  return { clientSecret: session.client_secret };
}

/** Has this member paid for this course? (Drives the classroom unlock check.) */
export async function hasPaidStandaloneCourse(
  saId: string,
  courseId: string,
  memberId: string,
): Promise<boolean> {
  const snap = await purchasesCol(saId, courseId)
    .where("memberId", "==", memberId)
    .where("status", "==", "paid")
    .limit(1)
    .get();
  return !snap.empty;
}

/**
 * Mark a purchase paid, grant classroom access (upsert the enrollment doc so
 * it's immediate), and bump the denormalized enrollment count. Called from
 * two places: staff clicking "Mark as paid" on a pending PayPal purchase
 * (`grantedByUid` = the staff uid), and the Stripe webhook the instant a
 * charge succeeds (`grantedByUid: null` = automated). Both share this one
 * idempotency guard + grant logic so a future fix can't land in only one copy.
 */
export async function markStandaloneCoursePurchasePaidServerSide(opts: {
  subAccountId: string;
  courseId: string;
  purchaseId: string;
  grantedByUid: string | null;
  stripePaymentIntentId?: string | null;
}): Promise<{ ok: boolean }> {
  const ref = purchasesCol(opts.subAccountId, opts.courseId).doc(
    opts.purchaseId,
  );
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Purchase not found");
  const purchase = {
    id: snap.id,
    ...(snap.data() as Omit<StandaloneCoursePurchase, "id">),
  };
  if (purchase.status === "paid") return { ok: true };

  await ref.update({
    status: "paid",
    paidAt: FieldValue.serverTimestamp(),
    grantedByUid: opts.grantedByUid,
    ...(opts.stripePaymentIntentId !== undefined
      ? { stripePaymentIntentId: opts.stripePaymentIntentId }
      : {}),
  });

  const courseRef = getAdminDb().doc(
    `subAccounts/${opts.subAccountId}/standaloneCourses/${opts.courseId}`,
  );
  const enrollRef = courseRef.collection("enrollments").doc(purchase.memberId);
  const existingEnroll = await enrollRef.get();
  await enrollRef.set(
    {
      memberId: purchase.memberId,
      courseId: opts.courseId,
      status: existingEnroll.exists
        ? (existingEnroll.data()!.status as string)
        : "enrolled",
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

  void emitWebhookEvent({
    subAccountId: opts.subAccountId,
    agencyId: purchase.agencyId,
    mode: "live",
    type: "course.purchase.paid",
    payload: {
      purchaseId: purchase.id,
      courseId: opts.courseId,
      memberId: purchase.memberId,
      amountCents: purchase.amountCents,
      currency: purchase.currency,
    },
  });

  return { ok: true };
}

/**
 * Stripe webhook: `checkout.session.completed` with `metadata.kind ===
 * COURSE_CHARGE_KIND`. Looks up the pending purchase doc this session
 * created (by `stripeCheckoutSessionId`, stamped at checkout-creation time)
 * and grants access via the same path staff's "Mark as paid" uses. The
 * idempotency guard lives inside `markStandaloneCoursePurchasePaidServerSide`
 * — Stripe retries webhooks, so this can safely run more than once.
 */
export async function handleStandaloneCourseCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const { subAccountId, courseId } = session.metadata ?? {};
  if (!subAccountId || !courseId) {
    console.error(
      "[standalone-course] courseCharge checkout completed without metadata",
    );
    return;
  }
  const snap = await purchasesCol(subAccountId, courseId)
    .where("stripeCheckoutSessionId", "==", session.id)
    .limit(1)
    .get();
  if (snap.empty) {
    console.error(
      `[standalone-course] no pending purchase for session ${session.id}`,
    );
    return;
  }
  await markStandaloneCoursePurchasePaidServerSide({
    subAccountId,
    courseId,
    purchaseId: snap.docs[0].id,
    grantedByUid: null,
    stripePaymentIntentId:
      typeof session.payment_intent === "string" ? session.payment_intent : null,
  });
}

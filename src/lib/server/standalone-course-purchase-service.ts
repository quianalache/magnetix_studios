import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { buildPaypalAmountUrl } from "@/lib/paypal/payment-link";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import { getStandaloneCourse } from "@/lib/server/standalone-course-service";
import type { StandaloneCoursePurchase } from "@/types/standalone-courses";
import type { PayPalConfig } from "@/types";

/**
 * One-time PayPal purchases for a standalone course. Forked from
 * `community-purchase-service.ts`, simplified: no `scope`/`groupId`
 * discriminator since every purchase here IS a course purchase. v1 is
 * manual-reconcile — same as every other PayPal.me flow in this codebase.
 */

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
    paypalUrl,
    status: "pending",
    grantedByUid: null,
    requestedAt: FieldValue.serverTimestamp(),
    paidAt: null,
  });

  return { purchaseId: ref.id, paypalUrl, status: "pending" };
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
 * Staff: mark a purchase paid, grant classroom access (upsert the enrollment
 * doc so it's immediate), and bump the denormalized enrollment count.
 */
export async function markStandaloneCoursePurchasePaidServerSide(opts: {
  subAccountId: string;
  courseId: string;
  purchaseId: string;
  grantedByUid: string;
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

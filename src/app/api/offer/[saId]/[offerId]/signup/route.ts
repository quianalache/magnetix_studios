import "server-only";

import { NextResponse } from "next/server";
import { getStandaloneCoursesGate } from "@/lib/standalone-courses/gate";
import { getCourseOffer } from "@/lib/server/course-offer-service";
import { getStandaloneEnrollment } from "@/lib/server/standalone-course-service";
import {
  enrollAllCoursesForFreeOfferServerSide,
  hasPaidCourseOffer,
  startCourseOfferStripeCheckoutServerSide,
} from "@/lib/server/course-offer-purchase-service";
import { ensureMember } from "@/lib/community/member-account";
import { signMemberSessionToken } from "@/lib/community/member-auth";
import { setMemberSessionCookie } from "@/lib/community/member-session";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Instant signup + enroll/purchase for a Course Offer — mirrors
 * `/api/course/[saId]/[courseId]/signup`. Free offers enroll in every
 * attached course instantly; paid offers (one-time or recurring) start a
 * Stripe embedded Checkout session.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string; offerId: string }> },
) {
  const { saId, offerId } = await params;

  const gate = await getStandaloneCoursesGate(saId);
  if (!gate || !gate.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const offer = await getCourseOffer(saId, offerId);
  if (!offer || offer.visibility !== "published") {
    return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    email?: string;
    phone?: string;
  } | null;
  const name = body?.name?.trim() ?? "";
  const email = body?.email?.trim().toLowerCase() ?? "";
  const phone = body?.phone?.trim() ?? "";
  if (!name || !EMAIL_RE.test(email) || !phone) {
    return NextResponse.json(
      { error: "Name, email, and phone are all required." },
      { status: 400 },
    );
  }

  const member = await ensureMember({
    subAccountId: saId,
    email,
    displayName: name,
    phone,
    source: "course",
  });

  const token = signMemberSessionToken(saId, member.id, member.email);
  await setMemberSessionCookie(token);

  const firstCourseId = offer.courseIds[0];
  const classroomUrl = `/course/${saId}/${firstCourseId}/classroom`;

  // Already enrolled in the bundle's first course (repeat free-join, or a
  // returning paid buyer) — skip straight in, never double-charge.
  const existingEnrollment = firstCourseId
    ? await getStandaloneEnrollment(saId, firstCourseId, member.id)
    : null;
  const alreadyPaid = await hasPaidCourseOffer(saId, offerId, member.id);
  if (existingEnrollment || alreadyPaid) {
    return NextResponse.json({ ok: true, mode: "free", redirectTo: classroomUrl });
  }

  if (offer.type === "free") {
    await enrollAllCoursesForFreeOfferServerSide({
      subAccountId: saId,
      agencyId: gate.agencyId,
      courseIds: offer.courseIds,
      memberId: member.id,
    });
    return NextResponse.json({ ok: true, mode: "free", redirectTo: classroomUrl });
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const returnUrl = `${appUrl}/offer/${saId}/${offerId}/purchase-complete?session_id={CHECKOUT_SESSION_ID}`;
    const { clientSecret } = await startCourseOfferStripeCheckoutServerSide({
      subAccountId: saId,
      offerId,
      memberId: member.id,
      memberEmail: member.email,
      returnUrl,
    });
    return NextResponse.json({ ok: true, mode: "paid", clientSecret });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't start checkout" },
      { status: 400 },
    );
  }
}

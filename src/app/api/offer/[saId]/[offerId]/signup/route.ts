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
import { normalizeAttribution } from "@/lib/attribution";
import { bumpAttributionVisit } from "@/lib/attribution-visits";
import type { ContactAttribution } from "@/types/contacts";

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
    address?: string;
    serviceAgreementAccepted?: boolean;
    attribution?: Partial<ContactAttribution>;
  } | null;
  const name = body?.name?.trim() ?? "";
  const email = body?.email?.trim().toLowerCase() ?? "";
  const phone = body?.phone?.trim() ?? "";
  const address = body?.address?.trim() ?? "";
  const attribution = normalizeAttribution(body?.attribution);
  const { collectPhoneNumber, collectAddress, serviceAgreement } =
    offer.checkoutSettings;

  if (!name || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Name and email are required." },
      { status: 400 },
    );
  }
  if (collectPhoneNumber && !phone) {
    return NextResponse.json(
      { error: "Phone number is required." },
      { status: 400 },
    );
  }
  if (collectAddress && !address) {
    return NextResponse.json(
      { error: "Address is required." },
      { status: 400 },
    );
  }
  if (serviceAgreement.mode !== "notRequired" && !body?.serviceAgreementAccepted) {
    return NextResponse.json(
      { error: "You must agree to the terms before continuing." },
      { status: 400 },
    );
  }

  const member = await ensureMember({
    subAccountId: saId,
    email,
    displayName: name,
    phone: collectPhoneNumber ? phone : null,
    address: collectAddress ? address : null,
    source: "course",
    attribution,
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
      offerTitle: offer.title,
      booking: offer.booking,
    });
    // Free offers have no purchase doc — the visit rollup + Contact are the
    // only places this conversion is recorded.
    if (attribution) {
      void bumpAttributionVisit({
        subAccountId: saId,
        agencyId: gate.agencyId,
        pageType: "offer",
        pageId: offerId,
        attribution,
        field: "conversions",
      }).catch((err) => console.warn("[offer/signup] attribution bump failed", err));
    }
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
      attribution,
    });
    return NextResponse.json({ ok: true, mode: "paid", clientSecret });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't start checkout" },
      { status: 400 },
    );
  }
}

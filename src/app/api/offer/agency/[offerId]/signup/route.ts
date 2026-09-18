import "server-only";

import { NextResponse } from "next/server";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import { getAgencyCourseOffer } from "@/lib/server/agency-course-offer-service";
import { getAgencyStandaloneEnrollment } from "@/lib/server/agency-standalone-course-service";
import {
  enrollAllCoursesForFreeAgencyOfferServerSide,
  hasPaidAgencyCourseOffer,
  startAgencyCourseOfferStripeCheckoutServerSide,
} from "@/lib/server/agency-course-offer-purchase-service";
import { ensurePersonIdentity } from "@/lib/server/person-identity-service";
import { signPersonSessionToken } from "@/lib/server/person-auth";
import { setPersonSessionCookie } from "@/lib/server/person-session";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Instant signup + enroll/purchase for an Agency Course Offer — mirrors
 *  /api/offer/[saId]/[offerId]/signup with the global Person/MyMagnetix
 *  identity substituted for a tenant Member. Phone/address/service-
 *  agreement are the SAME `offer.checkoutSettings` tenant Offers already
 *  use (2026-09-18 parity pass) — collected here, validated the same way,
 *  and persisted onto the purchase record itself for a paid checkout (see
 *  `CourseOfferPurchase.buyerPhone`/`buyerAddress`'s own doc comment for
 *  why there, not on the Person doc). A free offer has no purchase doc
 *  (matches tenant), so phone/address are still validated but have no
 *  natural place to persist — a small, disclosed, non-blocking gap. */
export async function POST(request: Request, { params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;

  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const offer = await getAgencyCourseOffer(agencyId, offerId);
  if (!offer || offer.visibility !== "published") {
    return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    serviceAgreementAccepted?: boolean;
  } | null;
  const name = body?.name?.trim() ?? "";
  const email = body?.email?.trim().toLowerCase() ?? "";
  const phone = body?.phone?.trim() ?? "";
  const address = body?.address?.trim() ?? "";
  const { collectPhoneNumber, collectAddress, serviceAgreement } = offer.checkoutSettings;

  if (!name || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
  }
  if (collectPhoneNumber && !phone) {
    return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
  }
  if (collectAddress && !address) {
    return NextResponse.json({ error: "Address is required." }, { status: 400 });
  }
  if (serviceAgreement.mode !== "notRequired" && !body?.serviceAgreementAccepted) {
    return NextResponse.json({ error: "You must agree to the terms before continuing." }, { status: 400 });
  }

  const personId = await ensurePersonIdentity(email);
  const token = signPersonSessionToken(personId, email);
  await setPersonSessionCookie(token);

  const firstCourseId = offer.courseIds[0];
  const successUrl = firstCourseId ? `/course/agency/${firstCourseId}/classroom` : "/my";

  const existingEnrollment = firstCourseId ? await getAgencyStandaloneEnrollment(agencyId, firstCourseId, personId) : null;
  const alreadyPaid = await hasPaidAgencyCourseOffer(agencyId, offerId, personId);
  if (existingEnrollment || alreadyPaid) {
    return NextResponse.json({ ok: true, mode: "free", redirectTo: successUrl });
  }

  if (offer.type === "free") {
    await enrollAllCoursesForFreeAgencyOfferServerSide({ agencyId, courseIds: offer.courseIds, personId, email, displayName: name });
    return NextResponse.json({ ok: true, mode: "free", redirectTo: successUrl });
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const returnUrl = `${appUrl}/offer/agency/${offerId}/purchase-complete?session_id={CHECKOUT_SESSION_ID}`;
    const { clientSecret } = await startAgencyCourseOfferStripeCheckoutServerSide({
      agencyId,
      offerId,
      personId,
      personEmail: email,
      personName: name,
      personPhone: phone || null,
      personAddress: address || null,
      returnUrl,
    });
    return NextResponse.json({ ok: true, mode: "paid", clientSecret });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't start checkout" }, { status: 400 });
  }
}

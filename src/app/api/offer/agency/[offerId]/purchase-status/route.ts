import "server-only";

import { NextResponse } from "next/server";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import { getCurrentPerson } from "@/lib/server/person-session";
import { hasPaidAgencyCourseOffer } from "@/lib/server/agency-course-offer-purchase-service";
import { getAgencyCourseOffer } from "@/lib/server/agency-course-offer-service";
import { getPublishedAgencyOneClickUpsell } from "@/lib/server/agency-course-offer-upsell-service";

export const dynamic = "force-dynamic";

/** Polled by the offer's purchase-complete page while it waits for the
 *  Stripe webhook to grant access — mirrors tenant's own route, including
 *  the One-Click Upsell interstitial check (2026-09-18 parity pass). */
export async function GET(_request: Request, { params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;
  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const paid = await hasPaidAgencyCourseOffer(agencyId, offerId, person.id);
  if (!paid) return NextResponse.json({ paid: false });

  const upsell = await getPublishedAgencyOneClickUpsell(agencyId, offerId);
  if (!upsell) return NextResponse.json({ paid: true, oneClickUpsell: null });
  const targetOffer = await getAgencyCourseOffer(agencyId, upsell.targetOfferId);
  return NextResponse.json({
    paid: true,
    oneClickUpsell: {
      id: upsell.id,
      targetOfferId: upsell.targetOfferId,
      targetTitle: targetOffer?.title ?? "this offer",
      targetPriceCents: targetOffer?.priceCents ?? null,
      targetCurrency: targetOffer?.currency ?? "USD",
    },
  });
}

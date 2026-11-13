import "server-only";

import { NextResponse } from "next/server";
import { requireOfferApiAccess } from "@/lib/course-offers/offer-access";
import {
  getOneClickUpsellForOffer,
} from "@/lib/server/course-offer-upsell-service";
import { hasPaidCourseOffer } from "@/lib/server/course-offer-purchase-service";
import { getCourseOffer } from "@/lib/server/course-offer-service";

export const dynamic = "force-dynamic";

/**
 * Polled by the offer's `purchase-complete` page while it waits for the
 * Stripe webhook to grant access. Mirrors
 * `/api/course/[saId]/[courseId]/purchase-status`, plus reports whether a
 * One-Click Upsell interstitial should show next.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ saId: string; offerId: string }> },
) {
  const { saId, offerId } = await params;
  const access = await requireOfferApiAccess(saId, offerId, { historical: true });
  if (access.kind === "error") {
    return NextResponse.json(
      { error: access.message },
      { status: access.status },
    );
  }
  const paid = await hasPaidCourseOffer(saId, offerId, access.member.id);
  if (!paid) return NextResponse.json({ paid: false });

  // Archived offers keep their purchase status, but never sell anything new:
  // no upsell from an archived offer, and never TO a non-published one.
  const oneClickUpsell = access.offer.visibility === "published" ? await getOneClickUpsellForOffer(saId, offerId) : null;
  const targetOffer = oneClickUpsell ? await getCourseOffer(saId, oneClickUpsell.targetOfferId) : null;
  if (!oneClickUpsell || targetOffer?.visibility !== "published") {
    return NextResponse.json({ paid: true, oneClickUpsell: null });
  }
  return NextResponse.json({
    paid: true,
    oneClickUpsell: {
      id: oneClickUpsell.id,
      targetOfferId: oneClickUpsell.targetOfferId,
      targetTitle: targetOffer?.title ?? "this offer",
      targetPriceCents: targetOffer?.priceCents ?? null,
      targetCurrency: targetOffer?.currency ?? "USD",
      targetRecurring: targetOffer?.type === "recurring",
    },
  });
}

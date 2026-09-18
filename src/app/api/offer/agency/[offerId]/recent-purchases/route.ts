import "server-only";

import { NextResponse } from "next/server";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import { getAdminDb } from "@/lib/firebase/admin";
import type { CourseOffer, CourseOfferPurchase } from "@/types/course-offers";

export const dynamic = "force-dynamic";

const LIMIT = 8;

interface RecentPurchaseDto {
  firstName: string;
  location: string | null;
  purchasedAt: string;
}

/**
 * Public feed for the Agency Course Offer's opt-in "recent purchases"
 * checkout popup — the agency sibling of
 * /api/offer/[saId]/[offerId]/recent-purchases. Same privacy contract:
 * first name + city/country + timestamp only, never email/phone/address/
 * personId. Sourced entirely from the purchase record itself
 * (`buyerDisplayName`/`billingCity`/`billingState`/`billingCountry`,
 * captured at checkout — see agency-course-offer-purchase-service.ts) —
 * agency has no Member/Contact to join against, unlike the tenant route.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await ctx.params;
  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) return NextResponse.json({ purchases: [] });

  const db = getAdminDb();
  const offerSnap = await db.doc(`agencies/${agencyId}/courseOffers/${offerId}`).get();
  if (!offerSnap.exists) return NextResponse.json({ purchases: [] });
  const offer = offerSnap.data() as CourseOffer;
  if (offer.showRecentPurchasePopup !== true) return NextResponse.json({ purchases: [] });

  const purchasesSnap = await db
    .collection(`agencies/${agencyId}/courseOffers/${offerId}/purchases`)
    .where("status", "==", "paid")
    .orderBy("paidAt", "desc")
    .limit(LIMIT)
    .get();

  const out: RecentPurchaseDto[] = purchasesSnap.docs.map((d) => {
    const purchase = d.data() as CourseOfferPurchase;
    const fullName = purchase.buyerDisplayName?.trim() || "";
    const firstName = fullName.split(/\s+/)[0] || "Someone";

    const city = purchase.billingCity?.trim() || "";
    const state = purchase.billingState?.trim() || "";
    const country = purchase.billingCountry?.trim() || "";
    const location = [city, state || country].filter(Boolean).join(", ") || null;

    const paidAtMs =
      purchase.paidAt && typeof (purchase.paidAt as { toMillis?: () => number }).toMillis === "function"
        ? (purchase.paidAt as { toMillis: () => number }).toMillis()
        : Date.now();

    return { firstName, location, purchasedAt: new Date(paidAtMs).toISOString() };
  });

  return NextResponse.json({ purchases: out });
}

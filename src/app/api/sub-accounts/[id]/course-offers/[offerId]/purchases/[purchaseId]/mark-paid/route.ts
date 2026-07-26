import "server-only";

import { NextResponse } from "next/server";
import { requireCourseOffersStaff } from "@/lib/course-offers/staff-guard";
import { markCourseOfferPurchasePaidServerSide } from "@/lib/server/course-offer-purchase-service";

export const dynamic = "force-dynamic";

/** Staff: mark a pending Offer purchase (PayPal rail) paid and grant access. */
export async function POST(
  request: Request,
  ctx: {
    params: Promise<{ id: string; offerId: string; purchaseId: string }>;
  },
) {
  const { id: subAccountId, offerId, purchaseId } = await ctx.params;
  const access = await requireCourseOffersStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  try {
    await markCourseOfferPurchasePaidServerSide({
      subAccountId,
      offerId,
      purchaseId,
      grantedByUid: access.uid,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't mark paid" },
      { status: 400 },
    );
  }
}

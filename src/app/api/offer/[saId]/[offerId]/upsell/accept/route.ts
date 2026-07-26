import "server-only";

import { NextResponse } from "next/server";
import { requireOfferApiAccess } from "@/lib/course-offers/offer-access";
import {
  chargeOneClickUpsellServerSide,
  getPaidPurchaseIdForMember,
} from "@/lib/server/course-offer-purchase-service";

export const dynamic = "force-dynamic";

/**
 * Member: accept the One-Click Upsell interstitial shown right after
 * purchasing `[offerId]` (the trigger offer). Charges the saved payment
 * method off-session for the target offer — no second checkout form.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string; offerId: string }> },
) {
  const { saId, offerId } = await params;
  const access = await requireOfferApiAccess(saId, offerId);
  if (access.kind === "error") {
    return NextResponse.json(
      { error: access.message },
      { status: access.status },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    targetOfferId?: string;
  } | null;
  if (!body?.targetOfferId) {
    return NextResponse.json({ error: "Missing targetOfferId" }, { status: 400 });
  }

  const triggerPurchaseId = await getPaidPurchaseIdForMember(
    saId,
    offerId,
    access.member.id,
  );
  if (!triggerPurchaseId) {
    return NextResponse.json(
      { error: "No purchase found for this offer" },
      { status: 400 },
    );
  }

  const result = await chargeOneClickUpsellServerSide({
    subAccountId: saId,
    triggerOfferId: offerId,
    triggerPurchaseId,
    targetOfferId: body.targetOfferId,
    memberId: access.member.id,
  });
  return NextResponse.json(result);
}

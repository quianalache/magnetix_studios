import { NextResponse } from "next/server";
import { requireOfferApiAccess } from "@/lib/course-offers/offer-access";
import { requestCourseOfferPaypalServerSide } from "@/lib/server/course-offer-purchase-service";

export const dynamic = "force-dynamic";

/**
 * Member: start a PayPal purchase for a Course Offer. Returns the paypal.me
 * URL to pay at; access is granted when a staff admin marks the purchase
 * paid. Mirrors `/api/course/[saId]/[courseId]/purchase`.
 */
export async function POST(
  _request: Request,
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

  try {
    const result = await requestCourseOfferPaypalServerSide({
      subAccountId: saId,
      offerId,
      memberId: access.member.id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't start purchase" },
      { status: 400 },
    );
  }
}

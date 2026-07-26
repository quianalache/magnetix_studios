import "server-only";

import { NextResponse } from "next/server";
import { requireCourseOffersStaff } from "@/lib/course-offers/staff-guard";
import { createCourseOfferUpsellServerSide } from "@/lib/server/course-offer-upsell-service";
import type { UpsellType } from "@/types/course-offers";

export const dynamic = "force-dynamic";

/** Staff: attach an upsell to an offer. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; offerId: string }> },
) {
  const { id: subAccountId, offerId } = await ctx.params;
  const access = await requireCourseOffersStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { type?: UpsellType; targetOfferId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.type !== "oneClick" && body.type !== "inApp") {
    return NextResponse.json({ error: "Invalid upsell type" }, { status: 400 });
  }
  if (!body.targetOfferId) {
    return NextResponse.json(
      { error: "Choose an offer to upsell" },
      { status: 400 },
    );
  }

  try {
    const upsell = await createCourseOfferUpsellServerSide({
      subAccountId,
      offerId,
      type: body.type,
      targetOfferId: body.targetOfferId,
    });
    return NextResponse.json({ ok: true, upsell });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't add upsell" },
      { status: 400 },
    );
  }
}

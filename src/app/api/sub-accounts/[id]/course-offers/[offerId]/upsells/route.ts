import "server-only";

import { NextResponse } from "next/server";
import { requireCourseOffersStaff } from "@/lib/course-offers/staff-guard";

export const dynamic = "force-dynamic";

/** Staff: attach an upsell to an offer. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; offerId: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireCourseOffersStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  return NextResponse.json(
    { error: "Legacy Offer Upsells are frozen. Create an Upsell step in Pages & Funnels instead." },
    { status: 410 },
  );
}
